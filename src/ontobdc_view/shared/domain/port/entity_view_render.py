from abc import ABC, abstractmethod
from typing import Dict, List, Optional


class EntityViewRenderPort(ABC):
    """Renders a standalone detail Page (template + CSS + JS, with embedded
    JSON-LD/theme/i18n/runtime-payload) for one entity, if a matching Page
    descriptor exists.
    """

    @abstractmethod
    def render_entity_view(
        self,
        entity_type_uris: List[str],
        entity_data: dict,
        *,
        graph_nodes: Optional[List[dict]] = None,
        language: str = "en",
    ) -> Optional[Dict[str, str]]:
        """Return `{"html", "path_segment", "identifier"}`, or None if no
        Page descriptor matches `entity_type_uris`."""
