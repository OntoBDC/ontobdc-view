from __future__ import annotations

from functools import lru_cache
from importlib.resources import files
from typing import Dict

import yaml

DEFAULT_LOCALE = "en"

# Order here is the language tile's cycling order.
LANGUAGE_CATALOG = [
    {"code": "en", "label": "English", "short_label": "EN", "flag": "\U0001F1FA\U0001F1F8"},
    {"code": "pt-BR", "label": "Portugues (Brasil)", "short_label": "PT-BR", "flag": "\U0001F1E7\U0001F1F7"},
    {"code": "pt-PT", "label": "Portugues (Portugal)", "short_label": "PT-PT", "flag": "\U0001F1F5\U0001F1F9"},
    {"code": "es", "label": "Espanol", "short_label": "ES", "flag": "\U0001F1EA\U0001F1F8"},
]

SUPPORTED_LOCALES = [language["code"] for language in LANGUAGE_CATALOG]


@lru_cache(maxsize=1)
def full_catalog() -> Dict[str, Dict[str, Dict[str, str]]]:
    """Load and merge every locale YAML file into `{locale: {namespace: {key: value}}}`.

    Cached: the locale files are packaged, read-only data — not something
    that changes within a running process.
    """
    catalog: Dict[str, Dict[str, Dict[str, str]]] = {}
    locale_root = files("ontobdc_view").joinpath("i18n", "locale")
    for locale in SUPPORTED_LOCALES:
        text = locale_root.joinpath(f"{locale}.yaml").read_text(encoding="utf-8")
        catalog[locale] = yaml.safe_load(text) or {}
    return catalog


def catalog_for_namespace(namespace: str) -> Dict[str, Dict[str, str]]:
    """Return `{locale: {key: value}}` for one namespace, merged with `common`.

    Every locale is guaranteed a key (falling back to the default locale's
    string, then to an empty dict) so a tile's runtime lookup never has to
    special-case a missing locale.
    """
    catalog = full_catalog()
    result: Dict[str, Dict[str, str]] = {}
    for locale in SUPPORTED_LOCALES:
        locale_catalog = catalog.get(locale, {})
        merged = dict(locale_catalog.get("common", {}))
        merged.update(locale_catalog.get(namespace, {}))
        result[locale] = merged
    return result
