import os
from pathlib import Path

from pipeline.config import load_local_env


def test_local_env_loads_documented_keys_without_overriding(tmp_path: Path, monkeypatch):
    path = tmp_path / ".env"
    path.write_text('QUESTBOARD_SOURCES=eventus\nUNRELATED=value\n', encoding="utf-8")
    monkeypatch.setenv("QUESTBOARD_SOURCES", "dev_event")
    monkeypatch.delenv("UNRELATED", raising=False)

    load_local_env(path)

    assert os.environ["QUESTBOARD_SOURCES"] == "dev_event"
    assert "UNRELATED" not in os.environ
