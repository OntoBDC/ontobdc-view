from ontobdc.shared.domain.model.component import ComponentMetadata
from ontobdc.shared.domain.port.component import ComponentPort
from ontobdc.storage.adapter.bootstrap import StorageNamespaceBootstrap

StorageNamespaceBootstrap.initialize()
_OBDC = StorageNamespaceBootstrap.OBDC


class PdfFileTileComponent(ComponentPort):
    """Renders a PDF preview Tile for an `obdc:PdfFile` entity."""

    METADATA = ComponentMetadata(
        id="org.ontobdc.view.plugin.component.pdf_file_tile",
        tag="onto-pdf-file-tile",
        version="1.0.0",
        name="PDF File Tile",
        description="Previews a PDF file owned by the container.",
        author=["http://kb.elias.eng.br/nid/elias.ttl#Elias"],
        required_uris=[str(_OBDC.PdfFile)],
        tags=["view", "surface", "tile", "files", "pdf"],
        supported_languages=["en", "pt-BR", "pt-PT", "es"],
        min_columns=6,
        max_columns=None,
        min_rows=5,
        max_rows=None,
        default_closed=True,
    )
