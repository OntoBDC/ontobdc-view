from abc import ABC, abstractmethod
from typing import List, Optional, Type

from ontobdc.shared.domain.port.page import PagePort


class PageDescriptorPort(ABC):
    """Discovers and matches `PagePort` descriptors registered under
    `ontobdc_view.page.plugin`.

    A descriptor's `METADATA.required_uris` declares which entity
    `rdf:type` URIs it renders; matching is by simple set intersection,
    first descriptor found wins — mirrors how Tile placement resolution
    matches a component type IRI to a Tile.
    """

    @abstractmethod
    def matching_descriptor(
        self, entity_type_uris: List[str]
    ) -> Optional[Type[PagePort]]:
        """Return the first registered Page descriptor whose
        `METADATA.required_uris` intersects `entity_type_uris`, or None."""
