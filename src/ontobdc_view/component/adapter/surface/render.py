from __future__ import annotations

from typing import Any, Dict, List, Optional, Type

# Importing `ontobdc.cli` first works around a pre-existing circular import
# in `ontobdc.shared.adapter.loader` (it needs `ontobdc.cli.adapter.command`
# fully initialized, which itself imports back from `loader`) that only
# surfaces when `loader` is the first `ontobdc.*` module a process touches.
import ontobdc.cli  # noqa: F401
from ontobdc.shared.adapter.loader import ComponentLoader

from ontobdc.shared.domain.model.surface import SurfaceDefinition, SurfaceDefinitionError


class SurfaceResolutionService:
    @classmethod
    def resolve_placement_tag(
        cls, component_type_iri: str, loader: Optional[ComponentLoader] = None
    ) -> str:
        """Resolve a `view.ttl` Tile-class IRI to its registered custom-element tag.

        Wraps `ComponentLoader.match_tile_class` — the same resolver every
        Chrome Tile descriptor (logo_tile.py, theme_tile.py, ...) is already
        matched by via `ComponentMetadata.tile_class`.
        """
        if not component_type_iri:
            raise SurfaceDefinitionError("ComponentPlacement's component has no rdf:type to resolve a tag from")

        all_matches: List[Any] = list(
            (loader or ComponentLoader()).match_tile_class(component_type_iri)
        )
        if not all_matches:
            raise SurfaceDefinitionError(f"No registered Component implements {component_type_iri}")

        html_matches: List[Any] = [
            component
            for component in all_matches
            if not str(component.METADATA.tag).endswith("-terminal")
        ]
        candidates: List[Any] = html_matches or all_matches

        if len(candidates) > 1:
            tags = sorted(str(component.METADATA.tag) for component in candidates)
            raise SurfaceDefinitionError(
                f"{component_type_iri} is implemented by more than one registered Component: {tags}"
            )
        return candidates[0].METADATA.tag

    @classmethod
    def to_render_payload(
        cls, definition: SurfaceDefinition, loader: Optional[ComponentLoader] = None
    ) -> Dict[str, Any]:
        """Serialize a `SurfaceDefinition` into the JSON `onto-presentation-surface`
        reads via its `surfaceDefinition` property.

        Placement `component_type_iri`s are resolved to concrete custom-element
        tags here — the renderer materializes DOM, it does not resolve semantic
        component identity.
        """
        resolved_loader = loader or ComponentLoader()
        return {
            "iri": definition.iri,
            "columns": definition.columns,
            "rows": definition.rows,
            "slotTarget": definition.slot_target,
            "gap": definition.gap,
            "padding": definition.padding,
            "isDefaultLayout": definition.is_default_layout,
            "minAvailableColumns": definition.min_available_columns,
            "maxAvailableColumns": definition.max_available_columns,
            "minAvailableRows": definition.min_available_rows,
            "maxAvailableRows": definition.max_available_rows,
            "layoutPriority": definition.layout_priority,
            "regions": [
                {
                    "iri": region.iri,
                    "role": region.role,
                    "rowStart": region.row_start,
                    "columnStart": region.column_start,
                    "rowSpan": region.row_span,
                    "columnSpan": region.column_span,
                    "scrollable": region.scrollable,
                    "placements": [
                        {
                            "iri": placement.iri,
                            "componentIri": placement.component_iri,
                            "tag": cls.resolve_placement_tag(placement.component_type_iri, resolved_loader),
                            "alignment": placement.alignment,
                            "order": placement.order,
                        }
                        for placement in region.placements
                    ],
                }
                for region in definition.regions
            ],
        }
