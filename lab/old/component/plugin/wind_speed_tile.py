from ontobdc.shared.adapter.config import UnsetProjectRootConfigDataAdapter
from ontobdc.shared.adapter.ontology import OntologyConfigAdapter
from ontobdc.shared.domain.model.component import ComponentMetadata
from ontobdc.shared.domain.port.component import ComponentPort

_VIEW = OntologyConfigAdapter(
    config_adapter=UnsetProjectRootConfigDataAdapter(),
).get_ontology_namespace_by_prefix("obdc_view")


class WindSpeedTileComponent(ComponentPort):
    """Weather Tile for current wind speed, direction and gusts."""

    METADATA = ComponentMetadata(
        id="org.ontobdc.view.plugin.component.wind_speed_tile",
        tag="onto-wind-speed-tile",
        tile_class=str(_VIEW.WindSpeedTile),
        version="1.0.0",
        name="Wind Speed Tile",
        description="Shows current wind speed and progressively reveals direction and gusts as space grows.",
        author=["http://kb.elias.eng.br/nid/elias.ttl#Elias"],
        tags=["view", "surface", "tile", "weather", "wind"],
        supported_languages=["en", "pt-BR", "pt-PT", "es"],
        min_columns=1,
        max_columns=3,
        min_rows=1,
        max_rows=2,
    )
