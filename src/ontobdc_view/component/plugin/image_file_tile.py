from ontobdc.shared.domain.model.component import ComponentMetadata
from ontobdc.shared.domain.port.component import ComponentPort
from ontobdc.storage.adapter.bootstrap import OBDC


class ImageFileTileComponent(ComponentPort):
    """Renders an image preview Tile for an `obdc:ImageFile` entity."""

    METADATA = ComponentMetadata(
        id="org.ontobdc.view.plugin.component.image_file_tile",
        tag="onto-image-file-tile",
        version="1.0.0",
        name="Image File Tile",
        description="Previews an image file owned by the container.",
        author=["http://kb.elias.eng.br/nid/elias.ttl#Elias"],
        required_uris=[str(OBDC.ImageFile)],
        tags=["view", "surface", "tile", "files", "image"],
        supported_languages=["en", "pt-BR", "pt-PT", "es"],
        min_columns=6,
        max_columns=None,
        min_rows=5,
        max_rows=None,
        default_closed=True,
    )
