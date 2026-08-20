from __future__ import annotations

import json
from typing import Dict, List, Optional

from ontobdc_view.shared.domain.port.entity_view_render import EntityViewRenderPort

from .asset import PageAssetAdapter
from .descriptor import PageDescriptorAdapter
from .ontobdc_runtime_asset import OntobdcRuntimeAssetAdapter
from .workstream_payload import WorkstreamPayloadAdapter

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
    "i18n_apply",
    "graph_reader",
    "csv_preview",
    "container_connection",
    "connection_state",
    "annotation_bridge",
    "pyodide_runtime",
    "linkset_operations",
    "file_category",
    "dimension_card",
)


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
    ) -> None:
        self._page_descriptor = page_descriptor or PageDescriptorAdapter()
        self._page_asset = page_asset or PageAssetAdapter()
        self._runtime_asset = runtime_asset or OntobdcRuntimeAssetAdapter()
        self._workstream_payload = workstream_payload or WorkstreamPayloadAdapter()

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
        css_content = self._page_asset.read_page_asset(f"{base_name}.css")
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

        theme_catalog_json = self._escape_for_script_embedding(
            json.dumps(theme_catalog(), ensure_ascii=False)
        )
        i18n_json = self._escape_for_script_embedding(
            json.dumps(catalog_for_namespace("work_stream_view"), ensure_ascii=False)
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

        html = Template(template_text).render(
            language=language,
            page_title=metadata.name,
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
