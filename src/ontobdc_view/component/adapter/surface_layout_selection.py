from __future__ import annotations

from typing import List, Optional, Tuple

from pydantic import BaseModel

from .surface_definition import SurfaceDefinition


class SurfaceCapacity(BaseModel):
    """Logical capacity measured for the actual presentation area — not a
    pixel breakpoint. See claude2.md's capacity-measurement formulas; the
    browser renderer derives this the same way it already derives its
    per-region Tile column count."""

    columns: int
    rows: int


def select_default_layout(
    capacity: SurfaceCapacity, candidates: List[SurfaceDefinition]
) -> Optional[SurfaceDefinition]:
    """Deterministically pick the `DefaultSurfaceLayout` matching `capacity`.

    Precedence (claude2.md "Deterministic choice when multiple defaults
    match"): highest `layoutPriority` wins; ties broken by the candidate
    with the most declared bounds and, among those, the narrowest combined
    numeric range; remaining ties broken by lexical IRI. Returns `None`
    when nothing matches, so the caller can fall back to legacy behavior.
    """
    matching = [candidate for candidate in candidates if _matches(candidate, capacity)]
    if not matching:
        return None
    matching.sort(key=_selection_key)
    return matching[0]


def _matches(candidate: SurfaceDefinition, capacity: SurfaceCapacity) -> bool:
    # An internally contradictory candidate (min > max on either axis) is
    # excluded from matching rather than selected — `parse_surface_definition`
    # already rejects this at parse time, but the selector re-checks so a
    # candidate constructed directly (bypassing the parser) can't be chosen.
    if _is_contradictory(candidate):
        return False

    columns_ok = (
        (candidate.min_available_columns is None or candidate.min_available_columns <= capacity.columns)
        and (candidate.max_available_columns is None or candidate.max_available_columns >= capacity.columns)
    )
    rows_ok = (
        (candidate.min_available_rows is None or candidate.min_available_rows <= capacity.rows)
        and (candidate.max_available_rows is None or candidate.max_available_rows >= capacity.rows)
    )
    return columns_ok and rows_ok


def _is_contradictory(candidate: SurfaceDefinition) -> bool:
    columns_contradictory = (
        candidate.min_available_columns is not None
        and candidate.max_available_columns is not None
        and candidate.min_available_columns > candidate.max_available_columns
    )
    rows_contradictory = (
        candidate.min_available_rows is not None
        and candidate.max_available_rows is not None
        and candidate.min_available_rows > candidate.max_available_rows
    )
    return columns_contradictory or rows_contradictory


def _selection_key(candidate: SurfaceDefinition) -> Tuple[int, int, int, str]:
    declared, width = _specificity(candidate)
    priority = candidate.layout_priority if candidate.layout_priority is not None else 0
    return (-priority, -declared, width, candidate.iri)


def _specificity(candidate: SurfaceDefinition) -> Tuple[int, int]:
    bounds = (
        candidate.min_available_columns,
        candidate.max_available_columns,
        candidate.min_available_rows,
        candidate.max_available_rows,
    )
    declared = sum(1 for bound in bounds if bound is not None)

    width = 0
    if candidate.min_available_columns is not None and candidate.max_available_columns is not None:
        width += candidate.max_available_columns - candidate.min_available_columns
    if candidate.min_available_rows is not None and candidate.max_available_rows is not None:
        width += candidate.max_available_rows - candidate.min_available_rows
    return declared, width
