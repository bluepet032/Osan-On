from __future__ import annotations

import gzip
import json
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from urllib.parse import unquote, urlsplit
from urllib.robotparser import RobotFileParser


ROBOTS_AGENT = "QuestBoard"
USER_AGENT = f"{ROBOTS_AGENT}/1.0 (+https://github.com/bluepet032/QuestBoard; public-opportunity-index)"
MIN_HOST_INTERVAL = 1.0
MAX_RETRY_AFTER = 30.0


class FetchError(RuntimeError):
    pass


class RobotsDisallowed(FetchError):
    pass


class RobotsUnavailable(RobotsDisallowed):
    """robots.txt could not be read (timeout or 5xx), so the host is treated as off limits."""


@dataclass(slots=True)
class Response:
    url: str
    status: int
    text: str
    content_type: str


# Shared across collectors in one pipeline run: robots.txt is read once per host and
# requests to the same host are spaced out even when several collectors use it.
_robots: dict[str, RobotFileParser] = {}
# Hosts whose robots.txt could not be read, with the reason, for a clear error message.
_robots_unavailable: dict[str, str] = {}
# Allow/Disallow rules that apply to us, per host (see robots_rules).
_robots_rules: dict[str, list[tuple[str, bool]]] = {}
_last_request: dict[str, float] = {}


def reset_host_state() -> None:
    _robots.clear()
    _robots_unavailable.clear()
    _robots_rules.clear()
    _last_request.clear()


def robots_rules(lines: list[str]) -> list[tuple[str, bool]]:
    """RFC 9309 groups: the rules of groups naming our agent, else of the ``*`` groups.

    Rules are read here instead of through ``RobotFileParser``: before Python 3.14.8 it ignores
    ``*`` and ``$`` (so ``Disallow: /kocca/*/list.do`` never matched), and 3.14.8 rewrote its
    internals. Only its public ``crawl_delay`` is still used.
    """

    groups: list[tuple[set[str], list[tuple[str, bool]]]] = []
    reading_agents = False
    for line in lines:
        key, _, value = line.split("#", 1)[0].partition(":")
        key, value = key.strip().lower(), value.strip()
        if key == "user-agent":
            if not reading_agents:
                groups.append((set(), []))
                reading_agents = True
            groups[-1][0].add(value.lower())
        elif key:
            reading_agents = False
            if key in {"allow", "disallow"} and value and groups:
                groups[-1][1].append((value, key == "allow"))
    agent = ROBOTS_AGENT.lower()
    chosen = [rules for agents, rules in groups if agent in agents] or [rules for agents, rules in groups if "*" in agents]
    return [rule for rules in chosen for rule in rules]


def robots_allows(robots: RobotFileParser, url: str) -> bool:
    """RFC 9309 matching: ``*`` and ``$`` wildcards, the longest rule wins, Allow wins ties."""

    if robots.disallow_all:
        return False
    if robots.allow_all:
        return True
    parts = urlsplit(url)
    target = unquote(parts.path or "/") + (f"?{unquote(parts.query)}" if parts.query else "")
    best = (-1, True)
    for path, allowed in _robots_rules.get(f"{parts.scheme}://{parts.netloc}", []):
        pattern = re.escape(unquote(path)).replace(r"\*", ".*")
        if pattern.endswith(r"\$"):
            pattern = pattern[:-2] + "$"
        if re.match(pattern, target, re.DOTALL):
            best = max(best, (len(path), allowed))
    return best[1]


def retry_after_seconds(value: str | None) -> float | None:
    try:
        return max(0.0, float(value)) if value else None
    except ValueError:
        return None


class HttpClient:
    def __init__(self, timeout: float = 20.0, retries: int = 3, delay: float = 0.4,
                 min_interval: float = MIN_HOST_INTERVAL, respect_robots: bool = True):
        self.timeout = timeout
        self.retries = retries
        self.delay = delay
        self.min_interval = min_interval
        self.respect_robots = respect_robots

    def get(self, url: str, headers: dict[str, str] | None = None) -> Response:
        return self._request(url, headers=headers)

    def post_json(self, url: str, payload: dict, headers: dict[str, str] | None = None) -> Response:
        request_headers = {"Content-Type": "application/json; charset=utf-8"}
        if headers:
            request_headers.update(headers)
        return self._request(url, headers=request_headers, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"))

    def _robots_for(self, url: str) -> RobotFileParser:
        parts = urlsplit(url)
        host = f"{parts.scheme}://{parts.netloc}"
        if host in _robots:
            return _robots[host]
        parser = RobotFileParser()
        reason = "응답 없음"
        # Retried like any request: one slow answer from overseas CI runners should not
        # switch a whole source off for the day.
        for attempt in range(self.retries):
            try:
                self._wait_for_host(f"{host}/robots.txt", 0)
                response = self._send(f"{host}/robots.txt", {"User-Agent": USER_AGENT})
                lines = response.text.splitlines()
                parser.parse(lines)
                _robots_rules[host] = robots_rules(lines)
                break
            except urllib.error.HTTPError as error:
                # RFC 9309: a 4xx robots.txt means no restrictions; 5xx means assume full disallow.
                if error.code < 500:
                    parser.allow_all = True
                    break
                reason = f"HTTP {error.code}"
            except (urllib.error.URLError, TimeoutError) as error:
                reason = str(getattr(error, "reason", error))
            if attempt + 1 < self.retries:
                time.sleep(self.delay * (2**attempt))
        else:
            parser.disallow_all = True
            _robots_unavailable[host] = reason
        _robots[host] = parser
        return parser

    def _wait_for_host(self, url: str, crawl_delay: float) -> None:
        host = urlsplit(url).netloc
        interval = max(self.min_interval, crawl_delay)
        elapsed = time.monotonic() - _last_request.get(host, float("-inf"))
        if elapsed < interval:
            time.sleep(interval - elapsed)
        _last_request[host] = time.monotonic()

    def _send(self, url: str, headers: dict[str, str], data: bytes | None = None) -> Response:
        request = urllib.request.Request(url, headers=headers, data=data)
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            payload = response.read()
            if response.headers.get("Content-Encoding") == "gzip":
                payload = gzip.decompress(payload)
            charset = response.headers.get_content_charset() or "utf-8"
            try:
                text = payload.decode(charset, errors="replace")
            except LookupError:
                text = payload.decode("utf-8", errors="replace")
            return Response(
                url=response.geturl(),
                status=response.status,
                text=text,
                content_type=response.headers.get_content_type(),
            )

    def _request(self, url: str, headers: dict[str, str] | None = None, data: bytes | None = None) -> Response:
        request_headers = {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/json,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Encoding": "gzip",
        }
        if headers:
            request_headers.update(headers)

        crawl_delay = 0.0
        if self.respect_robots:
            robots = self._robots_for(url)
            if not robots_allows(robots, url):
                parts = urlsplit(url)
                reason = _robots_unavailable.get(f"{parts.scheme}://{parts.netloc}")
                if reason:
                    raise RobotsUnavailable(f"robots.txt를 확인하지 못해 수집하지 않았습니다 ({reason}, {url})")
                raise RobotsDisallowed(f"robots.txt가 수집을 허용하지 않습니다 ({url})")
            crawl_delay = float(robots.crawl_delay(ROBOTS_AGENT) or 0)

        last_error: Exception | None = None
        for attempt in range(self.retries):
            self._wait_for_host(url, crawl_delay)
            try:
                return self._send(url, request_headers, data)
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
                last_error = error
                is_http = isinstance(error, urllib.error.HTTPError)
                retryable = not is_http or error.code >= 500 or error.code == 429
                if not retryable or attempt + 1 >= self.retries:
                    break
                wait = self.delay * (2**attempt)
                if is_http and error.code in {429, 503}:
                    requested = retry_after_seconds(error.headers.get("Retry-After"))
                    if requested is not None and requested > MAX_RETRY_AFTER:
                        # The server asked for a long pause; stop instead of hammering it.
                        break
                    wait = max(wait, requested or 0)
                time.sleep(wait)
        raise FetchError(f"요청 실패 ({url}): {last_error}")
