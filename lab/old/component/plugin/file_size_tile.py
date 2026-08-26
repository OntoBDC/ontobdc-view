from ontobdc.shared.adapter.config import UnsetProjectRootConfigDataAdapter
from ontobdc.shared.adapter.ontology import OntologyConfigAdapter
from ontobdc.shared.domain.model.component import ComponentMetadata
from ontobdc.shared.domain.port.component import ComponentPort

_VIEW = OntologyConfigAdapter(
    config_adapter=UnsetProjectRootConfigDataAdapter(),
).get_ontology_namespace_by_prefix("obdc_view")


class FileSizeTileComponent(ComponentPort):
    """Renders a compact 1x1 Tile with the total logical size of the current Surface payload."""

    METADATA = ComponentMetadata(
        id="org.ontobdc.view.plugin.component.file_size_tile",
        tag="onto-file-size-tile",
        tile_class=str(_VIEW.FileSizeTile),
        version="1.0.0",
        name="File Size Tile",
        description="Shows total logical file size using an appropriate byte magnitude.",
        author=["http://kb.elias.eng.br/nid/elias.ttl#Elias"],
        tags=["view", "surface", "tile", "files", "metadata", "size"],
        supported_languages=["en", "pt-BR", "pt-PT", "es"],
        min_columns=1,
        max_columns=1,
        min_rows=1,
        max_rows=1,
    )
