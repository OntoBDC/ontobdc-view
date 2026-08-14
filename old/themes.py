from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping, Sequence


@dataclass(frozen=True)
class ThemeDefinition:
    """Build-time theme definition injected into generated presentation assets."""

    name: str
    label: str
    tokens: Mapping[str, str]
    options: Mapping[str, object] = field(default_factory=dict)


DEFAULT_THEMES: tuple[ThemeDefinition, ...] = (
    ThemeDefinition(
        name="light",
        label="Light",
        tokens={
            "background": "#ffffff",
            "foreground": "#0f172a",
            "accent": "#0284c7",
            "borderColor": "rgba(2,132,199,.35)",
        },
        options={"transparentBackground": False},
    ),
    ThemeDefinition(
        name="dark",
        label="Dark",
        tokens={
            "background": "#000000",
            "foreground": "#f8fafc",
            "accent": "#38bdf8",
            "borderColor": "rgba(56,189,248,.55)",
        },
        options={"transparentBackground": False},
    ),
)


def normalize_themes(themes: Sequence[ThemeDefinition] | None = None) -> tuple[ThemeDefinition, ...]:
    resolved = tuple(themes or DEFAULT_THEMES)
    if not resolved:
        raise ValueError("at least one theme must be provided")

    names = [theme.name for theme in resolved]
    if len(names) != len(set(names)):
        raise ValueError("theme names must be unique")

    return resolved
