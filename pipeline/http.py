from __future__ import annotations

import gzip
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from urllib.parse import urlsplit


# Only keyed public-data APIs are called (no crawling), so robots.txt is not consulted.
USER_AGENT = "OsanOn/1.0 (+https://github.com/bluepet032/Osan-On; public-benefit-index)"
MIN_HOST_INTERVAL = 1.0
MAX_RETRY_AFTER = 30.0


class FetchError(RuntimeError):
    pass


@dataclass(slots=True)
class Response:
    url: str
    status: int
    text: str
    content_type: str


# Shared across collectors in one pipeline run, so requests to the same host are spaced out
# even when several collectors use it.
_last_request: dict[str, float] = {}


def reset_host_state() -> None:
    _last_request.clear()


def retry_after_seconds(value: str | None) -> float | None:
    try:
        return max(0.0, float(value)) if value else None
    except ValueError:
        return None


class HttpClient:
    def __init__(self, timeout: float = 20.0, retries: int = 3, delay: float = 0.4,
                 min_interval: float = MIN_HOST_INTERVAL):
        self.timeout = timeout
        self.retries = retries
        self.delay = delay
        self.min_interval = min_interval

    def get(self, url: str, headers: dict[str, str] | None = None) -> Response:
        request_headers = {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/json,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Encoding": "gzip",
        }
        if headers:
            request_headers.update(headers)

        last_error: Exception | None = None
        for attempt in range(self.retries):
            self._wait_for_host(url)
            try:
                return self._send(url, request_headers)
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

    def _wait_for_host(self, url: str) -> None:
        host = urlsplit(url).netloc
        elapsed = time.monotonic() - _last_request.get(host, float("-inf"))
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        _last_request[host] = time.monotonic()

    def _send(self, url: str, headers: dict[str, str]) -> Response:
        request = urllib.request.Request(url, headers=headers)
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
