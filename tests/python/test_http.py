import io
import urllib.error
from email.message import Message

import pytest

from pipeline import http
from pipeline.http import FetchError, HttpClient


class FakeResponse:
    def __init__(self, url: str, body: str, status: int = 200):
        self.url, self.status, self._body = url, status, body.encode("utf-8")
        self.headers = Message()
        self.headers["Content-Type"] = "text/html; charset=utf-8"

    def read(self):
        return self._body

    def geturl(self):
        return self.url

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def http_error(url: str, code: int, retry_after: str | None = None):
    headers = Message()
    if retry_after is not None:
        headers["Retry-After"] = retry_after
    return urllib.error.HTTPError(url, code, "error", headers, io.BytesIO(b""))


@pytest.fixture
def server(monkeypatch):
    """Route urlopen to a dict of url -> body or exception, and record sleeps."""

    http.reset_host_state()
    routes: dict[str, object] = {}
    calls: list[str] = []
    sleeps: list[float] = []

    def urlopen(request, timeout=None):
        url = request.full_url
        calls.append(url)
        result = routes.get(url)
        if isinstance(result, list):
            result = result.pop(0)
        if isinstance(result, Exception):
            raise result
        if result is None:
            raise http_error(url, 404)
        return FakeResponse(url, result)

    monkeypatch.setattr(http.urllib.request, "urlopen", urlopen)
    monkeypatch.setattr(http.time, "sleep", sleeps.append)
    yield routes, calls, sleeps
    http.reset_host_state()


def test_requests_to_one_host_are_spaced(server):
    routes, calls, sleeps = server
    routes["https://site.example/a"] = "a"
    routes["https://site.example/b"] = "b"

    client = HttpClient(min_interval=5)
    client.get("https://site.example/a")
    client.get("https://site.example/b")

    assert calls == ["https://site.example/a", "https://site.example/b"]
    assert sleeps and sleeps[-1] > 4


def test_server_errors_are_retried(server):
    routes, calls, _ = server
    url = "https://site.example/list"
    routes[url] = [http_error(url, 503), "ok"]

    assert HttpClient(min_interval=0).get(url).text == "ok"
    assert calls.count(url) == 2


def test_retry_after_is_honoured_and_long_pauses_stop_retrying(server):
    routes, calls, sleeps = server
    url = "https://site.example/list"
    routes[url] = [http_error(url, 429, "7"), "ok"]

    assert HttpClient(min_interval=0).get(url).text == "ok"
    assert 7 in sleeps

    other = "https://site.example/slow"
    routes[other] = [http_error(other, 429, "3600"), "never"]
    with pytest.raises(FetchError):
        HttpClient(min_interval=0).get(other)
    assert calls.count(other) == 1
