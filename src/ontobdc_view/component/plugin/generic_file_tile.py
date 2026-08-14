from ontobdc.shared.domain.model.component import ComponentMetadata
from ontobdc.shared.domain.port.component import ComponentPort
from ontobdc.storage.adapter.bootstrap import OBDC


class GenericFileTileComponent(ComponentPort):
    """Renders a metadata Tile for an `obdc:GenericFile` entity.

    Catch-all for any file whose extension doesn't match a dedicated Tile
    (image/PDF/CSV) — `DataGatheredCapability._file_type_uri` assigns
    `obdc:GenericFile` to everything else, so this always has exactly one
    matching Tile per file, never zero.
    """

    METADATA = ComponentMetadata(
        id="org.ontobdc.view.plugin.component.generic_file_tile",
        tag="onto-generic-file-tile",
        version="1.0.0",
        name="Generic File Tile",
        description="Shows metadata for a file with no dedicated preview Tile.",
        author=["http://kb.elias.eng.br/nid/elias.ttl#Elias"],
        required_uris=[str(OBDC.GenericFile)],
        tags=["view", "surface", "tile", "files", "metadata"],
        supported_languages=["en", "pt-BR", "pt-PT", "es"],
        min_columns=6,
        max_columns=None,
        min_rows=5,
        max_rows=None,
        default_closed=True,
    )
