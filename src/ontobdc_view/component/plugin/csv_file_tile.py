from ontobdc.shared.domain.model.component import ComponentMetadata
from ontobdc.shared.domain.port.component import ComponentPort
from ontobdc.storage.adapter.bootstrap import OBDC


class CsvFileTileComponent(ComponentPort):
    """Renders a table preview Tile for an `obdc:CsvFile` entity."""

    METADATA = ComponentMetadata(
        id="org.ontobdc.view.plugin.component.csv_file_tile",
        tag="onto-csv-file-tile",
        version="1.0.0",
        name="CSV File Tile",
        description="Previews a CSV file owned by the container as a table.",
        author=["http://kb.elias.eng.br/nid/elias.ttl#Elias"],
        required_uris=[str(OBDC.CsvFile)],
        tags=["view", "surface", "tile", "files", "csv"],
        supported_languages=["en", "pt-BR", "pt-PT", "es"],
        min_columns=6,
        max_columns=None,
        min_rows=5,
        max_rows=None,
        default_closed=True,
    )
