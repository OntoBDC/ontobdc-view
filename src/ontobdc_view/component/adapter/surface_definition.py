from __future__ import annotations

from importlib.resources import files
from typing import List, Literal, Optional

from pydantic import BaseModel, Field
from rdflib import Graph, Namespace, URIRef
from rdflib.namespace import RDF

# `view.ttl#` terms this parser understands. Defined as local constants
# rather than resolved through `OntologyConfigAdapter` (see logo_tile.py) —
# that adapter requires a CLI "project root" context
# (`ProjectRootDirectoryNotSetError` otherwise), which a standalone RDF
# parser (and its tests) must not depend on. Same pattern as
# `WORK_STREAM_TYPE_URI` in workstream_tile.py.
VIEW = Namespace("http://datacenter.app.br/ontology/ontobdc/domain/view.ttl#")

_REGION_ROLE_BY_TYPE = {
    VIEW.OperationRegion: "OperationRegion",
    VIEW.ContentRegion: "ContentRegion",
    VIEW.PinnedRegion: "PinnedRegion",
}

_ALIGNMENT_BY_IRI = {
    VIEW.StartAlignment: "start",
    VIEW.CenterAlignment: "center",
    VIEW.EndAlignment: "end",
}

_ALIGNMENT_RANK = {"start": 0, "center": 1, "end": 2}

Alignment = Literal["start", "center", "end"]
RegionRole = Literal["OperationRegion", "ContentRegion", "PinnedRegion", "PresentationRegion"]


class SurfaceDefinitionError(ValueError):
    """A Surface RDF graph is missing, contradictory, or otherwise unusable.

    Raised instead of silently producing a partial/incorrect Surface — see
    the CLAUDE.md intervention brief's "fail loudly" requirement.
    """


class ComponentPlacementDefinition(BaseModel):
    iri: str
    component_iri: str
    component_type_iri: Optional[str] = None
    alignment: Alignment = "start"
    order: int = 0


class RegionDefinition(BaseModel):
    iri: str
    role: RegionRole
    row_start: Optional[int] = None
    column_start: Optional[int] = None
    row_span: Optional[int] = None
    column_span: Optional[int] = None
    scrollable: bool = False
    placements: List[ComponentPlacementDefinition] = Field(default_factory=list)


class SurfaceDefinition(BaseModel):
    iri: str
    columns: Optional[int] = None
    rows: Optional[int] = None
    slot_target: Optional[float] = None
    gap: Optional[float] = None
    padding: Optional[float] = None
    regions: List[RegionDefinition] = Field(default_factory=list)

    # `view:DefaultSurfaceLayout` is a specialization of `view:PresentationSurface`
    # (claude2.md) — the same model doubles as a default-layout candidate
    # instead of introducing a separate wrapper type. These stay None for an
    # ordinary explicit PresentationSurface.
    is_default_layout: bool = False
    min_available_columns: Optional[int] = None
    max_available_columns: Optional[int] = None
    min_available_rows: Optional[int] = None
    max_available_rows: Optional[int] = None
    layout_priority: Optional[int] = None


def parse_surface_definition(graph: Graph, surface: URIRef) -> SurfaceDefinition:
    """Parse one `view:PresentationSurface` (or `view:DefaultSurfaceLayout`,
    which claude2.md defines as a specialization of it) focus node into a
    `SurfaceDefinition`.

    Plain `rdflib.Graph` graphs carry no RDFS/OWL reasoner, so a
    `DefaultSurfaceLayout` instance asserting only `a view:DefaultSurfaceLayout`
    (as claude2.md's own example does, never `a view:PresentationSurface`
    too) would not otherwise be recognized as a Surface — both root types
    are accepted explicitly instead of relying on subclass inference.

    Raises `SurfaceDefinitionError` for anything the Surface's own SHACL
    shapes would reject, so a contradictory or incomplete graph never
    silently produces a broken/partial screen.
    """
    is_default_layout = (surface, RDF.type, VIEW.DefaultSurfaceLayout) in graph
    if not is_default_layout and (surface, RDF.type, VIEW.PresentationSurface) not in graph:
        raise SurfaceDefinitionError(
            f"{surface} is not a view:PresentationSurface or view:DefaultSurfaceLayout"
        )

    regions = [
        _parse_region(graph, region_node)
        for region_node in graph.objects(surface, VIEW.hasRegion)
    ]
    _require_at_most_one_per_role(regions)

    min_available_columns = _optional_positive_int(graph, surface, VIEW.minAvailableColumns)
    max_available_columns = _optional_positive_int(graph, surface, VIEW.maxAvailableColumns)
    min_available_rows = _optional_positive_int(graph, surface, VIEW.minAvailableRows)
    max_available_rows = _optional_positive_int(graph, surface, VIEW.maxAvailableRows)
    _require_min_not_exceeding_max(surface, "columns", min_available_columns, max_available_columns)
    _require_min_not_exceeding_max(surface, "rows", min_available_rows, max_available_rows)

    return SurfaceDefinition(
        iri=str(surface),
        columns=_optional_positive_int(graph, surface, VIEW.columnCount),
        rows=_optional_positive_int(graph, surface, VIEW.rowCount),
        slot_target=_optional_positive_float(graph, surface, VIEW.slotTarget),
        gap=_optional_non_negative_float(graph, surface, VIEW.gap),
        padding=_optional_non_negative_float(graph, surface, VIEW.padding),
        regions=regions,
        is_default_layout=is_default_layout,
        min_available_columns=min_available_columns,
        max_available_columns=max_available_columns,
        min_available_rows=min_available_rows,
        max_available_rows=max_available_rows,
        layout_priority=_optional_int(graph, surface, VIEW.layoutPriority),
    )


def default_surface_layouts() -> List[SurfaceDefinition]:
    """The shipped fallback `DefaultSurfaceLayout` (Logo/Language/Theme in an
    unbounded, always-matching OperationRegion) — used by
    `ontobdc.SurfaceOperationalMatchedCapability` whenever a container
    configures no `view.surfaceLayoutsPath` of its own, so a fresh project
    gets a sensible operational Surface with zero configuration. A project
    that supplies its own layouts file replaces this entirely rather than
    merging with it.
    """
    source = files("ontobdc_view").joinpath(
        "component", "asset", "default_surface_layouts.ttl"
    ).read_text(encoding="utf-8")
    graph = Graph()
    graph.parse(data=source, format="turtle")
    return parse_default_surface_layouts(graph)


def parse_default_surface_layouts(graph: Graph) -> List[SurfaceDefinition]:
    """Parse every `view:DefaultSurfaceLayout` instance in `graph`.

    Convenience for assembling a `DefaultSurfaceSelector` candidate set
    without the caller needing to already know each layout's IRI.
    """
    return [
        parse_surface_definition(graph, layout_node)
        for layout_node in graph.subjects(RDF.type, VIEW.DefaultSurfaceLayout)
    ]


def _require_min_not_exceeding_max(
    subject: URIRef, axis: str, minimum: Optional[int], maximum: Optional[int]
) -> None:
    if minimum is not None and maximum is not None and minimum > maximum:
        raise SurfaceDefinitionError(
            f"{subject} has minAvailable{axis.capitalize()} ({minimum}) "
            f"greater than maxAvailable{axis.capitalize()} ({maximum})"
        )


def _parse_region(graph: Graph, region: URIRef) -> RegionDefinition:
    role = _region_role(graph, region)
    placements = [
        _parse_placement(graph, placement_node)
        for placement_node in graph.objects(region, VIEW.hasComponentPlacement)
    ]
    placements.sort(key=lambda placement: (_ALIGNMENT_RANK[placement.alignment], placement.order, placement.iri))

    return RegionDefinition(
        iri=str(region),
        role=role,
        row_start=_optional_positive_int(graph, region, VIEW.rowStart),
        column_start=_optional_positive_int(graph, region, VIEW.columnStart),
        row_span=_optional_positive_int(graph, region, VIEW.rowSpan),
        column_span=_optional_positive_int(graph, region, VIEW.columnSpan),
        scrollable=_optional_bool(graph, region, VIEW.scrollable, default=False),
        placements=placements,
    )


def _region_role(graph: Graph, region: URIRef) -> RegionRole:
    types = set(graph.objects(region, RDF.type))
    for type_iri, role in _REGION_ROLE_BY_TYPE.items():
        if type_iri in types:
            return role
    if VIEW.PresentationRegion in types:
        return "PresentationRegion"
    raise SurfaceDefinitionError(f"{region} has no recognized view.ttl PresentationRegion rdf:type")


def _parse_placement(graph: Graph, placement: URIRef) -> ComponentPlacementDefinition:
    components = list(graph.objects(placement, VIEW.placesComponent))
    if len(components) != 1:
        raise SurfaceDefinitionError(
            f"{placement} must have exactly one view:placesComponent (found {len(components)})"
        )
    component = components[0]

    return ComponentPlacementDefinition(
        iri=str(placement),
        component_iri=str(component),
        component_type_iri=_single_type(graph, component),
        alignment=_alignment(graph, placement),
        order=_optional_non_negative_int(graph, placement, VIEW.placementOrder, default=0),
    )


def _single_type(graph: Graph, node: URIRef) -> Optional[str]:
    return next((str(value) for value in graph.objects(node, RDF.type)), None)


def _alignment(graph: Graph, placement: URIRef) -> Alignment:
    value = graph.value(subject=placement, predicate=VIEW.hasAlignment)
    if value is None:
        return "start"
    if value not in _ALIGNMENT_BY_IRI:
        raise SurfaceDefinitionError(f"{placement} has an unrecognized view:hasAlignment value: {value}")
    return _ALIGNMENT_BY_IRI[value]


def _require_at_most_one_per_role(regions: List[RegionDefinition]) -> None:
    for role in ("OperationRegion", "ContentRegion", "PinnedRegion"):
        matching = [region for region in regions if region.role == role]
        if len(matching) > 1:
            raise SurfaceDefinitionError(
                f"Surface declares {len(matching)} {role} regions; at most one is supported"
            )


def _optional_int(graph: Graph, subject: URIRef, predicate: URIRef) -> Optional[int]:
    value = graph.value(subject=subject, predicate=predicate)
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError) as error:
        raise SurfaceDefinitionError(f"{subject} {predicate} must be an integer, got {value!r}") from error


def _optional_positive_int(graph: Graph, subject: URIRef, predicate: URIRef) -> Optional[int]:
    value = graph.value(subject=subject, predicate=predicate)
    if value is None:
        return None
    parsed = int(value)
    if parsed <= 0:
        raise SurfaceDefinitionError(f"{subject} {predicate} must be a positive integer, got {parsed}")
    return parsed


def _optional_non_negative_int(graph: Graph, subject: URIRef, predicate: URIRef, *, default: int) -> int:
    value = graph.value(subject=subject, predicate=predicate)
    if value is None:
        return default
    parsed = int(value)
    if parsed < 0:
        raise SurfaceDefinitionError(f"{subject} {predicate} must be non-negative, got {parsed}")
    return parsed


def _optional_positive_float(graph: Graph, subject: URIRef, predicate: URIRef) -> Optional[float]:
    value = graph.value(subject=subject, predicate=predicate)
    if value is None:
        return None
    parsed = float(value)
    if parsed <= 0:
        raise SurfaceDefinitionError(f"{subject} {predicate} must be positive, got {parsed}")
    return parsed


def _optional_non_negative_float(graph: Graph, subject: URIRef, predicate: URIRef) -> Optional[float]:
    value = graph.value(subject=subject, predicate=predicate)
    if value is None:
        return None
    parsed = float(value)
    if parsed < 0:
        raise SurfaceDefinitionError(f"{subject} {predicate} must be non-negative, got {parsed}")
    return parsed


def _optional_bool(graph: Graph, subject: URIRef, predicate: URIRef, *, default: bool) -> bool:
    value = graph.value(subject=subject, predicate=predicate)
    if value is None:
        return default
    return bool(value)
