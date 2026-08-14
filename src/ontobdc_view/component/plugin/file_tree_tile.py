from ontobdc.shared.domain.model.component import ComponentMetadata
from ontobdc.shared.domain.port.component import ComponentPort
from ontobdc.storage.adapter.bootstrap import OBDC


class FileTreeTileComponent(ComponentPort):
    """Renders a file/directory tree Tile for an `obdc:FileTree` entity.

    Matches the entity `DataGatheredCapability._add_file_tree_entity`
    produces: one `obdc:filePath` literal per container file (the RO-Crate
    payload), which the custom element rebuilds into a tree client-side.
    """

    METADATA = ComponentMetadata(
        id="org.ontobdc.view.plugin.component.file_tree_tile",
        tag="onto-file-tree-tile",
        version="1.0.0",
        name="File Tree Tile",
        description="Renders the container's own files as a directory tree.",
        author=["http://kb.elias.eng.br/nid/elias.ttl#Elias"],
        required_uris=[str(OBDC.FileTree)],
        tags=["view", "surface", "tile", "files"],
        supported_languages=["en", "pt-BR", "pt-PT", "es"],
        min_columns=6,
        max_columns=None,
        min_rows=4,
        max_rows=None,
    )
