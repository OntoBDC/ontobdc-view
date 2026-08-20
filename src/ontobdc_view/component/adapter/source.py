from __future__ import annotations

import json
from importlib.resources import files
from typing import Optional
from urllib.parse import quote

from ontobdc.shared.domain.port.component_source import ComponentSourcePort

from .i18n import LANGUAGE_CATALOG, catalog_for_namespace

_BUILD_PLACEHOLDER = "__ONTOBDC_BUILD_"

_THEMES = [
    {
        "name": "light",
        "label": "Light",
        "tokens": {
            "background": "#ffffff",
            "foreground": "#0f172a",
            "accent": "#0284c7",
            "borderColor": "rgba(2,132,199,.35)",
        },
        "options": {"transparentBackground": False},
    },
    {
        "name": "dark",
        "label": "Dark",
        "tokens": {
            "background": "#000000",
            "foreground": "#f8fafc",
            "accent": "#38bdf8",
            "borderColor": "rgba(56,189,248,.55)",
        },
        "options": {"transparentBackground": False},
    },
]

_BRAND = {
    "name": "OntoBDC",
    "mark_svg": (
        '<svg viewBox="0 0 64 64" aria-hidden="true">'
        '<circle cx="32" cy="32" r="25" fill="none" stroke="currentColor" stroke-width="8"/>'
        '<circle cx="32" cy="32" r="7" fill="currentColor"/></svg>'
    ),
    "logotype_svg": (
        '<svg viewBox="0 0 260 64" aria-hidden="true">'
        '<circle cx="32" cy="32" r="23" fill="none" stroke="var(--onto-theme-accent, currentColor)" stroke-width="7"/>'
        '<circle cx="32" cy="32" r="6" fill="var(--onto-theme-accent, currentColor)"/>'
        '<text x="68" y="42" fill="currentColor" font-family="system-ui, sans-serif" '
        'font-size="31" font-weight="700">OntoBDC</text></svg>'
    ),
    "slogan": "Data with Brains",
}

_LANGUAGES = LANGUAGE_CATALOG


def _stub_photo_data_uri() -> str:
    svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'>"
        "<rect width='1200' height='800' fill='#0f172a'/>"
        "<circle cx='785' cy='285' r='95' fill='#38bdf8' opacity='.85'/>"
        "<text x='120' y='170' fill='white' font-family='system-ui,sans-serif' "
        "font-size='58' font-weight='700'>OntoBDC</text>"
        "</svg>"
    )
    return "data:image/svg+xml;charset=UTF-8," + quote(svg)


_PHOTO = {
    "id": "stub-photo",
    "data_uri": _stub_photo_data_uri(),
    "alt": "OntoBDC placeholder photo",
    "caption": "",
    "author": "",
    "date": "",
    "location": "",
    "mode": "photo",
    "fit": "cover",
    "focal_x": 0.5,
    "focal_y": 0.5,
}

def theme_catalog() -> list:
    """The same theme catalog `onto-theme-tile` builds with, for a
    standalone Page (e.g. the WorkStream detail page) to apply without
    duplicating the token values — see `ontobdc_view.render_entity_view`.
    """
    return [dict(theme) for theme in _THEMES]


_BUILD_PAYLOAD_BY_PLACEHOLDER = {
    "__ONTOBDC_BUILD_THEMES__": _THEMES,
    "__ONTOBDC_BUILD_BRAND__": _BRAND,
    "__ONTOBDC_BUILD_LANGUAGES__": _LANGUAGES,
    "__ONTOBDC_BUILD_PHOTO__": _PHOTO,
}

_I18N_PLACEHOLDER = "__ONTOBDC_BUILD_I18N__"

# Maps a Tile's custom-element tag to the i18n YAML namespace (see
# `ontobdc_view/i18n/locale/*.yaml`) that carries its translated strings.
_I18N_NAMESPACE_BY_TAG = {
    "onto-language-tile": "language_tile",
    "onto-theme-tile": "theme_tile",
    "onto-logo-tile": "logo_tile",
    "onto-file-tree-tile": "file_tree_tile",
    "onto-workstream-tile": "workstream_tile",
    "onto-csv-file-tile": "csv_file_tile",
    "onto-photo-tile": "photo_tile",
    "onto-data-container-tile": "data_container_tile",
    "onto-file-size-tile": "file_size_tile",
    "onto-presentation-surface": "presentation_surface",
    "onto-pdf-file-tile": "common",
    "onto-generic-file-tile": "common",
    "onto-image-file-tile": "common",
    # file_tree_tile also carries openFullscreen, which this Tile reuses;
    # merge_common_namespace=True still pulls in every "common" key too.
    "onto-file-viewer-tile": "file_tree_tile",
}


def _project_brand(root_path: Optional[str]) -> dict:
    """Merge a project's own `brand:` section from `.__ontobdc__/config.yaml`
    over the shipped OntoBDC default brand.

    Same project-override tier `OntologyConfigAdapter` already applies to
    ontology file resolution (tier 2: `.__ontobdc__/config.yaml`), just for
    the brand name/SVG/slogan instead of an ontology file — a project sets
    only the keys it wants to change (`name`, `mark_svg`, `logotype_svg`,
    `slogan`); anything it omits keeps the shipped default. Any failure
    (no root_path, no config file, unset project root, malformed YAML) is
    non-fatal: this is cosmetic, never a reason to fail Surface packaging.
    """
    if not root_path:
        return dict(_BRAND)
    try:
        from ontobdc.shared.adapter.config import ConfigDataAdapter

        overrides = (ConfigDataAdapter(root_dir=root_path).all or {}).get("brand")
    except Exception:
        return dict(_BRAND)
    if not isinstance(overrides, dict):
        return dict(_BRAND)
    return {**_BRAND, **overrides}


class ComponentSourceAdapter(ComponentSourcePort):
    """Reads a Tile's JS asset and resolves its build-time placeholders, if any.

    A plain content Tile's JS has no placeholder and is returned as-is. A
    "system" Tile's JS (logo/theme/language/photo) carries one of the
    placeholders in `_BUILD_PAYLOAD_BY_PLACEHOLDER`, substituted here with
    project-default data. The brand payload (`__ONTOBDC_BUILD_BRAND__`) is
    the one exception: it is re-resolved per call via `_project_brand`
    against `root_path`, so each project can override its own logo/name/
    slogan. Any Tile whose JS carries `__ONTOBDC_BUILD_I18N__` also gets
    that placeholder resolved to its translated-string catalog (see
    `ontobdc_view.component.adapter.i18n`), keyed by the Tile's own tag.
    """

    def component_source(self, tag: str, root_path: Optional[str] = None) -> Optional[str]:
        try:
            source = files("ontobdc_view").joinpath(
                "component", "asset", f"{tag}.js"
            ).read_text(encoding="utf-8")
        except (FileNotFoundError, OSError):
            return None

        if not source.strip():
            return None

        payload_by_placeholder = dict(_BUILD_PAYLOAD_BY_PLACEHOLDER)
        payload_by_placeholder["__ONTOBDC_BUILD_BRAND__"] = _project_brand(root_path)
        for placeholder, payload in payload_by_placeholder.items():
            if placeholder in source:
                encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
                source = source.replace(placeholder, encoded)

        if _I18N_PLACEHOLDER in source:
            namespace = _I18N_NAMESPACE_BY_TAG.get(tag, "common")
            encoded = json.dumps(
                catalog_for_namespace(namespace), ensure_ascii=False, separators=(",", ":")
            )
            source = source.replace(_I18N_PLACEHOLDER, encoded)

        if _BUILD_PLACEHOLDER in source:
            # An unresolved placeholder we don't recognize — embedding it
            # as-is would ship broken JS.
            return None

        return source
