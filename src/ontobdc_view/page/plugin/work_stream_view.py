from ontobdc.shared.domain.model.page import PageMetadata
from ontobdc.shared.domain.port.page import PagePort

WORK_STREAM_TYPE_URI = (
    "http://datacenter.app.br/ontology/productivity/entity/work_stream/"
    "type.ttl#WorkStream"
)


class WorkStreamViewPage(PagePort):
    """Standalone detail page for a WorkStream entity.

    Renders the full 5W2H view (fields, resource tree, annotations) that
    the WorkStream Tile's "Open" button links to
    (`view/work_stream/{identifier}.html`), matching the Tile's own visual
    identity rather than introducing a new look.
    """

    METADATA = PageMetadata(
        id="org.ontobdc.view.plugin.page.work_stream_view",
        template="work_stream_view.html.j2",
        path_segment="work_stream",
        version="1.0.0",
        name="WorkStream View",
        description="Full 5W2H detail page for a WorkStream entity.",
        author=["http://kb.elias.eng.br/nid/elias.ttl#Elias"],
        required_uris=[WORK_STREAM_TYPE_URI],
        tags=["view", "page", "workstream", "entity"],
        supported_languages=["en", "pt-BR", "pt-PT", "es"],
    )
