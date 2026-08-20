from abc import ABC, abstractmethod
from typing import Dict, Optional


class WorkstreamPayloadPort(ABC):
    """Builds the WorkStream Page's client-side runtime payload
    (`window.infoBimWorkStreamView`, read by `work_stream_view.js`).

    Only meaningful for a WorkStream entity nested under a dataset folder;
    other entity types render without one (the Page template's
    `has_workstream_payload` context flag is set accordingly).
    """

    @abstractmethod
    def build(
        self, entity_data: dict, entity_id: str, identifier: str
    ) -> Optional[Dict[str, str]]:
        """Return the runtime payload dict, or None if `entity_id` doesn't
        resolve to a dataset folder name."""
