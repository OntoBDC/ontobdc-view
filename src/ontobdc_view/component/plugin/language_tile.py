from ontobdc.shared.adapter.config import UnsetProjectRootConfigDataAdapter
from ontobdc.shared.adapter.ontology import OntologyConfigAdapter
from ontobdc.shared.domain.model.component import ComponentMetadata
from ontobdc.shared.domain.port.component import ComponentPort

_VIEW = OntologyConfigAdapter(
    config_adapter=UnsetProjectRootConfigDataAdapter(),
).get_ontology_namespace_by_prefix("obdc_view")


class LanguageTileComponent(ComponentPort):
    """Chrome Tile: language switcher control.

    A Chrome Tile — matched by `tile_class`, not by a data entity. Backed by
    `ontobdc_view.build_language_tile()` (build.py), which resolves the
    `__ONTOBDC_BUILD_LANGUAGES__` placeholder in `onto-language-tile.js`.
    """

    METADATA = ComponentMetadata(
        id="org.ontobdc.view.plugin.component.language_tile",
        tag="onto-language-tile",
        tile_class=str(_VIEW.LanguageTile),
        version="1.0.0",
        name="Language Tile",
        description="Lets the viewer switch between the Surface's declared languages.",
        author=["http://kb.elias.eng.br/nid/elias.ttl#Elias"],
        tags=["view", "surface", "tile", "chrome", "language"],
        supported_languages=["en", "pt-BR", "pt-PT", "es"],
    )
