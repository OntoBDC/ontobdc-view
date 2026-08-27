from ontobdc.shared.adapter.config import UnsetProjectRootConfigDataAdapter
from ontobdc.shared.adapter.ontology import OntologyConfigAdapter
from ontobdc.shared.domain.model.component import ComponentMetadata
from ontobdc.shared.domain.port.component import ComponentPort

_VIEW = OntologyConfigAdapter(
    config_adapter=UnsetProjectRootConfigDataAdapter(),
).get_ontology_namespace_by_prefix("obdc_view")


class DateTimeTileComponent(ComponentPort):
    """Chrome Tile for the viewer's local time and date-time."""

    METADATA = ComponentMetadata(
        id="org.ontobdc.view.plugin.component.date_time_tile",
        tag="onto-date-time-tile",
        tile_class=str(_VIEW.DateTimeTile),
        version="1.0.0",
        name="Date Time Tile",
        description="Shows local time at 1x1 and date-time when allocated 2x1.",
        author=["http://kb.elias.eng.br/nid/elias.ttl#Elias"],
        tags=["view", "surface", "tile", "chrome", "time", "date"],
        supported_languages=["en", "pt-BR", "pt-PT", "es"],
        min_columns=1,
        max_columns=2,
        min_rows=1,
        max_rows=1,
    )
