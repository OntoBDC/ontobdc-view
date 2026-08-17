from __future__ import annotations

from importlib.resources import files
from typing import List, Optional

from rdflib import Graph, Namespace, URIRef
from rdflib.namespace import RDF

from ontobdc.shared.domain.model.surface import (
    Alignment,
    ComponentPlacementDefinition,
    RegionDefinition,
    RegionRole,
    SurfaceDefinition,
    SurfaceDefinitionError,
)

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


class SurfaceRdfParser:
    @classmethod
    def parse_surface_definition(cls, graph: Graph, surface: URIRef) -> SurfaceDefinition:
        is_default_layout = (surface, RDF.type, VIEW.DefaultSurfaceLayout) in graph
        if not is_default_layout and (surface, RDF.type, VIEW.PresentationSurface) not in graph:
            raise SurfaceDefinitionError(
                f"{surface} is not a view:PresentationSurface or view:DefaultSurfaceLayout"
            )

        regions = [
            cls._parse_region(graph, region_node)
            for region_node in graph.objects(surface, VIEW.hasRegion)
        ]
        cls._require_at_most_one_per_role(regions)

        min_available_columns = cls._optional_positive_int(graph, surface, VIEW.minAvailableColumns)
        max_available_columns = cls._optional_positive_int(graph, surface, VIEW.maxAvailableColumns)
        min_available_rows = cls._optional_positive_int(graph, surface, VIEW.minAvailableRows)
        max_available_rows = cls._optional_positive_int(graph, surface, VIEW.maxAvailableRows)
        cls._require_min_not_exceeding_max(surface, "columns", min_available_columns, max_available_columns)
        cls._require_min_not_exceeding_max(surface, "rows", min_available_rows, max_available_rows)

        return SurfaceDefinition(
            iri=str(surface),
            columns=cls._optional_positive_int(graph, surface, VIEW.columnCount),
            rows=cls._optional_positive_int(graph, surface, VIEW.rowCount),
            slot_target=cls._optional_positive_float(graph, surface, VIEW.slotTarget),
            gap=cls._optional_non_negative_float(graph, surface, VIEW.gap),
            padding=cls._optional_non_negative_float(graph, surface, VIEW.padding),
            regions=regions,
            is_default_layout=is_default_layout,
            min_available_columns=min_available_columns,
            max_available_columns=max_available_columns,
            min_available_rows=min_available_rows,
            max_available_rows=max_available_rows,
            layout_priority=cls._optional_int(graph, surface, VIEW.layoutPriority),
        )

    @classmethod
    def default_surface_layouts(cls) -> List[SurfaceDefinition]:
        source = files("ontobdc_view").joinpath(
            "component", "asset", "default_surface_layouts.ttl"
        ).read_text(encoding="utf-8")
        graph = Graph()
        graph.parse(data=source, format="turtle")
        return cls.parse_default_surface_layouts(graph)

    @classmethod
    def parse_default_surface_layouts(cls, graph: Graph) -> List[SurfaceDefinition]:
        return [
            cls.parse_surface_definition(graph, layout_node)
            for layout_node in graph.subjects(RDF.type, VIEW.DefaultSurfaceLayout)
        ]

    @classmethod
    def _require_min_not_exceeding_max(
        cls, subject: URIRef, axis: str, minimum: Optional[int], maximum: Optional[int]
    ) -> None:
        if minimum is not None and maximum is not None and minimum > maximum:
            raise SurfaceDefinitionError(
                f"{subject} has minAvailable{axis.capitalize()} ({minimum}) "
                f"greater than maxAvailable{axis.capitalize()} ({maximum})"
            )

    @classmethod
    def _parse_region(cls, graph: Graph, region: URIRef) -> RegionDefinition:
        role = cls._region_role(graph, region)
        placements = [
            cls._parse_placement(graph, placement_node)
            for placement_node in graph.objects(region, VIEW.hasComponentPlacement)
        ]
        placements.sort(key=lambda placement: (_ALIGNMENT_RANK[placement.alignment], placement.order, placement.iri))

        return RegionDefinition(
            iri=str(region),
            role=role,
            row_start=cls._optional_positive_int(graph, region, VIEW.rowStart),
            column_start=cls._optional_positive_int(graph, region, VIEW.columnStart),
            row_span=cls._optional_positive_int(graph, region, VIEW.rowSpan),
            column_span=cls._optional_positive_int(graph, region, VIEW.columnSpan),
            scrollable=cls._optional_bool(graph, region, VIEW.scrollable, default=False),
            placements=placements,
        )

    @classmethod
    def _region_role(cls, graph: Graph, region: URIRef) -> RegionRole:
        types = set(graph.objects(region, RDF.type))
        for type_iri, role in _REGION_ROLE_BY_TYPE.items():
            if type_iri in types:
                return role
        if VIEW.PresentationRegion in types:
            return "PresentationRegion"
        raise SurfaceDefinitionError(f"{region} has no recognized view.ttl PresentationRegion rdf:type")

    @classmethod
    def _parse_placement(cls, graph: Graph, placement: URIRef) -> ComponentPlacementDefinition:
        components = list(graph.objects(placement, VIEW.placesComponent))
        if len(components) != 1:
            raise SurfaceDefinitionError(
                f"{placement} must have exactly one view:placesComponent (found {len(components)})"
            )
        component = components[0]

        return ComponentPlacementDefinition(
            iri=str(placement),
            component_iri=str(component),
            component_type_iri=cls._single_type(graph, component),
            alignment=cls._alignment(graph, placement),
            order=cls._optional_non_negative_int(graph, placement, VIEW.placementOrder, default=0),
        )

    @classmethod
    def _single_type(cls, graph: Graph, node: URIRef) -> Optional[str]:
        return next((str(value) for value in graph.objects(node, RDF.type)), None)

    @classmethod
    def _alignment(cls, graph: Graph, placement: URIRef) -> Alignment:
        value = graph.value(subject=placement, predicate=VIEW.hasAlignment)
        if value is None:
            return "start"
        if value not in _ALIGNMENT_BY_IRI:
            raise SurfaceDefinitionError(f"{placement} has an unrecognized view:hasAlignment value: {value}")
        return _ALIGNMENT_BY_IRI[value]

    @classmethod
    def _require_at_most_one_per_role(cls, regions: List[RegionDefinition]) -> None:
        for role in ("OperationRegion", "ContentRegion", "PinnedRegion"):
            matching = [region for region in regions if region.role == role]
            if len(matching) > 1:
                raise SurfaceDefinitionError(
                    f"Surface declares {len(matching)} {role} regions; at most one is supported"
                )

    @classmethod
    def _optional_int(cls, graph: Graph, subject: URIRef, predicate: URIRef) -> Optional[int]:
        value = graph.value(subject=subject, predicate=predicate)
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError) as error:
            raise SurfaceDefinitionError(f"{subject} {predicate} must be an integer, got {value!r}") from error

    @classmethod
    def _optional_positive_int(cls, graph: Graph, subject: URIRef, predicate: URIRef) -> Optional[int]:
        value = graph.value(subject=subject, predicate=predicate)
        if value is None:
            return None
        parsed = int(value)
        if parsed <= 0:
            raise SurfaceDefinitionError(f"{subject} {predicate} must be a positive integer, got {parsed}")
        return parsed

    @classmethod
    def _optional_non_negative_int(
        cls, graph: Graph, subject: URIRef, predicate: URIRef, *, default: int
    ) -> int:
        value = graph.value(subject=subject, predicate=predicate)
        if value is None:
            return default
        parsed = int(value)
        if parsed < 0:
            raise SurfaceDefinitionError(f"{subject} {predicate} must be non-negative, got {parsed}")
        return parsed

    @classmethod
    def _optional_positive_float(cls, graph: Graph, subject: URIRef, predicate: URIRef) -> Optional[float]:
        value = graph.value(subject=subject, predicate=predicate)
        if value is None:
            return None
        parsed = float(value)
        if parsed <= 0:
            raise SurfaceDefinitionError(f"{subject} {predicate} must be positive, got {parsed}")
        return parsed

    @classmethod
    def _optional_non_negative_float(
        cls, graph: Graph, subject: URIRef, predicate: URIRef
    ) -> Optional[float]:
        value = graph.value(subject=subject, predicate=predicate)
        if value is None:
            return None
        parsed = float(value)
        if parsed < 0:
            raise SurfaceDefinitionError(f"{subject} {predicate} must be non-negative, got {parsed}")
        return parsed

    @classmethod
    def _optional_bool(
        cls, graph: Graph, subject: URIRef, predicate: URIRef, *, default: bool
    ) -> bool:
        value = graph.value(subject=subject, predicate=predicate)
        if value is None:
            return default
        return bool(value)
