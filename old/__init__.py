from __future__ import annotations

from importlib.resources import files

from .branding import BrandDefinition, DEFAULT_BRAND
from .build import build_language_tile, build_logo_tile, build_photo_tile, build_theme_tile
from .languages import DEFAULT_LANGUAGES, LanguageDefinition, normalize_languages
from .photos import DEFAULT_PHOTO, PhotoDefinition
from .themes import DEFAULT_THEMES, ThemeDefinition, normalize_themes

__all__ = [
    "__version__",
    "asset_root",
    "component_path",
    "read_component",
    "build_theme_tile",
    "build_language_tile",
    "build_logo_tile",
    "build_photo_tile",
    "ThemeDefinition",
    "DEFAULT_THEMES",
    "normalize_themes",
    "LanguageDefinition",
    "DEFAULT_LANGUAGES",
    "normalize_languages",
    "BrandDefinition",
    "DEFAULT_BRAND",
    "PhotoDefinition",
    "DEFAULT_PHOTO",
]

__version__ = "0.1.0"


def asset_root():
    """Return the Traversable root containing distributable browser assets."""
    return files("ontobdc_view").joinpath("component", "asset")


def component_path(name: str):
    """Return a packaged component asset by filename."""
    return asset_root().joinpath(name)


def read_component(name: str, *, encoding: str = "utf-8") -> str:
    """Read a packaged browser component template as text."""
    return component_path(name).read_text(encoding=encoding)
