from ontobdc.shared.adapter.config import UnsetProjectRootConfigDataAdapter
from ontobdc.shared.adapter.ontology import OntologyConfigAdapter
from ontobdc.shared.domain.model.component import ComponentMetadata
from ontobdc.shared.domain.port.component import ComponentPort

_VIEW = OntologyConfigAdapter(
    config_adapter=UnsetProjectRootConfigDataAdapter(),
).get_ontology_namespace_by_prefix("obdc_view")


class LogoTileComponent(ComponentPort):
    """Chrome Tile: brand identity (name, mark, logotype, slogan).

    A Chrome Tile — matched by `tile_class`, not by a data entity. Backed by
    `ontobdc_view.build_logo_tile()` (build.py), which resolves the
    `__ONTOBDC_BUILD_BRAND__` placeholder in `onto-logo-tile.js`.
    """

    METADATA = ComponentMetadata(
        id="org.ontobdc.view.plugin.component.logo_tile",
        tag="onto-logo-tile",
        tile_class=str(_VIEW.LogoTile),
        version="1.0.0",
        name="Logo Tile",
        description="Renders brand identity (name, mark, logotype, slogan).",
        author=["http://kb.elias.eng.br/nid/elias.ttl#Elias"],
        tags=["view", "surface", "tile", "chrome", "branding"],
        supported_languages=["en", "pt-BR", "pt-PT", "es"],
    )
