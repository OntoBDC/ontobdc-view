from __future__ import annotations

from typing import Dict, Optional

from ontobdc_view.shared.domain.port.workstream_payload import WorkstreamPayloadPort


class WorkstreamPayloadAdapter(WorkstreamPayloadPort):
    """Builds `window.infoBimWorkStreamView` for the WorkStream Page.

    Paths are fixed, unprefixed `.__ontobdc__/...` locations, matching the
    reference runtime (`techcenter-doc`'s `workstream_5w2h.js`) for a
    WorkStream at a dataset's own root.
    """

    def build(
        self, entity_data: dict, entity_id: str, identifier: str
    ) -> Optional[Dict[str, str]]:
        dataset_name = self._dataset_folder_name(entity_id)
        if not dataset_name:
            return None
        return {
            "projectId": entity_id,
            "elementId": identifier,
            "entity": "WorkStream",
            "workstreamUri": entity_id,
            "dimensionBaseUri": f"{entity_id}/dimension",
            "datapackagePath": ".__ontobdc__/datapackage.json",
            "linksetPath": ".__ontobdc__/linkset/WorkStream.ttl",
            "resourceLinksetPath": ".__ontobdc__/linkset/WorkStreamResource.ttl",
            "roCratePath": ".__ontobdc__/ro-crate-metadata.json",
            "fileDisplayOntologyPath": ".__ontobdc__/ontology/file_display.ttl",
        }

    def _dataset_folder_name(self, entity_id: str) -> Optional[str]:
        segments = [segment for segment in str(entity_id or "").split("/") if segment]
        if len(segments) < 2:
            return None
        return segments[-2]
