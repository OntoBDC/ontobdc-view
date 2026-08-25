from pathlib import Path

import pytest

from ontobdc_view import (
    DEFAULT_BRAND,
    DEFAULT_LANGUAGES,
    DEFAULT_PHOTO,
    DEFAULT_THEMES,
    BrandDefinition,
    LanguageDefinition,
    PhotoDefinition,
    ThemeDefinition,
    build_language_tile,
    build_logo_tile,
    build_photo_tile,
    build_theme_tile,
    component_path,
    read_component,
)


def test_theme_tile_is_packaged():
    path = component_path("onto-theme-tile.js")
    assert path.is_file()


def test_theme_tile_is_a_build_template():
    source = read_component("onto-theme-tile.js")
    assert "__ONTOBDC_BUILD_THEMES__" in source
    assert 'customElements.define("onto-theme-tile"' in source
    assert 'theme-changed' in source


def test_default_build_injects_theme_catalog():
    source = build_theme_tile()
    assert "__ONTOBDC_BUILD_THEMES__" not in source
    for theme in DEFAULT_THEMES:
        assert theme.name in source


def test_custom_theme_is_injected_at_build_time():
    source = build_theme_tile(
        [
            ThemeDefinition(
                name="client-theme",
                label="Client Theme",
                tokens={"background": "#123456", "foreground": "#ffffff"},
                options={"transparentBackground": True, "borderWidth": 0},
            )
        ]
    )
    assert '"name":"client-theme"' in source
    assert '"background":"#123456"' in source
    assert '"borderWidth":0' in source


def test_language_tile_is_packaged():
    path = component_path("onto-language-tile.js")
    assert path.is_file()


def test_language_tile_is_a_build_template():
    source = read_component("onto-language-tile.js")
    assert "__ONTOBDC_BUILD_LANGUAGES__" in source
    assert 'customElements.define("onto-language-tile"' in source
    assert 'language-changed' in source


def test_default_build_injects_language_catalog():
    source = build_language_tile()
    assert "__ONTOBDC_BUILD_LANGUAGES__" not in source
    for language in DEFAULT_LANGUAGES:
        assert language.code in source


def test_custom_language_is_injected_at_build_time():
    source = build_language_tile(
        [LanguageDefinition(code="fr", label="Français", short_label="FR")]
    )
    assert '"code":"fr"' in source
    assert '"short_label":"FR"' in source


def test_logo_tile_is_packaged():
    path = component_path("onto-logo-tile.js")
    assert path.is_file()


def test_logo_tile_is_a_build_template():
    source = read_component("onto-logo-tile.js")
    assert "__ONTOBDC_BUILD_BRAND__" in source
    assert 'customElements.define("onto-logo-tile"' in source
    assert 'data-view="mark"' in source
    assert 'data-view="logotype"' in source
    assert 'data-view="slogan"' in source


def test_default_logo_build_injects_brand():
    source = build_logo_tile()
    assert "__ONTOBDC_BUILD_BRAND__" not in source
    assert DEFAULT_BRAND.name in source
    assert DEFAULT_BRAND.slogan in source
    assert "currentColor" in source


def test_custom_logo_is_injected_at_build_time():
    source = build_logo_tile(
        BrandDefinition(
            name="Example",
            mark_svg='<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="currentColor"/></svg>',
            logotype_svg='<svg viewBox="0 0 20 10"><rect width="20" height="10" fill="currentColor"/></svg>',
            slogan="Engineering Context",
        )
    )
    assert '"name":"Example"' in source
    assert "Engineering Context" in source
    assert "__ONTOBDC_BUILD_BRAND__" not in source


def test_photo_tile_is_packaged():
    path = component_path("onto-photo-tile.js")
    assert path.is_file()


def test_photo_tile_is_a_build_template():
    source = read_component("onto-photo-tile.js")
    assert "__ONTOBDC_BUILD_PHOTO__" in source
    assert 'customElements.define("onto-photo-tile"' in source
    assert 'photo-selected' in source
    assert 'photo-open-requested' in source
    assert "PHOTO.data_uri" in source


def test_default_photo_build_injects_stub():
    source = build_photo_tile()
    assert "__ONTOBDC_BUILD_PHOTO__" not in source
    assert DEFAULT_PHOTO.id in source
    assert "data:image/svg+xml" in source
    assert DEFAULT_PHOTO.caption in source


def test_custom_photo_is_injected_at_build_time():
    source = build_photo_tile(
        PhotoDefinition(
            id="inspection-001",
            data_uri="data:image/png;base64,AAAA",
            alt="Inspection photo",
            caption="Cable tray inspection",
            author="Inspector",
            date="2026-08-08",
            location="Data center",
            mode="evidence",
            fit="contain",
            focal_x=0.4,
            focal_y=0.3,
        )
    )
    assert '"id":"inspection-001"' in source
    assert '"data_uri":"data:image/png;base64,AAAA"' in source
    assert '"mode":"evidence"' in source
    assert "Cable tray inspection" in source
    assert "__ONTOBDC_BUILD_PHOTO__" not in source


def test_photo_rejects_path_or_external_url():
    with pytest.raises(ValueError):
        PhotoDefinition(id="bad", data_uri="./photo.jpg", alt="bad")

    with pytest.raises(ValueError):
        PhotoDefinition(id="bad", data_uri="https://example.com/photo.jpg", alt="bad")


def test_photo_from_file_serializes_bytes(tmp_path: Path):
    image = tmp_path / "stub.png"
    image.write_bytes(b"\x89PNG\r\n\x1a\n")

    photo = PhotoDefinition.from_file(image, id="stub", alt="stub")

    assert photo.data_uri.startswith("data:image/png;base64,")
    assert str(image) not in photo.data_uri


def test_presentation_surface_is_packaged():
    path = component_path("onto-presentation-surface.js")
    assert path.is_file()


def test_presentation_surface_has_layout_and_lifecycle_events():
    source = read_component("onto-presentation-surface.js")
    assert 'customElements.define("onto-presentation-surface"' in source
    assert "ResizeObserver" in source
    assert "surface-layout-changed" in source
    assert "surface-tile-presented" in source
    assert "surface-tile-dismissed" in source
    assert "surface-tile-promoted" in source
    assert "slot-target" in source
    assert "min-columns" in source
    assert "max-columns" in source
