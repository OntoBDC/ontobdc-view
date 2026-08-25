from abc import ABC, abstractmethod
from typing import Dict, Optional


class GanttPayloadPort(ABC):
    """Builds the IfcWorkSchedule Page's client-side runtime payload
    (`window.infoBimIfcWorkScheduleView`, read by the Page's generated
    scripts).

    The WorkStream Page's counterpart, on the same terms: the payload
    carries *paths* into the container, never data. What the Page shows is
    read at runtime from the folder the user connects, so the published
    HTML never has to embed a workbook it cannot keep fresh.

    Only meaningful for a schedule nested under a dataset folder; anything
    else renders without one, and the template's `has_gantt_payload` flag
    follows.
    """

    @abstractmethod
    def build(
        self, entity_data: dict, entity_id: str, identifier: str
    ) -> Optional[Dict[str, str]]:
        """Return the runtime payload dict, or None if `entity_id` doesn't
        resolve to a dataset folder name."""
