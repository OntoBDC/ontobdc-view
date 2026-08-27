

import base64
import json
from importlib.resources import files
from pathlib import Path
from typing import Dict, List, Optional
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

# Canonical (product -> asset layout) table -- exactly mirrors
# `_PRODUCT` in ontobdc.view.plugin.capability.transformation.surface_branded
# so whichever SVGs that capability downloaded into the project dir are
# automatically discoverable by this renderer WITHOUT importing that
# capability (zero coupling, approach A).  Each product tier maps to:
#   (hidden_dir, asset_dir, brand_filename, logotype_filename, display_name, slogan)
# Slogan is "" for InfoBIM on purpose -- the branded tile auto-falls back
# to "logotype" representation when the slogan is falsy (see
# `OntoLogoTile.representation`).
_PRODUCT_ASSET_LAYOUTS = (
    (
        ".__infobim__",
        "assets",
        "InfoBIMBrand.svg",
        "InfoBIMLogotype.svg",
        "InfoBIM",
        "",
    ),
    (
        ".__ontobdc__",
        "asset",
        "OntoBDCBrand.svg",
        "OntoBDCLogotype.svg",
        "OntoBDC",
        "Data with Brains",
    ),
)


def _read_text_if_svg(path: Path) -> Optional[str]:
    """Return the decoded content of ``path`` if it exists and is an SVG.

    Any read/decode/validation failure is swallowed on purpose -- brand
    resolution is cosmetic, never a reason to break page packaging.
    """
    try:
        if not path.is_file():
            return None
        raw = path.read_bytes()
    except (OSError, ValueError):
        return None
    probe = raw.lstrip()[:512].lower()
    if b"<svg" not in probe:
        return None
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        try:
            return raw.decode("utf-8", errors="replace")
        except Exception:
            return None


def _read_img_markup_if_png(path: Path) -> Optional[str]:
    """Return an inline ``<img>`` tag embedding ``path`` if it is a PNG.

    The Tile injects ``mark_svg``/``logotype_svg`` as raw markup (see
    ``onto-logo-tile.js``), so a PNG fallback must arrive already wrapped
    in a tag the Tile can drop straight into its shadow DOM -- a base64
    data URI keeps the asset self-contained, matching inline SVG markup.
    """
    try:
        if not path.is_file():
            return None
        raw = path.read_bytes()
    except (OSError, ValueError):
        return None
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    encoded = base64.b64encode(raw).decode("ascii")
    return f'<img src="data:image/png;base64,{encoded}" alt="" />'


def _read_brand_asset_markup(assets: Path, svg_filename: str) -> Optional[str]:
    """Resolve renderable markup for a brand asset, SVG first, PNG second.

    ``svg_filename`` is the canonical ``*.svg`` name for the asset (e.g.
    ``"OntoBDCBrand.svg"``). When that file is absent or invalid, the same
    basename with a ``.png`` extension is tried instead.
    """
    svg_markup = _read_text_if_svg(assets / svg_filename)
    if svg_markup is not None:
        return svg_markup.strip()
    png_path = (assets / svg_filename).with_suffix(".png")
    return _read_img_markup_if_png(png_path)


def _candidate_brand_roots(root_path: Optional[str]) -> List[Path]:
    """Return filesystem paths where a product marker dir may reasonably live.

    We cannot rely solely on the user's current working directory because
    ``infobim view`` can be launched from arbitrary shell locations, some
    Python build tooling temporarily ``chdir``s into temporary folders
    during editable wheel installs, and daemon/CI invocations may set cwd
    to empty temp dirs.  Instead we collect candidates from three tiers
    and let ``_resolve_brand_from_assets`` walk each of them upward until
    finding a product marker:

    1. Explicit ``root_path`` provided by the caller (highest relevance,
       if present).  We try both the literal path and its directory
       because callers occasionally pass a file instead of a dir.
    2. ``Path.cwd()`` as a best-effort convenience fallback for shells
       that ``cd``'d into the project.
    3. Directories derived from the installed ``__file__`` locations of
       ``ontobdc`` (shared runtime), ``ontobdc_view`` (ourselves), and
       ``infobim`` (BIM runtime) when we are deployed as an editable
       monorepo (which is 100% the case for InfoBIM workstations).  These
       paths are static for a given environment and therefore immune to
       any ``cwd`` or ``chdir`` shenanigans.

    Every returned path is guaranteed absolute+resolved (or skipped if we
    cannot resolve it).  Duplicates are intentionally preserved because
    the walk-up logic is cheap and we want the order above to represent
    priority for any future tie-breaking.
    """
    candidates: List[Path] = []

    # Tier 1 -- explicit caller hint.
    if isinstance(root_path, str) and root_path.strip():
        try:
            explicit = Path(root_path).expanduser().resolve()
        except (OSError, ValueError):
            explicit = None
        if explicit is not None:
            candidates.append(explicit)
            try:
                parent = explicit.parent
                if parent != explicit:
                    candidates.append(parent)
            except (OSError, ValueError):
                pass

    # Tier 2 -- current working directory.
    try:
        candidates.append(Path.cwd().resolve())
    except (OSError, ValueError):
        pass

    # Tier 3 -- installed package __file__ / __path__ locations (monorepo
    # heuristics).  Namespace packages and ``pyproject.toml``-based editable
    # installs may set ``__file__ = None`` but still expose a filesystem
    # location via ``__path__[0]``; we try both so this layer keeps working
    # in every packaging configuration we support.  From any path we walk
    # up a generous 10 directories because an editable installed package
    # layout in a monorepo looks like:
    #   <repo>/ontobdc/src/ontobdc/__init__.py  (depth 3 to reach <repo>)
    # and we want a comfortable safety margin to also cover future cases
    # where nested sub-projects carry markers at the workspace root.
    for module_name in ("ontobdc", "ontobdc_view", "infobim"):
        try:
            module = __import__(module_name)
            candidate_roots: List[Path] = []
            module_file = getattr(module, "__file__", None)
            if isinstance(module_file, str) and module_file:
                candidate_roots.append(Path(module_file).expanduser().resolve().parent)
            module_path_list = getattr(module, "__path__", None)
            if isinstance(module_path_list, (list, tuple)):
                for item in module_path_list:
                    if isinstance(item, str) and item:
                        candidate_roots.append(Path(item).expanduser().resolve())
            if not candidate_roots:
                continue
            for pkg_root in candidate_roots:
                for _ in range(10):
                    try:
                        candidates.append(pkg_root.resolve())
                    except (OSError, ValueError):
                        pass
                    try:
                        up = pkg_root.parent
                        if up == pkg_root:
                            break
                        pkg_root = up
                    except (OSError, ValueError):
                        break
        except Exception:
            continue

    # De-duplicate while preserving order.
    seen: set = set()
    ordered: List[Path] = []
    for path in candidates:
        try:
            key = str(path)
        except (OSError, ValueError):
            continue
        if key in seen:
            continue
        seen.add(key)
        ordered.append(path)
    return ordered


def _resolve_brand_from_assets(root_path: Optional[str]) -> Optional[Dict[str, str]]:
    """Look for branding assets that `surface_branded` already downloaded.

    Each asset is looked up as SVG first, falling back to a same-named
    ``.png`` file when no SVG is present (see ``_read_brand_asset_markup``).

    No coupling to that capability exists here: we simply scan the two
    canonical project hidden directories (``.__infobim__`` first because
    InfoBIM-specific projects carry that marker; ``.__ontobdc__`` as the
    generic fallback) starting from every candidate root returned by
    ``_candidate_brand_roots`` and walking upward to the filesystem root
    for each.  That dual search (many starting points + walk up per
    starting point) guarantees we find assets placed in the workspace
    root even when callers cannot provide an explicit project path and
    the current working directory is not set to a project subtree.

    Walk-up depth is capped defensively at 32 levels per starting point
    to avoid pathological loops on unusual filesystem mounts.

    Returns ``None`` if no recognised product asset tier was found so the
    caller can fall back to the shipped hard-coded default.
    """
    starting_points = _candidate_brand_roots(root_path)
    if not starting_points:
        return None

    for start in starting_points:
        search_bases: List[Path] = []
        candidate = start
        for _ in range(32):
            search_bases.append(candidate)
            parent = candidate.parent
            if parent == candidate:
                break
            candidate = parent

        for base in search_bases:
            for hidden, asset_dir, brand_file, logotype_file, name, slogan in _PRODUCT_ASSET_LAYOUTS:
                marker = base / hidden
                if not marker.is_dir():
                    continue
                assets = marker / asset_dir
                brand_markup = _read_brand_asset_markup(assets, brand_file)
                logotype_markup = _read_brand_asset_markup(assets, logotype_file)
                if brand_markup is None or logotype_markup is None:
                    continue
                return {
                    "name": name,
                    "mark_svg": brand_markup,
                    "logotype_svg": logotype_markup,
                    "slogan": slogan,
                }
    return None

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
    """Resolve the effective brand for a project with this precedence:

    0. Fallback root.  ``root_path`` is allowed to be ``None`` because
       some callers (``InfoBIMComponentSourceAdapter.scripts()`` prior to
       this fix) invoke ``component_source(tag)`` with no project hint;
       in that case we walk up from the current working directory so the
       branding still resolves for assets placed in a super-project/work-
       space root above a nested per-project container.
    1. Shipped hard-coded defaults (``_BRAND``).  Always present as the
       ultimate fallback so a project with zero local config and zero
       downloaded assets still renders a real logo tile.
    2. Product-tier branding discovered from files in the project root
       (``_resolve_brand_from_assets``).  When ``surface_branded`` has
       previously downloaded ``InfoBIMBrand.svg`` / ``InfoBIMLogotype.svg``
       into ``.__infobim__/assets`` -- or the OntoBDC equivalents into
       ``.__ontobdc__/asset`` -- this tier overrides the shipped defaults
       without any Python coupling to that capability (approach A).
    3. Explicit overrides the user wrote in ``.__ontobdc__/config.yaml``
       under the ``brand:`` mapping.  Highest precedence so operators can
       always override anything -- including the auto-discovered product
       branding -- by editing one project-local YAML key.

    Any failure at tiers 2 or 3 is non-fatal: cosmetic branding never
    breaks Surface packaging.
    """
    resolved_root: Optional[str]
    if isinstance(root_path, str) and root_path.strip():
        resolved_root = root_path
    else:
        try:
            resolved_root = str(Path.cwd().resolve())
        except (OSError, ValueError):
            resolved_root = None

    base = dict(_BRAND)

    # Tier 2 override -- product branding discovered from on-disk assets.
    # ``slogan`` is allowed to land as "" so projects like InfoBIM (which
    # ship no slogan) drop the shipped "Data with Brains" phrase and the
    # logo tile switches cleanly to logotype-only representation. All
    # other keys still require a truthy non-empty value to be applied.
    discovered = _resolve_brand_from_assets(resolved_root)
    if isinstance(discovered, dict):
        for key, value in discovered.items():
            if not isinstance(value, str):
                continue
            if key == "slogan":
                base[key] = value
            elif value.strip():
                base[key] = value

    if not resolved_root:
        return base
    try:
        from ontobdc.shared.adapter.config import ConfigDataAdapter

        overrides = (ConfigDataAdapter(root_dir=resolved_root).all or {}).get("brand")
    except Exception:
        return base
    if not isinstance(overrides, dict):
        return base
    # Tier 3 override -- explicit user-written ``brand:`` section in YAML.
    # Same truthy-except-slogan rule as tier 2, so a user can intentionally
    # blank the slogan by writing `slogan: ""` in the project config.
    #
    # Additionally we SKIP any override value that is byte-for-byte identical
    # to the shipped ``_BRAND`` default for that key.  Rationale: the old
    # hotfix used to auto-write those exact default values into the YAML
    # on first init, so an operator who has never edited ``brand:`` manually
    # will still have a YAML that looks like it carries explicit overrides.
    # A real user override is -- by definition -- a value DIFFERENT from the
    # shipped default.  Detecting auto-generated stale overrides this way
    # lets tier 2 (on-disk product asset discovery) win when the user has
    # done nothing beyond letting the old hotfix seed the YAML.
    for key, value in overrides.items():
        if not isinstance(value, str):
            continue
        shipped_default = _BRAND.get(key)
        if isinstance(shipped_default, str) and shipped_default == value:
            continue
        if key == "slogan":
            base[str(key)] = value
        elif value.strip():
            base[str(key)] = value
    return base


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
