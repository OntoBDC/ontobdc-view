from __future__ import annotations

from typing import List

from rdflib import Graph, URIRef

from ontobdc.shared.domain.model.surface import (
    SurfaceDefinition,
    SurfaceDefinitionError,
)

from .surface.rdf import SurfaceRdfParser

__all__ = [
    "SurfaceDefinition",
    "SurfaceDefinitionError",
    "default_surface_layouts",
    "parse_default_surface_layouts",
    "parse_surface_definition",
]


def default_surface_layouts() -> List[SurfaceDefinition]:
    """Every `view:DefaultSurfaceLayout` shipped in this package's own
    `default_surface_layouts.ttl` asset — the Logo/Language/Theme
    OperationRegion fallback `SurfaceOperationalMatchedCapability`
    (ontobdc) resolves whenever a container declares no operation-region
    Tile of its own. Source of truth for that TTL's content is
    Brasidata/brasidatacenter's `ontology/ontobdc/abox/default_surface_layouts.ttl`.
    """
    return SurfaceRdfParser.default_surface_layouts()


def parse_default_surface_layouts(graph: Graph) -> List[SurfaceDefinition]:
    """Every `view:DefaultSurfaceLayout` subject found in an already-parsed
    rdflib Graph — the graph-taking counterpart to `default_surface_layouts()`,
    used directly by tests and by any caller that already has the graph."""
    return SurfaceRdfParser.parse_default_surface_layouts(graph)


def parse_surface_definition(graph: Graph, surface: URIRef) -> SurfaceDefinition:
    """Parse one `view:PresentationSurface`/`view:DefaultSurfaceLayout`
    subject into a `SurfaceDefinition`."""
    return SurfaceRdfParser.parse_surface_definition(graph, surface)
