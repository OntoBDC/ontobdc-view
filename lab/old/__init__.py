
import importlib
import inspect
import json
import pkgutil
from importlib.resources import files
from typing import Any, Dict, List, Optional

__all__ = [
    "__version__",
    "component_source",
    "page_asset_root",
    "page_asset_path",
    "read_page_asset",
    "render_entity_view",
    "file_viewer_source",
]

__version__ = "0.1.0"


def component_source(tag: str) -> Optional[str]:
    """Return a Tile's ready-to-embed JS source by custom-element tag.

    Delegates to `ComponentSourceAdapter` (`ontobdc.shared`'s
    `ComponentSourcePort` implementation) — this function is just the
    package's public entry point, matching how every other capability here
    is exposed at the top level.
    """
    from .component.adapter.component_source import ComponentSourceAdapter

    return ComponentSourceAdapter().component_source(tag)


def page_asset_root():
    """Return the Traversable root containing Page HTML/CSS/JS assets."""
    return files("ontobdc_view").joinpath("page", "asset")


def page_asset_path(name: str):
    """Return a packaged Page asset by filename."""
    return page_asset_root().joinpath(name)


def read_page_asset(name: str, *, encoding: str = "utf-8") -> str:
    """Read a packaged Page asset (template/CSS/JS) as text."""
    return page_asset_path(name).read_text(encoding=encoding)


def file_viewer_source() -> str:
    """Return the standalone file-viewer page's ready-to-write HTML.

    This is the one place any real container file is ever read from the
    generated Surface: the main `index.html` (and every Tile it embeds)
    shows only RO-Crate metadata, never file bytes. `onto-file-tree-tile`
    opens this page (written inside the ignored OntoBDC marker directory
    at `.__ontobdc__/onto-file-viewer.html`, so it never surfaces as a
    user file) with the clicked file's path passed by reference in the
    query string (`?path=...`) — only then does a real file ever get
    requested, and only that one file.
    """
    return read_page_asset("file_viewer.html")


def _iter_page_descriptors():
    from ontobdc.shared.domain.port.page import PagePort

    package = importlib.import_module("ontobdc_view.page.plugin")
    package_prefix = f"{package.__name__}."
    for _, name, _ in pkgutil.walk_packages(package.__path__, package_prefix):
        module = importlib.import_module(name)
        for _, obj in inspect.getmembers(module):
            if not inspect.isclass(obj):
                continue
            try:
                if not issubclass(obj, PagePort) or obj is PagePort:
                    continue
            except TypeError:
                continue
            yield obj


def _matching_page_descriptor(entity_type_uris: List[str]):
    type_set = set(entity_type_uris)
    for descriptor in _iter_page_descriptors():
        required = set(descriptor.METADATA.required_uris)
        if required & type_set:
            return descriptor
    return None


_ANNOTATION_MODULE_LOAD_ORDER = (
    "annotation_model.js",
    "annotation_visual_contract.js",
    "annotation_store.js",
    "annotation_surface.js",
    "annotation_visual_resolver.js",
    "annotation_renderer.js",
    "annotation_field_factory.js",
    "annotation_form_registry.js",
    "annotation_editor.js",
    "annotation_geometry_controller.js",
    "annotation_lifecycle.js",
    "annotation_workspace.js",
    "annotation_subject_page.js",
    "annotation_runtime.js",
)


def _annotation_runtime_script() -> Optional[str]:
    """Concatenate ontobdc's native annotation modules, in dependency order.

    These live in `ontobdc` (`view/plugin/asset/js/annotation/`), not here
    — `ontobdc_view` already depends on `ontobdc`, so reading its packaged
    JS assets to inline them into a Page is a legitimate use of that
    dependency, not a layering violation. Returns None if the modules
    aren't installed/found, so a Page can render without annotations
    rather than fail outright.
    """
    try:
        # Chained, single-segment joinpath() calls — files("ontobdc") can be
        # a MultiplexedPath (e.g. an editable install), whose joinpath()
        # only accepts one segment at a time, unlike a plain pathlib.Path.
        root = files("ontobdc").joinpath("view").joinpath("plugin").joinpath("asset").joinpath("js").joinpath("annotation")
        parts = [
            root.joinpath(name).read_text(encoding="utf-8")
            for name in _ANNOTATION_MODULE_LOAD_ORDER
        ]
    except (FileNotFoundError, OSError, ModuleNotFoundError, TypeError):
        return None
    return "\n".join(parts)


_ANNOTATION_CSS_FILES = (
    "annotation_visual.css",
    "annotation_editor.css",
    "annotation_workspace.css",
)


def _annotation_runtime_style() -> str:
    try:
        root = files("ontobdc").joinpath("view").joinpath("plugin").joinpath("asset").joinpath("css")
        parts = [
            root.joinpath(name).read_text(encoding="utf-8")
            for name in _ANNOTATION_CSS_FILES
        ]
    except (FileNotFoundError, OSError, ModuleNotFoundError, TypeError):
        return ""
    return "\n".join(parts)


def _workstream_context_script() -> str:
    """Read ontobdc's workstream_context.js (dimension URI helper).

    Same cross-package-read rationale as `_annotation_runtime_script()`.
    """
    try:
        return (
            files("ontobdc")
            .joinpath("view")
            .joinpath("plugin")
            .joinpath("asset")
            .joinpath("js")
            .joinpath("workstream")
            .joinpath("workstream_context.js")
            .read_text(encoding="utf-8")
        )
    except (FileNotFoundError, OSError, ModuleNotFoundError, TypeError):
        return ""


def _escape_for_script_embedding(json_text: str) -> str:
    # A literal `</script>` inside the JSON payload would otherwise close
    # the embedding <script> tag early — same concern/fix as the Surface's
    # own JSON-LD embedding.
    return json_text.replace("</", "<\\/")


_DCTERMS_IDENTIFIER = "http://purl.org/dc/terms/identifier"


def _literal(entity_data: dict, property_uri: str) -> str:
    values = entity_data.get(property_uri)
    if not isinstance(values, list) or not values:
        return ""
    picked = values[0]
    if isinstance(picked, dict):
        return str(picked.get("@value") or picked.get("@id") or "").strip()
    return str(picked).strip()


def _resolve_identifier(entity_data: dict) -> str:
    # Same fallback order as each Tile's own client-side #literal()
    # resolution, so the file this writes to matches the URL a Tile's
    # "Open" link already constructs.
    return _literal(entity_data, _DCTERMS_IDENTIFIER) or str(entity_data.get("@id", ""))


def _dataset_folder_name(entity_id: str) -> Optional[str]:
    segments = str(entity_id or "").split("/")
    segments = [s for s in segments if s]
    if len(segments) < 2:
        return None
    return segments[-2]


def _build_workstream_payload(
    entity_data: dict,
    entity_id: str,
    identifier: str,
) -> Optional[Dict[str, str]]:
    dataset_name = _dataset_folder_name(entity_id)
    if not dataset_name:
        return None
    return {
        "projectId": entity_id,
        "elementId": identifier,
        "entity": "WorkStream",
        "workstreamUri": entity_id,
        "dimensionBaseUri": f"{entity_id}/dimension",
        "datapackagePath": ".__ontobdc__/datapackage.json",
        # NOTE: These two paths are *candidate* names, matching the
        # canonical reference runtime payload shape (techcenter-doc's
        # workstream_5w2h.js openContainer() parses these exact keys from
        # payload on line 1755+). They are intentionally left as canonical
        # names because the parser (WORKBOOK_PARSE_SCRIPT) implements a
        # layered multi-candidate fallback: if the canonical path is
        # missing in a given container, it walks the dataset's own
        # datapackage.json -> resources[*].entityIdentifier to find the
        # real per-entity linkset basename (facade.ttl), and it also
        # probes the sibling container-level metadata tree for
        # ro-crate/ontology artefacts that ship at the shared container
        # level rather than inside each dataset folder individually.
        # That way we keep the backend/frontend contract stable (exactly
        # the same shape as the reference runtime) while still supporting
        # containers generated at either granularity.
        "linksetPath": ".__ontobdc__/linkset/WorkStream.ttl",
        "resourceLinksetPath": ".__ontobdc__/linkset/WorkStreamResource.ttl",
        "roCratePath": ".__ontobdc__/ro-crate-metadata.json",
        "fileDisplayOntologyPath": ".__ontobdc__/ontology/file_display.ttl",
    }


def render_entity_view(
    entity_type_uris: List[str],
    entity_data: dict,
    *,
    graph_nodes: Optional[List[dict]] = None,
    language: str = "en",
) -> Optional[Dict[str, str]]:
    """Render a standalone detail Page for one entity.

    Returns `None` if no Page descriptor's `required_uris` matches any of
    `entity_type_uris` — the caller (ontobdc's orchestration capability)
    should skip that entity in that case, which is what makes this
    mechanism generic across entity types without any per-type code on the
    `ontobdc` side.

    Otherwise returns `{"html": ..., "path_segment": ..., "identifier": ...}`
    — the caller writes `html` to `view/<path_segment>/<identifier>.html`.
    All of that routing knowledge stays here, not in `ontobdc`.

    `entity_data` is the entity's own JSON-LD node. `graph_nodes` (defaults
    to just `[entity_data]` when omitted) is the wider Surface graph the
    Page may need to build a resource list from (e.g. the WorkStream Page's
    Related/Found tree) — embedded verbatim for the Page's own client-side
    script to read, mirroring how Tiles read the Surface-wide JSON-LD.
    """
    descriptor = _matching_page_descriptor(entity_type_uris)
    if descriptor is None:
        return None

    from jinja2 import Template

    metadata = descriptor.METADATA
    base_name = metadata.template.removesuffix(".html.j2")
    template_text = read_page_asset(metadata.template)
    css_content = read_page_asset(f"{base_name}.css")
    js_content = read_page_asset(f"{base_name}.js")

    entity_id = str(entity_data.get("@id", ""))
    identifier = _resolve_identifier(entity_data)
    nodes = graph_nodes if graph_nodes is not None else [entity_data]
    entity_json = _escape_for_script_embedding(
        json.dumps(nodes, ensure_ascii=False)
    )

    from .component.adapter.component_source import theme_catalog
    from .component.adapter.i18n import catalog_for_namespace

    theme_catalog_json = _escape_for_script_embedding(
        json.dumps(theme_catalog(), ensure_ascii=False)
    )
    i18n_json = _escape_for_script_embedding(
        json.dumps(catalog_for_namespace("work_stream_view"), ensure_ascii=False)
    )

    workstream_payload = _build_workstream_payload(entity_data, entity_id, identifier)
    workstream_payload_json = _escape_for_script_embedding(
        json.dumps(workstream_payload or {}, ensure_ascii=False)
    ) if workstream_payload else "null"

    html = Template(template_text).render(
        language=language,
        page_title=metadata.name,
        entity_id=entity_id,
        identifier=identifier,
        entity_json=entity_json,
        css_content=css_content,
        js_content=js_content,
        annotation_runtime_js=_annotation_runtime_script() or "",
        annotation_runtime_css=_annotation_runtime_style(),
        workstream_context_js=_workstream_context_script(),
        theme_catalog_json=theme_catalog_json,
        i18n_json=i18n_json,
        workstream_payload_json=workstream_payload_json,
        has_workstream_payload=workstream_payload is not None,
    )

    return {
        "html": html,
        "path_segment": metadata.path_segment,
        "identifier": identifier,
    }
