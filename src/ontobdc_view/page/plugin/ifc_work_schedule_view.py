from ontobdc.shared.domain.model.page import PageMetadata
from ontobdc.shared.domain.port.page import PagePort

IFC_WORK_SCHEDULE_TYPE_URI = "https://infobim.org/ontology/ns#IfcWorkSchedule"


class IfcWorkScheduleViewPage(PagePort):
    METADATA = PageMetadata(
        id="org.ontobdc.view.plugin.page.ifc_work_schedule_view",
        template="ifc_work_schedule_view.html.j2",
        path_segment="ifc_work_schedule",
        version="1.0.0",
        name="IfcWorkSchedule Gantt View",
        description="Static standalone Gantt page for an IfcWorkSchedule entity with task table, timeline bars, milestones, and dependency arrows.",
        author=["http://kb.elias.eng.br/nid/elias.ttl#Elias"],
        required_uris=[IFC_WORK_SCHEDULE_TYPE_URI],
        tags=["view", "page", "gantt", "ifc", "schedule", "entity"],
        supported_languages=["en", "pt-BR", "pt-PT", "es"],
    )
