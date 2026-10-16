from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
LOCAL_ENV_KEYS = {"QUESTBOARD_SOURCES"}


@dataclass(frozen=True, slots=True)
class SourceConfig:
    id: str
    name: str
    kind: str
    priority: int
    schedule: str
    mode: str
    list_url: str
    homepage: str
    enabled: bool = True
    requires_secret: str | None = None
    collector: str | None = None
    # Maximum items per run for this source; None uses the pipeline default.
    limit: int | None = None


def load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def load_local_env(path: Path | None = None) -> None:
    """Load only documented local variables without overriding the process environment."""

    env_path = path or ROOT / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if key not in LOCAL_ENV_KEYS:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ.setdefault(key, value)


def load_sources(path: Path | None = None) -> tuple[list[SourceConfig], list[dict[str, Any]]]:
    document = load_yaml(path or ROOT / "config" / "sources.yml")
    sources = [SourceConfig(**item) for item in document.get("sources", [])]
    return sources, document.get("fallbacks", [])


def load_taxonomy(path: Path | None = None) -> dict[str, Any]:
    return load_yaml(path or ROOT / "config" / "taxonomy.yml")
