from __future__ import annotations

import json
from dataclasses import asdict
from importlib.resources import files
from typing import Sequence

from .branding import BrandDefinition, DEFAULT_BRAND
from .languages import LanguageDefinition, normalize_languages
from .photos import DEFAULT_PHOTO, PhotoDefinition
from .themes import ThemeDefinition, normalize_themes


THEME_PLACEHOLDER = "__ONTOBDC_BUILD_THEMES__"
LANGUAGE_PLACEHOLDER = "__ONTOBDC_BUILD_LANGUAGES__"
BRAND_PLACEHOLDER = "__ONTOBDC_BUILD_BRAND__"
PHOTO_PLACEHOLDER = "__ONTOBDC_BUILD_PHOTO__"


def _read_component_template(filename: str) -> str:
    return (
        files("ontobdc_view")
        .joinpath("component", "asset", filename)
        .read_text(encoding="utf-8")
    )


def _build_component_template(
    filename: str,
    placeholder: str,
    payload: object,
) -> str:
    template = _read_component_template(filename)

    if placeholder not in template:
        raise RuntimeError(f"{filename} has no build-time placeholder {placeholder}")

    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return template.replace(placeholder, encoded)


def build_theme_tile(themes: Sequence[ThemeDefinition] | None = None) -> str:
    """Build the theme tile JavaScript with a frozen theme catalog."""
    resolved = normalize_themes(themes)
    return _build_component_template(
        "onto-theme-tile.js",
        THEME_PLACEHOLDER,
        [asdict(theme) for theme in resolved],
    )


def build_language_tile(
    languages: Sequence[LanguageDefinition] | None = None,
) -> str:
    """Build the language tile JavaScript with a frozen language catalog."""
    resolved = normalize_languages(languages)
    return _build_component_template(
        "onto-language-tile.js",
        LANGUAGE_PLACEHOLDER,
        [asdict(language) for language in resolved],
    )


def build_logo_tile(brand: BrandDefinition | None = None) -> str:
    """Build the logo tile JavaScript with brand assets frozen into the artifact."""
    resolved = brand or DEFAULT_BRAND
    return _build_component_template(
        "onto-logo-tile.js",
        BRAND_PLACEHOLDER,
        asdict(resolved),
    )


def build_photo_tile(photo: PhotoDefinition | None = None) -> str:
    """Build the photo tile JavaScript with photo content frozen into the artifact."""
    resolved = photo or DEFAULT_PHOTO
    return _build_component_template(
        "onto-photo-tile.js",
        PHOTO_PLACEHOLDER,
        asdict(resolved),
    )
