from __future__ import annotations

from typing import Any, Dict, Optional

import ontobdc.cli  # noqa: F401
from ontobdc.shared.adapter.loader import ComponentLoader

from .surface.render import SurfaceResolutionService
from .surface_definition import SurfaceDefinition


def resolve_placement_tag(
    component_type_iri: str,
    loader: Optional[ComponentLoader] = None,
) -> str:
    return SurfaceResolutionService.resolve_placement_tag(component_type_iri, loader)


def to_render_payload(
    definition: SurfaceDefinition,
    loader: Optional[ComponentLoader] = None,
) -> Dict[str, Any]:
    return SurfaceResolutionService.to_render_payload(definition, loader)
