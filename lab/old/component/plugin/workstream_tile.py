from rdflib.namespace import DCTERMS

from ontobdc.shared.domain.model.component import ComponentMetadata
from ontobdc.shared.domain.port.component import ComponentPort

WORK_STREAM_TYPE_URI = (
    "http://datacenter.app.br/ontology/productivity/entity/work_stream/"
    "type.ttl#WorkStream"
)


class WorkStreamTileComponent(ComponentPort):
    """Renders a summary Tile for a WorkStream entity.

    Direct-representation example for `obdc:SurfaceableEntity`: WorkStream
    is marked surfaceable in its own type.ttl (materialized into each
    dataset's dataset.ttl at creation time), so it auto-matches here like
    `obdc:DataContainer` does — no click required, unlike the per-file
    viewer Tiles, which stay closed until opened.

    Shows title, identifier and Description by default; the remaining
    5W2H fields stay collapsed behind the Tile's own expand toggle.
    """

    METADATA = ComponentMetadata(
        id="org.ontobdc.view.plugin.component.workstream_tile",
        tag="onto-workstream-tile",
        version="1.0.0",
        name="WorkStream Tile",
        description="Summarizes a WorkStream entity (title, identifier).",
        author=["http://kb.elias.eng.br/nid/elias.ttl#Elias"],
        required_uris=[WORK_STREAM_TYPE_URI],
        tags=["view", "surface", "tile", "workstream", "entity"],
        supported_languages=["en", "pt-BR", "pt-PT", "es"],
        min_columns=6,
        max_columns=None,
        min_rows=3,
        max_rows=3,
        size_property=str(DCTERMS.title),
        chars_per_column=4,
    )
