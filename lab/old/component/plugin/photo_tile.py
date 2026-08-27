from ontobdc.shared.adapter.config import UnsetProjectRootConfigDataAdapter
from ontobdc.shared.adapter.ontology import OntologyConfigAdapter
from ontobdc.shared.domain.model.component import ComponentMetadata
from ontobdc.shared.domain.port.component import ComponentPort

_VIEW = OntologyConfigAdapter(
    config_adapter=UnsetProjectRootConfigDataAdapter(),
).get_ontology_namespace_by_prefix("obdc_view")


class PhotoTileComponent(ComponentPort):
    """Chrome Tile: a frozen photo, with caption/author/date/location.

    A Chrome Tile — matched by `tile_class`, not by a data entity, even
    though it renders content. `view.ttl` classifies it as `:PhotoTile`
    (a `:BrowserImageComponent`), not tied to a domain `DataEntity` type.
    Backed by `ontobdc_view.build_photo_tile()` (build.py), which resolves
    the `__ONTOBDC_BUILD_PHOTO__` placeholder in `onto-photo-tile.js`.
    """

    METADATA = ComponentMetadata(
        id="org.ontobdc.view.plugin.component.photo_tile",
        tag="onto-photo-tile",
        tile_class=str(_VIEW.PhotoTile),
        version="1.0.0",
        name="Photo Tile",
        description="Renders a frozen photo with caption, author, date, and location.",
        author=["http://kb.elias.eng.br/nid/elias.ttl#Elias"],
        tags=["view", "surface", "tile", "chrome", "photo"],
        supported_languages=["en", "pt-BR", "pt-PT", "es"],
    )
