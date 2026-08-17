from __future__ import annotations

from typing import List

from ontobdc.shared.adapter.i18n import (
    FullCatalog,
    I18nCatalogLoader,
    LanguageEntry,
    LocaleCatalog,
)

LANGUAGE_CATALOG: List[LanguageEntry] = [
    {"code": "en", "label": "English", "short_label": "EN", "flag": "\U0001F1FA\U0001F1F8"},
    {"code": "pt-BR", "label": "Portugues (Brasil)", "short_label": "PT-BR", "flag": "\U0001F1E7\U0001F1F7"},
    {"code": "pt-PT", "label": "Portugues (Portugal)", "short_label": "PT-PT", "flag": "\U0001F1F5\U0001F1F9"},
    {"code": "es", "label": "Espanol", "short_label": "ES", "flag": "\U0001F1EA\U0001F1F8"},
]

_LOADER: I18nCatalogLoader = I18nCatalogLoader(
    package_name="ontobdc_view",
    language_catalog=LANGUAGE_CATALOG,
    merge_common_namespace=True,
    fallback_namespace="common",
    resource_path=("component", "adapter", "i18n", "locale"),
)

DEFAULT_LOCALE: str = I18nCatalogLoader.DEFAULT_LOCALE
SUPPORTED_LOCALES: List[str] = list(_LOADER.supported_locales)


def full_catalog() -> FullCatalog:
    return _LOADER.full_catalog()


def catalog_for_namespace(namespace: str) -> LocaleCatalog:
    return _LOADER.catalog_for_namespace(namespace)
