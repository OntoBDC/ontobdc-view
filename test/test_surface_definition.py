import pytest
from rdflib import Graph, URIRef

from ontobdc_view.component.adapter.surface_definition import (
    SurfaceDefinitionError,
    parse_surface_definition,
)

PREFIXES = """
@prefix view: <http://datacenter.app.br/ontology/ontobdc/domain/view.ttl#> .
@prefix screen: <urn:ontobdc:screen:> .
"""

SURFACE_IRI = URIRef("urn:ontobdc:screen:main")


def _graph(turtle_body: str) -> Graph:
    graph = Graph()
    graph.parse(data=PREFIXES + turtle_body, format="turtle")
    return graph


BASE_SURFACE = """
screen:main
    a view:PresentationSurface ;
    view:columnCount 12 ;
    view:rowCount 12 ;
    view:hasRegion screen:operation ;
    view:hasRegion screen:content ;
    view:hasRegion screen:pinned .

screen:operation
    a view:OperationRegion ;
    view:rowStart 1 ;
    view:columnStart 1 ;
    view:rowSpan 1 ;
    view:columnSpan 12 ;
    view:scrollable false ;
    view:hasComponentPlacement screen:logoPlacement ;
    view:hasComponentPlacement screen:themePlacement ;
    view:hasComponentPlacement screen:loginPlacement .

screen:content
    a view:ContentRegion ;
    view:rowStart 2 ;
    view:columnStart 1 ;
    view:rowSpan 10 ;
    view:columnSpan 12 ;
    view:scrollable true .

screen:pinned
    a view:PinnedRegion ;
    view:rowStart 12 ;
    view:columnStart 1 ;
    view:rowSpan 1 ;
    view:columnSpan 12 ;
    view:scrollable false .

screen:logo a view:LogoTile .
screen:theme a view:ThemeTile .
screen:login a view:Tile .

screen:logoPlacement
    a view:ComponentPlacement ;
    view:placesComponent screen:logo ;
    view:hasAlignment view:StartAlignment ;
    view:placementOrder 10 .

screen:themePlacement
    a view:ComponentPlacement ;
    view:placesComponent screen:theme ;
    view:hasAlignment view:EndAlignment ;
    view:placementOrder 10 .

screen:loginPlacement
    a view:ComponentPlacement ;
    view:placesComponent screen:login ;
    view:hasAlignment view:EndAlignment ;
    view:placementOrder 20 .
"""


def test_parses_operation_content_pinned_regions():
    definition = parse_surface_definition(_graph(BASE_SURFACE), SURFACE_IRI)
    roles = {region.role for region in definition.regions}
    assert roles == {"OperationRegion", "ContentRegion", "PinnedRegion"}


def test_parses_logical_row_column_geometry():
    definition = parse_surface_definition(_graph(BASE_SURFACE), SURFACE_IRI)
    assert definition.columns == 12
    assert definition.rows == 12

    content = next(region for region in definition.regions if region.role == "ContentRegion")
    assert content.row_start == 2
    assert content.column_start == 1
    assert content.row_span == 10
    assert content.column_span == 12


def test_parses_scrollable_true_and_false():
    definition = parse_surface_definition(_graph(BASE_SURFACE), SURFACE_IRI)
    by_role = {region.role: region.scrollable for region in definition.regions}
    assert by_role == {
        "OperationRegion": False,
        "ContentRegion": True,
        "PinnedRegion": False,
    }


def test_parses_start_and_end_aligned_placements():
    definition = parse_surface_definition(_graph(BASE_SURFACE), SURFACE_IRI)
    operation = next(region for region in definition.regions if region.role == "OperationRegion")
    by_component = {placement.component_iri: placement.alignment for placement in operation.placements}
    assert by_component["urn:ontobdc:screen:logo"] == "start"
    assert by_component["urn:ontobdc:screen:theme"] == "end"
    assert by_component["urn:ontobdc:screen:login"] == "end"


def test_orders_theme_before_login_within_end_group():
    definition = parse_surface_definition(_graph(BASE_SURFACE), SURFACE_IRI)
    operation = next(region for region in definition.regions if region.role == "OperationRegion")
    end_group = [p.component_iri for p in operation.placements if p.alignment == "end"]
    assert end_group == ["urn:ontobdc:screen:theme", "urn:ontobdc:screen:login"]


def test_rejects_placement_without_places_component():
    turtle = """
screen:main
    a view:PresentationSurface ;
    view:hasRegion screen:operation .

screen:operation
    a view:OperationRegion ;
    view:hasComponentPlacement screen:badPlacement .

screen:badPlacement
    a view:ComponentPlacement ;
    view:placementOrder 1 .
"""
    with pytest.raises(SurfaceDefinitionError):
        parse_surface_definition(_graph(turtle), SURFACE_IRI)


def test_rejects_non_positive_geometry():
    turtle = """
screen:main
    a view:PresentationSurface ;
    view:columnCount 0 ;
    view:hasRegion screen:operation .

screen:operation
    a view:OperationRegion .
"""
    with pytest.raises(SurfaceDefinitionError):
        parse_surface_definition(_graph(turtle), SURFACE_IRI)


def test_rejects_negative_placement_order():
    turtle = """
screen:main
    a view:PresentationSurface ;
    view:hasRegion screen:operation .

screen:operation
    a view:OperationRegion ;
    view:hasComponentPlacement screen:placement .

screen:logo a view:LogoTile .

screen:placement
    a view:ComponentPlacement ;
    view:placesComponent screen:logo ;
    view:placementOrder -1 .
"""
    with pytest.raises(SurfaceDefinitionError):
        parse_surface_definition(_graph(turtle), SURFACE_IRI)


def test_pinned_region_model_carries_no_fixed_or_sticky_semantic():
    definition = parse_surface_definition(_graph(BASE_SURFACE), SURFACE_IRI)
    pinned = next(region for region in definition.regions if region.role == "PinnedRegion")

    dumped = pinned.model_dump()
    forbidden_terms = ("fixed", "sticky", "position")
    assert not any(term in str(dumped).lower() for term in forbidden_terms)
    assert set(type(pinned).model_fields) == {
        "iri",
        "role",
        "row_start",
        "column_start",
        "row_span",
        "column_span",
        "scrollable",
        "placements",
    }


def test_rejects_more_than_one_pinned_region():
    turtle = """
screen:main
    a view:PresentationSurface ;
    view:hasRegion screen:pinnedA ;
    view:hasRegion screen:pinnedB .

screen:pinnedA a view:PinnedRegion .
screen:pinnedB a view:PinnedRegion .
"""
    with pytest.raises(SurfaceDefinitionError):
        parse_surface_definition(_graph(turtle), SURFACE_IRI)


def test_rejects_region_without_recognized_type():
    turtle = """
screen:main
    a view:PresentationSurface ;
    view:hasRegion screen:mystery .

screen:mystery a view:Component .
"""
    with pytest.raises(SurfaceDefinitionError):
        parse_surface_definition(_graph(turtle), SURFACE_IRI)


def test_generic_presentation_region_is_accepted():
    turtle = """
screen:main
    a view:PresentationSurface ;
    view:hasRegion screen:extra .

screen:extra a view:PresentationRegion .
"""
    definition = parse_surface_definition(_graph(turtle), SURFACE_IRI)
    assert definition.regions[0].role == "PresentationRegion"
