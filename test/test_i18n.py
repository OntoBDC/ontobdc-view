"""i18n locale catalog tests — pure Python, no `ontobdc` dependency.

Covers the YAML -> in-memory catalog pipeline (`ontobdc_view.component.adapter.i18n`), not the
`__ONTOBDC_BUILD_I18N__` placeholder substitution in `component_source.py`
(that module imports `ontobdc`, which isn't a dependency of this package).
"""

from __future__ import annotations

import pytest

from ontobdc_view.component.adapter.i18n import (
    DEFAULT_LOCALE,
    LANGUAGE_CATALOG,
    SUPPORTED_LOCALES,
    catalog_for_namespace,
    full_catalog,
)


def test_supported_locales_match_language_catalog():
    assert SUPPORTED_LOCALES == [language["code"] for language in LANGUAGE_CATALOG]
    assert set(SUPPORTED_LOCALES) == {"en", "pt-BR", "pt-PT", "es"}
    assert DEFAULT_LOCALE == "en"


def test_language_catalog_entries_carry_a_flag():
    for language in LANGUAGE_CATALOG:
        assert language["flag"], f"{language['code']} has no flag"
        assert language["label"]
        assert language["short_label"]


def test_full_catalog_has_every_locale():
    catalog = full_catalog()
    assert set(catalog.keys()) == set(SUPPORTED_LOCALES)
    for locale in SUPPORTED_LOCALES:
        assert isinstance(catalog[locale], dict)
        assert "common" in catalog[locale]


def test_every_locale_has_the_same_keys_per_namespace():
    catalog = full_catalog()
    namespaces = set()
    for locale_catalog in catalog.values():
        namespaces |= set(locale_catalog.keys())

    for namespace in namespaces:
        base_keys = set(catalog[DEFAULT_LOCALE].get(namespace, {}).keys())
        for locale in SUPPORTED_LOCALES:
            keys = set(catalog[locale].get(namespace, {}).keys())
            assert keys == base_keys, (
                f"locale '{locale}' namespace '{namespace}' keys {keys} "
                f"!= default-locale keys {base_keys}"
            )


def test_catalog_for_namespace_merges_common():
    merged = catalog_for_namespace("language_tile")
    assert set(merged.keys()) == set(SUPPORTED_LOCALES)
    for locale in SUPPORTED_LOCALES:
        # `open`/`close`/... come from `common`, `selectLanguage` from
        # `language_tile` itself — both must be present in the merge.
        assert "open" in merged[locale]
        assert "selectLanguage" in merged[locale]


def test_catalog_for_namespace_falls_back_gracefully_for_unknown_namespace():
    # An unknown namespace still returns every locale's `common` strings
    # rather than raising, so a Tile with no dedicated namespace degrades
    # to shared vocabulary instead of breaking the build.
    merged = catalog_for_namespace("this-namespace-does-not-exist")
    for locale in SUPPORTED_LOCALES:
        assert merged[locale] == full_catalog()[locale]["common"]


@pytest.mark.parametrize(
    ("locale", "expected"),
    [
        ("pt-BR", "Abrir arquivo"),
        ("pt-PT", "Abrir ficheiro"),
        ("es", "Abrir archivo"),
        ("en", "Open file"),
    ],
)
def test_pt_br_and_pt_pt_are_distinct_dialects(locale, expected):
    # The whole point of shipping both pt-BR and pt-PT separately: they
    # must not collapse into one generic "Portuguese" string set.
    assert catalog_for_namespace("common")[locale]["openFile"] == expected
