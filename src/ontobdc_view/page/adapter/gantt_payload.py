from __future__ import annotations

from typing import Dict, Optional

from ontobdc_view.shared.domain.port.gantt_payload import GanttPayloadPort


class GanttPayloadAdapter(GanttPayloadPort):
    """Builds `window.infoBimIfcWorkScheduleView` for the IfcWorkSchedule Page.

    Mirrors `WorkstreamPayloadAdapter` field for field, including the fixed
    unprefixed `.__ontobdc__/...` locations: a schedule sits at its own
    dataset's root exactly as a WorkStream does, so the same layout applies
    and there is nothing here for the two Pages to disagree about.

    `resourceName` names the datapackage resource the container connection
    checks for, and the sheet the workbook parse reads the root row from —
    the same string the shared container runtime is configured with.
    """

    RESOURCE_NAME = "ifc_work_schedule"

    def build(
        self, entity_data: dict, entity_id: str, identifier: str
    ) -> Optional[Dict[str, str]]:
        dataset_name = self._dataset_folder_name(entity_id)
        if not dataset_name:
            return None
        return {
            "projectId": entity_id,
            "elementId": identifier,
            "entity": "IfcWorkSchedule",
            "scheduleUri": entity_id,
            "resourceName": self.RESOURCE_NAME,
            "datapackagePath": ".__ontobdc__/datapackage.json",
            "linksetPath": ".__ontobdc__/linkset/ns.ttl",
            "viewLinksetPath": ".__ontobdc__/linkset/view.ttl",
            "roCratePath": ".__ontobdc__/ro-crate-metadata.json",
        }

    def _dataset_folder_name(self, entity_id: str) -> Optional[str]:
        segments = [segment for segment in str(entity_id or "").split("/") if segment]
        if len(segments) < 2:
            return None
        return segments[-2]
