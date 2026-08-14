from ontobdc_view.component.adapter.surface_definition import SurfaceDefinition
from ontobdc_view.component.adapter.surface_layout_selection import (
    SurfaceCapacity,
    select_default_layout,
)


def _layout(iri: str, **bounds) -> SurfaceDefinition:
    return SurfaceDefinition(iri=iri, is_default_layout=True, **bounds)


TIERED_CANDIDATES = [
    _layout("urn:layout:compact", min_available_columns=1, max_available_columns=4, layout_priority=10),
    _layout("urn:layout:regular", min_available_columns=5, max_available_columns=8, layout_priority=10),
    _layout("urn:layout:wide", min_available_columns=9, layout_priority=10),
]


def test_selects_candidate_covering_1_to_4_at_4_columns():
    match = select_default_layout(SurfaceCapacity(columns=4, rows=12), TIERED_CANDIDATES)
    assert match.iri == "urn:layout:compact"


def test_selects_candidate_covering_5_to_8_at_5_columns():
    match = select_default_layout(SurfaceCapacity(columns=5, rows=12), TIERED_CANDIDATES)
    assert match.iri == "urn:layout:regular"


def test_selects_unbounded_lower_9_candidate_at_9_columns():
    match = select_default_layout(SurfaceCapacity(columns=9, rows=12), TIERED_CANDIDATES)
    assert match.iri == "urn:layout:wide"


def test_missing_max_bound_is_unbounded_above():
    match = select_default_layout(SurfaceCapacity(columns=999, rows=12), TIERED_CANDIDATES)
    assert match.iri == "urn:layout:wide"


def test_missing_min_bound_is_unbounded_below():
    candidate = _layout("urn:layout:any-below-5", max_available_columns=4)
    match = select_default_layout(SurfaceCapacity(columns=1, rows=12), [candidate])
    assert match.iri == "urn:layout:any-below-5"


def test_row_constraints_are_honored_when_present():
    tall = _layout("urn:layout:tall", min_available_rows=10)
    short = _layout("urn:layout:short", max_available_rows=9)
    assert select_default_layout(SurfaceCapacity(columns=1, rows=12), [tall, short]).iri == "urn:layout:tall"
    assert select_default_layout(SurfaceCapacity(columns=1, rows=5), [tall, short]).iri == "urn:layout:short"


def test_higher_layout_priority_wins_on_overlapping_ranges():
    low = _layout("urn:layout:low", min_available_columns=1, max_available_columns=12, layout_priority=1)
    high = _layout("urn:layout:high", min_available_columns=1, max_available_columns=12, layout_priority=99)
    match = select_default_layout(SurfaceCapacity(columns=6, rows=12), [low, high])
    assert match.iri == "urn:layout:high"


def test_specificity_resolves_equal_priority_overlaps():
    broad = _layout("urn:layout:broad", min_available_columns=1, max_available_columns=12, layout_priority=10)
    narrow = _layout("urn:layout:narrow", min_available_columns=4, max_available_columns=6, layout_priority=10)
    match = select_default_layout(SurfaceCapacity(columns=5, rows=12), [broad, narrow])
    assert match.iri == "urn:layout:narrow"


def test_iri_lexical_order_is_final_tiebreaker():
    a = _layout("urn:layout:a", min_available_columns=1, max_available_columns=12, layout_priority=10)
    b = _layout("urn:layout:b", min_available_columns=1, max_available_columns=12, layout_priority=10)
    match = select_default_layout(SurfaceCapacity(columns=5, rows=12), [b, a])
    assert match.iri == "urn:layout:a"


def test_contradictory_candidate_is_rejected_rather_than_selected():
    contradictory = _layout("urn:layout:broken", min_available_columns=10, max_available_columns=1)
    match = select_default_layout(SurfaceCapacity(columns=5, rows=12), [contradictory])
    assert match is None


def test_no_matching_candidate_returns_none():
    match = select_default_layout(SurfaceCapacity(columns=1, rows=1), TIERED_CANDIDATES[1:])
    assert match is None
