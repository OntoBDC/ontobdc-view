"""The Storage tile's unit must start at the same x as its label.

The first attempt at this centered the row and pinned the close button with
an auto inline-start margin. An auto margin absorbs *all* free space, so it
silently overrode the centering and pushed the unit hard against the tile's
left edge — and the error grew with the tile: measured -11.7px at 96px wide,
-72.4px at 220px. Alignment that depends on leftover space in a row cannot
hold; sharing a column's start edge can.
"""
import re
from pathlib import Path

import pytest

SOURCE = (
    Path(__file__).resolve().parents[1]
    / "src/ontobdc_view/component/asset/onto-file-size-tile.js"
).read_text(encoding="utf-8")


def rule(selector: str) -> str:
    match = re.search(rf"\n\s*{re.escape(selector)} \{{(.*?)\n\s*\}}", SOURCE, re.DOTALL)
    assert match, f"no rule for {selector}"
    return match.group(1)


def test_label_value_and_unit_share_one_column():
    markup = SOURCE[SOURCE.index('<div class="tile"') :]
    markup = markup[: markup.index("</div>", markup.index("</div>") + 1)]
    stack = markup[markup.index('<div class="stack">') :]
    for element in ("label", "value", "unit"):
        assert f'class="{element}"' in stack, f".{element} must sit inside .stack"


def test_the_column_start_aligns_its_children():
    stack = rule(".stack")
    assert "flex-direction: column" in stack
    assert "align-items: flex-start" in stack


def test_the_close_button_cannot_consume_the_free_space():
    close = rule(".close-btn")
    # The exact shape that broke it.
    assert "margin-left: auto" not in close
    assert "margin-inline-start: auto" not in close
    # Out of flow entirely, so it cannot move the column at all.
    assert "position: absolute" in close
    assert "position: relative" in rule(".tile")


def test_the_unit_is_not_positioned_by_a_row():
    """`.amount` was the row whose free space decided where the unit landed."""
    assert ".amount" not in SOURCE
