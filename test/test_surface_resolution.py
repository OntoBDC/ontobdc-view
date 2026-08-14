import pytest
from rdflib import Graph, URIRef

from ontobdc_view.component.adapter.surface_definition import (
    SurfaceDefinitionError,
    parse_surface_definition,
)
from ontobdc_view.component.adapter.surface_resolution import (
    resolve_placement_tag,
    to_render_payload,
)

VIEW = "http://datacenter.app.br/ontology/ontobdc/domain/view.ttl#"

SURFACE_TURTLE = f"""
@prefix view: <{VIEW}> .
@prefix screen: <urn:ontobdc:screen:> .

screen:main
    a view:PresentationSurface ;
    view:columnCount 12 ;
    view:rowCount 12 ;
    view:hasRegion screen:operation ;
    view:hasRegion screen:content ;
    view:hasRegion screen:pinned .

screen:operation
    a view:OperationRegion ;
    view:scrollable false ;
    view:hasComponentPlacement screen:logoPlacement ;
    view:hasComponentPlacement screen:themePlacement .

screen:content
    a view:ContentRegion ;
    view:scrollable true .

screen:pinned
    a view:PinnedRegion ;
    view:scrollable false .

screen:logo a view:LogoTile .
screen:theme a view:ThemeTile .

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
"""


def _definition():
    graph = Graph()
    graph.parse(data=SURFACE_TURTLE, format="turtle")
    return parse_surface_definition(graph, URIRef("urn:ontobdc:screen:main"))


def test_resolve_placement_tag_finds_registered_component():
    assert resolve_placement_tag(f"{VIEW}LogoTile") == "onto-logo-tile"
    assert resolve_placement_tag(f"{VIEW}ThemeTile") == "onto-theme-tile"


def test_resolve_placement_tag_rejects_unknown_type():
    with pytest.raises(SurfaceDefinitionError):
        resolve_placement_tag(f"{VIEW}NoSuchTile")


def test_to_render_payload_resolves_tags_and_preserves_shape():
    payload = to_render_payload(_definition())

    assert payload["columns"] == 12
    assert payload["rows"] == 12

    operation = next(region for region in payload["regions"] if region["role"] == "OperationRegion")
    tags = [placement["tag"] for placement in operation["placements"]]
    assert tags == ["onto-logo-tile", "onto-theme-tile"]

    content = next(region for region in payload["regions"] if region["role"] == "ContentRegion")
    assert content["scrollable"] is True
    pinned = next(region for region in payload["regions"] if region["role"] == "PinnedRegion")
    assert pinned["scrollable"] is False
