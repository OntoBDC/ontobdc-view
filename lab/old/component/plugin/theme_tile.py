from ontobdc.shared.adapter.config import UnsetProjectRootConfigDataAdapter
from ontobdc.shared.adapter.ontology import OntologyConfigAdapter
from ontobdc.shared.domain.model.component import ComponentMetadata
from ontobdc.shared.domain.port.component import ComponentPort

_VIEW = OntologyConfigAdapter(
    config_adapter=UnsetProjectRootConfigDataAdapter(),
).get_ontology_namespace_by_prefix("obdc_view")


class ThemeTileComponent(ComponentPort):
    """Chrome Tile: theme switcher control.

    A Chrome Tile — matched by `tile_class`, not by a data entity. Backed by
    `ontobdc_view.build_theme_tile()` (build.py), which resolves the
    `__ONTOBDC_BUILD_THEMES__` placeholder in `onto-theme-tile.js`.
    """

    METADATA = ComponentMetadata(
        id="org.ontobdc.view.plugin.component.theme_tile",
        tag="onto-theme-tile",
        tile_class=str(_VIEW.ThemeTile),
        version="1.0.0",
        name="Theme Tile",
        description="Lets the viewer switch between the Surface's declared themes.",
        author=["http://kb.elias.eng.br/nid/elias.ttl#Elias"],
        tags=["view", "surface", "tile", "chrome", "theme"],
        supported_languages=["en", "pt-BR", "pt-PT", "es"],
    )
