"""The Storage tile's label must actually be translated.

`file_size_tile.title` was stubbed as the literal "STORAGE" and copied
verbatim into all four locales, so the tile stayed English in every
language.

The translations say size, not storage, which is both what the tile
measures — it sums `fileSize` and announces itself as "Total file size" —
and short enough to hold one line in the 72px tile the shipped layout gives
it.
"""
from pathlib import Path

import pytest
import yaml

LOCALES = Path(__file__).resolve().parents[1] / "src/ontobdc_view/component/adapter/i18n/locale"
SOFT_HYPHEN = "­"


def title(locale: str) -> str:
    data = yaml.safe_load((LOCALES / f"{locale}.yaml").read_text(encoding="utf-8"))
    return data["file_size_tile"]["title"]


def test_english_carries_the_term_in_natural_case():
    # The tile's CSS uppercases it; every other key in the catalog is stored
    # in natural case, and the stray all-caps value is what invited the
    # copy-paste into the other locales.
    assert title("en") == "Storage"


@pytest.mark.parametrize(
    ("locale", "expected"),
    [("pt-BR", "Tamanho"), ("pt-PT", "Tamanho"), ("es", "Tamaño")],
)
def test_each_locale_is_actually_translated(locale, expected):
    assert title(locale) == expected


@pytest.mark.parametrize("locale", ["en", "pt-BR", "pt-PT", "es"])
def test_the_label_stays_short_enough_for_one_line(locale):
    """The tile is 72px wide in the shipped layout. A longer word does not
    break the tile — the label may wrap — but it costs a line the 1x1 tile
    cannot really spare, so a translation growing past this is a decision,
    not an accident."""
    assert len(title(locale).replace(SOFT_HYPHEN, "")) <= 8, (
        f"{locale} title wraps in a 72px tile"
    )


@pytest.mark.parametrize("locale", ["pt-BR", "pt-PT", "es"])
def test_no_locale_still_carries_the_english_stub(locale):
    assert title(locale) != "STORAGE"
