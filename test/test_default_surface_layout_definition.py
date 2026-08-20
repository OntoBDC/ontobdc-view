import pytest
from rdflib import Graph, URIRef

from ontobdc_view.component.adapter.surface_definition import (
    SurfaceDefinitionError,
    default_surface_layouts,
    parse_default_surface_layouts,
    parse_surface_definition,
)

PREFIXES = """
@prefix view: <http://datacenter.app.br/ontology/ontobdc/domain/view.ttl#> .
@prefix layout: <urn:ontobdc:layout:> .
"""

THREE_TIER_TURTLE = f"""{PREFIXES}
layout:compact
    a view:DefaultSurfaceLayout ;
    view:minAvailableColumns 1 ;
    view:maxAvailableColumns 4 ;
    view:layoutPriority 10 ;
    view:columnCount 4 ;
    view:rowCount 12 ;
    view:hasRegion layout:compactContent .

layout:regular
    a view:DefaultSurfaceLayout ;
    view:minAvailableColumns 5 ;
    view:maxAvailableColumns 8 ;
    view:layoutPriority 10 ;
    view:columnCount 8 ;
    view:rowCount 12 .

layout:wide
    a view:DefaultSurfaceLayout ;
    view:minAvailableColumns 9 ;
    view:layoutPriority 10 ;
    view:columnCount 12 ;
    view:rowCount 12 .

layout:compactContent a view:ContentRegion ; view:scrollable true .
"""


def _graph(turtle: str) -> Graph:
    graph = Graph()
    graph.parse(data=turtle, format="turtle")
    return graph


def test_default_surface_layout_is_recognized_without_explicit_presentation_surface_type():
    # claude2.md's own example only asserts `a view:DefaultSurfaceLayout`,
    # relying on RDFS subclassing that a plain rdflib.Graph never infers.
    definition = parse_surface_definition(_graph(THREE_TIER_TURTLE), URIRef("urn:ontobdc:layout:compact"))
    assert definition.is_default_layout is True
    assert definition.regions[0].role == "ContentRegion"


def test_parses_applicability_bounds_and_priority():
    definition = parse_surface_definition(_graph(THREE_TIER_TURTLE), URIRef("urn:ontobdc:layout:compact"))
    assert definition.min_available_columns == 1
    assert definition.max_available_columns == 4
    assert definition.layout_priority == 10


def test_missing_max_available_columns_is_none_not_zero():
    definition = parse_surface_definition(_graph(THREE_TIER_TURTLE), URIRef("urn:ontobdc:layout:wide"))
    assert definition.min_available_columns == 9
    assert definition.max_available_columns is None


def test_parse_default_surface_layouts_discovers_all_three():
    layouts = parse_default_surface_layouts(_graph(THREE_TIER_TURTLE))
    assert {layout.iri for layout in layouts} == {
        "urn:ontobdc:layout:compact",
        "urn:ontobdc:layout:regular",
        "urn:ontobdc:layout:wide",
    }
    assert all(layout.is_default_layout for layout in layouts)


def test_rejects_min_available_columns_greater_than_max():
    turtle = f"""{PREFIXES}
layout:broken
    a view:DefaultSurfaceLayout ;
    view:minAvailableColumns 10 ;
    view:maxAvailableColumns 1 .
"""
    with pytest.raises(SurfaceDefinitionError):
        parse_surface_definition(_graph(turtle), URIRef("urn:ontobdc:layout:broken"))


def test_rejects_min_available_rows_greater_than_max():
    turtle = f"""{PREFIXES}
layout:broken
    a view:DefaultSurfaceLayout ;
    view:minAvailableRows 10 ;
    view:maxAvailableRows 1 .
"""
    with pytest.raises(SurfaceDefinitionError):
        parse_surface_definition(_graph(turtle), URIRef("urn:ontobdc:layout:broken"))


def test_rejects_non_positive_available_columns_bound():
    turtle = f"""{PREFIXES}
layout:broken
    a view:DefaultSurfaceLayout ;
    view:minAvailableColumns 0 .
"""
    with pytest.raises(SurfaceDefinitionError):
        parse_surface_definition(_graph(turtle), URIRef("urn:ontobdc:layout:broken"))


def test_layout_priority_accepts_negative_integers():
    turtle = f"""{PREFIXES}
layout:low
    a view:DefaultSurfaceLayout ;
    view:layoutPriority -5 .
"""
    definition = parse_surface_definition(_graph(turtle), URIRef("urn:ontobdc:layout:low"))
    assert definition.layout_priority == -5


def test_default_surface_layout_supports_component_placement_like_any_surface():
    turtle = f"""{PREFIXES}
layout:compact
    a view:DefaultSurfaceLayout ;
    view:hasRegion layout:operation .

layout:operation
    a view:OperationRegion ;
    view:hasComponentPlacement layout:logoPlacement .

layout:logo a view:LogoTile .

layout:logoPlacement
    a view:ComponentPlacement ;
    view:placesComponent layout:logo ;
    view:hasAlignment view:StartAlignment ;
    view:placementOrder 10 .
"""
    definition = parse_surface_definition(_graph(turtle), URIRef("urn:ontobdc:layout:compact"))
    placement = definition.regions[0].placements[0]
    assert placement.component_iri == "urn:ontobdc:layout:logo"
    assert placement.alignment == "start"


def test_default_surface_layouts_ships_an_always_matching_fallback():
    layouts = default_surface_layouts()
    assert len(layouts) == 1
    layout = layouts[0]
    assert layout.is_default_layout is True
    # No bounds declared -> matches any measured capacity (see claude2.md
    # "missing minimum/maximum means no lower/upper bound").
    assert layout.min_available_columns is None
    assert layout.max_available_columns is None

    operation = next(region for region in layout.regions if region.role == "OperationRegion")
    tags_by_type = {p.component_type_iri.rsplit("#", 1)[-1] for p in operation.placements}
    assert tags_by_type == {"LogoTile", "LanguageTile", "ThemeTile"}
