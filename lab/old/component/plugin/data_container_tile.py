from rdflib.namespace import DCTERMS

from ontobdc.shared.domain.model.component import ComponentMetadata
from ontobdc.shared.domain.port.component import ComponentPort
from ontobdc.storage.adapter.bootstrap import StorageNamespaceBootstrap

StorageNamespaceBootstrap.initialize()
_OBDC = StorageNamespaceBootstrap.OBDC


class DataContainerTileComponent(ComponentPort):
    """Renders a summary Tile for an `obdc:DataContainer` entity.

    First registered Component, mainly to exercise ComponentLoader.match()
    end to end: the only entity DATA_GATHERED produces for a container with
    no datasets yet is the container itself. The custom element the `tag`
    names displays the entity's `dcterms:title`, so `size_property` +
    `chars_per_column` let the requesting capability size the Tile wide
    enough to hold the full title instead of guessing a fixed width.
    """

    METADATA = ComponentMetadata(
        id="org.ontobdc.view.plugin.component.data_container_tile",
        tag="onto-data-container-tile",
        version="1.0.0",
        name="Data Container Tile",
        description="Summarizes a DataContainer entity (title, description, location).",
        author=["http://kb.elias.eng.br/nid/elias.ttl#Elias"],
        required_uris=[str(_OBDC.DataContainer)],
        tags=["view", "surface", "tile", "container"],
        supported_languages=["en", "pt-BR", "pt-PT", "es"],
        min_columns=1,
        max_columns=6,
        min_rows=2,
        max_rows=2,
        size_property=str(DCTERMS.title),
        chars_per_column=4,
    )
