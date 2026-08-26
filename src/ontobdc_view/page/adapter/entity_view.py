from __future__ import annotations

import json
from typing import Dict, List, Optional

from ontobdc_view.shared.domain.port.entity_view_render import EntityViewRenderPort

from .asset import PageAssetAdapter
from .descriptor import PageDescriptorAdapter
from .runtime import OntobdcRuntimeAssetAdapter
from .gantt_payload import GanttPayloadAdapter
from .workstream_payload import WorkstreamPayloadAdapter


# This package declares no dependency on ontobdc, so the url-state bootstrap
# it embeds has to be optional: importing it at module scope made
# `import ontobdc_view` itself fail against any ontobdc without the symbol.
# The parameter names are the contract, not the import — they are declared
# here so a Page keeps carrying state even when the bootstrap is absent, the
# same self-sufficiency every Tile is held to.
LANGUAGE_PARAM = "lang"
THEME_PARAM = "theme"


def _url_state_bootstrap(defaults: dict) -> str:
    """The bootstrap script tag, or "" when ontobdc does not provide one.

    An empty bootstrap costs this Page its URL normalization, nothing more:
    the theme script and the back-link both resolve presentation state on
    their own, so the Page still opens and navigates in the state its link
    carried.
    """
    try:
        from ontobdc.view.adapter.surface.document import build_url_state_bootstrap
    except ImportError:
        return ""
    try:
        return build_url_state_bootstrap(defaults)
    except Exception:
        return ""


_DCTERMS_IDENTIFIER = "http://purl.org/dc/terms/identifier"

# Load order matters: dimension_card.js's render() bootstrap must run last,
# after every other split script has attached its exports onto
# window.OntoBDCWorkStreamViewRuntime — see WorkStreamScriptAdapter's own
# _BUILDERS for the authoritative content behind each name. Written to
# `.__ontobdc__/asset/work_stream_view/<name>.js` inside the container by
# the matching work_stream_*_script_generated Capability (ontobdc-wip), not
# packaged with ontobdc_view itself — hence the relative <script src>
# rather than an inlined {{ js_content }} block.
_WORKSTREAM_SCRIPT_NAMES = (
    "xlsx-0.18.5.full.min",
    "i18n_apply",
    "graph_reader",
    "csv_preview",
    "container_connection",
    "connection_state",
    "chrome_controls",
    "annotation_bridge",
    "pyodide_runtime",
    "linkset_operations",
    "file_category",
    "dimension_card",
)

_GANTT_SCRIPT_NAMES = (
    "xlsx-0.18.5.full.min",
    "i18n_apply",
    "graph_reader",
    "container_connection",
    "connection_state",
    "chrome_controls",
    "pyodide_runtime",
    "task_table_timeline",
    "dependency_arrows",
)

_IFC_WORK_SCHEDULE_TYPE_URI = "https://infobim.org/ontology/ns#IfcWorkSchedule"


def _short_title_from_page_name(page_name: str) -> str:
    """Derive a breadcrumb-friendly short title from ``PageMetadata.name``.

    *No hardcoded list of page names here* -- the rule is purely syntactic
    over the naming convention already in use for every ``PageMetadata``:
    ``"<EntityType> <CapabilityKind> View"``.  We strip the trailing
    ``" View"`` suffix and take the last *meaningful* whitespace-separated
    token, so ``"IfcWorkSchedule Gantt View"`` becomes ``"Gantt"``,
    ``"Work Stream View"`` becomes ``"Work Stream"``, and any future Page
    whose name follows the same convention gets a clean breadcrumb title
    without changes to this function.
    """
    name = str(page_name or "").strip()
    without_suffix = name.removesuffix(" View") if name.endswith(" View") else name
    tokens = [token for token in without_suffix.split() if token]
    if len(tokens) <= 1:
        return without_suffix or name
    # Skip the first token (it's the IfcXXX entity type or Work/Stream kind
    # prefix) and keep the last N words that name the view concept.
    return " ".join(tokens[1:])


class EntityViewRenderAdapter(EntityViewRenderPort):
    """Renders a standalone detail Page for one entity via Jinja.

    Orchestrates `PageDescriptorAdapter` (find the right Page),
    `PageAssetAdapter` (read its template/CSS/JS), `OntobdcRuntimeAssetAdapter`
    (inline ontobdc's annotation/workstream-context runtime), and
    `WorkstreamPayloadAdapter` (WorkStream-specific runtime payload).

    Theme/i18n catalogs come from the Component namespace
    (`ontobdc_view.component.adapter.source`, `ontobdc_view.component.adapter.i18n`),
    imported lazily inside `render()` rather than at module load time —
    same reason the original top-level `render_entity_view()` did: this
    Page-rendering path must still import cleanly even before the
    Component namespace is available/importable.
    """

    def __init__(
        self,
        *,
        page_descriptor: Optional[PageDescriptorAdapter] = None,
        page_asset: Optional[PageAssetAdapter] = None,
        runtime_asset: Optional[OntobdcRuntimeAssetAdapter] = None,
        workstream_payload: Optional[WorkstreamPayloadAdapter] = None,
        gantt_payload: Optional[GanttPayloadAdapter] = None,
    ) -> None:
        self._page_descriptor = page_descriptor or PageDescriptorAdapter()
        self._page_asset = page_asset or PageAssetAdapter()
        self._runtime_asset = runtime_asset or OntobdcRuntimeAssetAdapter()
        self._workstream_payload = workstream_payload or WorkstreamPayloadAdapter()
        self._gantt_payload = gantt_payload or GanttPayloadAdapter()

    def render_entity_view(
        self,
        entity_type_uris: List[str],
        entity_data: dict,
        *,
        graph_nodes: Optional[List[dict]] = None,
        language: str = "en",
    ) -> Optional[Dict[str, str]]:
        descriptor = self._page_descriptor.matching_descriptor(entity_type_uris)
        if descriptor is None:
            return None

        from jinja2 import Template

        metadata = descriptor.METADATA
        base_name = metadata.template.removesuffix(".html.j2")
        template_text = self._page_asset.read_page_asset(metadata.template)
        # Chrome first, the Page's own stylesheet after it, so a Page can
        # override any shared rule while none of them has to restate the
        # header, breadcrumb and connection buttons it shares with every
        # other Page.
        css_content = "\n".join(
            (
                self._page_asset.read_page_asset("page_chrome.css"),
                self._page_asset.read_page_asset(f"{base_name}.css"),
            )
        )
        # Not every Page ships a packaged monolithic `<base_name>.js` —
        # the WorkStream Page's runtime is generated per-container instead
        # (see _WORKSTREAM_SCRIPT_NAMES below), so its own `work_stream_view.js`
        # packaged asset was deliberately never restored.
        try:
            js_content = self._page_asset.read_page_asset(f"{base_name}.js")
        except FileNotFoundError:
            js_content = ""

        entity_id = str(entity_data.get("@id", ""))
        identifier = self._resolve_identifier(entity_data)
        nodes = graph_nodes if graph_nodes is not None else [entity_data]
        entity_json = self._escape_for_script_embedding(
            json.dumps(nodes, ensure_ascii=False)
        )

        from ontobdc_view.component.adapter.i18n import catalog_for_namespace
        from ontobdc_view.component.adapter.source import theme_catalog

        themes = theme_catalog()
        theme_catalog_json = self._escape_for_script_embedding(
            json.dumps(themes, ensure_ascii=False)
        )
        # Same runtime the Surface embeds, on the same terms: this Page is a
        # generated page too, so it normalizes its own address bar, applies
        # the URL language before first paint, and hands its internal links
        # (the back-link) the one helper that carries presentation state.
        # Its defaults are this render's language and the first theme —
        # only ever a fallback, since a link that opened this page already
        # carries the state the user actually selected.
        url_state_bootstrap = _url_state_bootstrap(
            {
                LANGUAGE_PARAM: language,
                **(
                    {THEME_PARAM: str(themes[0].get("name") or "")}
                    if themes and isinstance(themes[0], dict) and themes[0].get("name")
                    else {}
                ),
            }
        )
        # Each Page reads its own namespace, derived from the segment it
        # already declares. Hardcoding "work_stream_view" gave every Page the
        # WorkStream's strings — the schedule Page offered to "Reload 5W2H
        # values from the WorkStream workbook". Unknown namespaces still fall
        # back to "common", so a Page without its own block is not broken by
        # this, only untranslated.
        i18n_json = self._escape_for_script_embedding(
            json.dumps(
                catalog_for_namespace(f"{metadata.path_segment}_view"),
                ensure_ascii=False,
            )
        )

        workstream_payload = self._workstream_payload.build(
            entity_data, entity_id, identifier
        )
        workstream_payload_json = (
            self._escape_for_script_embedding(
                json.dumps(workstream_payload, ensure_ascii=False)
            )
            if workstream_payload
            else "null"
        )

        # A schedule Page only gets its runtime when it can name the dataset
        # folder to connect to; without one there is no workbook to read and
        # the Page stays the build-time render it always was.
        gantt_payload = (
            self._gantt_payload.build(entity_data, entity_id, identifier)
            if _IFC_WORK_SCHEDULE_TYPE_URI in entity_type_uris
            else None
        )
        gantt_payload_json = (
            self._escape_for_script_embedding(
                json.dumps(gantt_payload, ensure_ascii=False)
            )
            if gantt_payload
            else "null"
        )
        has_gantt_payload = gantt_payload is not None
        html = Template(template_text).render(
            language=language,
            url_state_bootstrap=url_state_bootstrap,
            page_title=metadata.name,
            breadcrumb_current_title=_short_title_from_page_name(metadata.name),
            entity_id=entity_id,
            identifier=identifier,
            entity_json=entity_json,
            css_content=css_content,
            js_content=js_content,
            annotation_runtime_js=self._runtime_asset.annotation_runtime_script() or "",
            annotation_runtime_css=self._runtime_asset.annotation_runtime_style(),
            workstream_context_js=self._runtime_asset.workstream_context_script(),
            theme_catalog_json=theme_catalog_json,
            i18n_json=i18n_json,
            workstream_payload_json=workstream_payload_json,
            has_workstream_payload=workstream_payload is not None,
            workstream_script_names=_WORKSTREAM_SCRIPT_NAMES,
            has_gantt_payload=has_gantt_payload,
            gantt_script_names=_GANTT_SCRIPT_NAMES,
            gantt_payload_json=gantt_payload_json,
        )

        return {
            "html": html,
            "path_segment": metadata.path_segment,
            "identifier": identifier,
        }

    def _literal(self, entity_data: dict, property_uri: str) -> str:
        values = entity_data.get(property_uri)
        if not isinstance(values, list) or not values:
            return ""
        picked = values[0]
        if isinstance(picked, dict):
            return str(picked.get("@value") or picked.get("@id") or "").strip()
        return str(picked).strip()

    def _resolve_identifier(self, entity_data: dict) -> str:
        # Same fallback order as each Tile's own client-side #literal()
        # resolution, so the file this writes to matches the URL a Tile's
        # "Open" link already constructs.
        return self._literal(entity_data, _DCTERMS_IDENTIFIER) or str(
            entity_data.get("@id", "")
        )

    @staticmethod
    def _escape_for_script_embedding(json_text: str) -> str:
        # A literal `</script>` inside the JSON payload would otherwise
        # close the embedding <script> tag early — same concern/fix as the
        # Surface's own JSON-LD embedding.
        return json_text.replace("</", "<\\/")
