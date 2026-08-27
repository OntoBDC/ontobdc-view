"""The Gantt Page has to follow the theme, in CSS and in generated JS.

It shipped consuming four tokens no theme defines — `--onto-theme-surface`,
`--onto-theme-surface-alt`, `--onto-theme-ink`, `--onto-theme-border-subtle`
— so every `var()` fell through to its light-mode fallback and the table
rendered as a white block on a black page. The catalog defines exactly
four: background, foreground, accent, borderColor.
"""
import re
from pathlib import Path

import pytest

import ontobdc_view
from ontobdc_view.page.adapter.gantt_script import GanttScriptAdapter

ASSETS = Path(__file__).resolve().parents[1] / "src/ontobdc_view/page/asset"
GANTT_CSS = (ASSETS / "ifc_work_schedule_view.css").read_text(encoding="utf-8")
CHROME_CSS = (ASSETS / "page_chrome.css").read_text(encoding="utf-8")
SCRIPTS = ("i18n_apply", "graph_reader", "container_connection", "connection_state",
           "pyodide_runtime", "task_table_timeline", "dependency_arrows")

DEFINED = {f"--onto-theme-{token}" for theme in ontobdc_view.theme_catalog()
           for token in theme["tokens"]}


# The chrome stylesheet is inlined before every Page's own, and it derives a
# wider Material-ish vocabulary from the four catalog tokens. A Page may
# consume either set; what it may never do is consume a name nothing defines,
# because a `var()` with no definition resolves to the light-mode literal in
# its own fallback and stops following the theme.
DERIVED = set(re.findall(r"^\s*(--onto-theme-[a-zA-Z-]+)\s*:", CHROME_CSS, re.MULTILINE))


@pytest.mark.parametrize("stylesheet", [GANTT_CSS, CHROME_CSS], ids=["gantt", "chrome"])
def test_only_tokens_something_defines_are_consumed(stylesheet):
    consumed = set(re.findall(r"--onto-theme-[a-zA-Z-]+", stylesheet))
    # Tile-geometry tokens are set by the Surface, not by the theme catalog.
    consumed -= {"--onto-theme-tile-border-radius", "--onto-theme-tile-border-width"}
    undefined = consumed - DEFINED - DERIVED
    assert not undefined, f"undefined tokens: {sorted(undefined)}"


def test_every_derived_token_bottoms_out_in_a_catalog_token():
    """Deriving is only worth anything if the derivation follows the theme:
    a derived token whose value is a literal is just the undefined case
    with an extra hop."""
    for name in sorted(DERIVED):
        value = re.search(rf"^\s*{name}\s*:([^;]*);", CHROME_CSS, re.MULTILINE).group(1)
        roots = set(re.findall(r"--onto-theme-[a-zA-Z-]+", value))
        assert roots and roots <= DEFINED, f"{name} does not derive from the catalog: {value.strip()}"


def test_no_literal_colour_survives_outside_a_documented_exception():
    """A literal is a colour that cannot follow the theme — unless the rule
    it sits in already names the theme it is for. The exceptions are the
    critical-status red, which is a status rather than a surface, and the
    `html[data-theme="dark"]` block that hand-tunes the bar fill and its
    label for contrast against that fill."""
    offenders = []
    for selector, block in re.findall(r"([^{}]+)\{([^{}]*)\}", GANTT_CSS):
        if "data-theme=" in selector:
            continue
        for value in re.findall(r"(?:color|background|fill|stroke)\s*:\s*([^;]+);", block):
            if not re.search(r"#[0-9a-fA-F]{3,6}|\bwhite\b", value):
                continue
            if "onto-theme" in value or "gantt-critical" in value:
                continue
            offenders.append((selector.strip(), value.strip()))
    assert not offenders, offenders


def test_the_container_declares_its_own_text_colour():
    """Fixing only the background left the table's text inheriting the
    document default — black on black."""
    container = re.search(r"\.gantt-container\s*\{([^}]*)\}", GANTT_CSS).group(1)
    assert "color: var(--onto-theme-foreground" in container


@pytest.mark.parametrize("name", SCRIPTS)
def test_generated_scripts_set_no_literal_colour(name):
    source = GanttScriptAdapter().script_source(name)
    literals = [v for v in re.findall(r"style\.(?:color|background|backgroundColor)\s*=\s*\"([^\"]+)\"", source)
                if "onto-theme" not in v]
    assert not literals, literals


def test_the_renderers_are_idempotent():
    """They run at load and again after every workbook ingestion. Without
    clearing, the second pass drew the month header and the dependency
    arrows on top of the first."""
    render = GanttScriptAdapter().script_source("task_table_timeline")
    for target in ("gantt-tbody", "gantt-timeline-header", "gantt-svg"):
        assert re.search(rf'getElementById\("{target}"\)', render)
    assert render.count('textContent = ""') >= 3

    arrows = GanttScriptAdapter().script_source("dependency_arrows")
    assert ".gantt-dependency-line" in arrows


def test_the_arrow_keeps_the_class_its_stylesheet_targets():
    """Overwriting it dropped `fill: none` and each arrow rendered as a
    filled black triangle."""
    arrows = GanttScriptAdapter().script_source("dependency_arrows")
    assert 'class: "gantt-dependency-line"' in arrows
    assert 'setAttribute("class"' not in arrows
    assert ".gantt-dependency-line {" in GANTT_CSS


def test_the_document_reset_is_shared_chrome_not_workstream_only():
    """The Gantt block followed the theme while the page around it stayed
    white: the reset that paints the canvas lived in work_stream_view.css
    and stayed behind when the chrome moved out, so the IfcWorkSchedule
    Page had a transparent body, the UA's black text and its 8px margin.
    It is not specific to any entity — it belongs to every Page."""
    canvas = re.search(r"html,\s*body\s*\{([^}]*)\}", CHROME_CSS).group(1)
    assert re.search(r"background(-color)?:\s*var\(--onto-theme-(surface|background)", canvas)
    assert re.search(r"color:\s*var\(--onto-theme-(on-surface|foreground)", canvas)
    assert re.search(r"margin:\s*0", canvas)
    assert "font-family:" in re.search(r"(?m)^body\s*\{([^}]*)\}", CHROME_CSS).group(1)
    assert ":root {" in CHROME_CSS and "color-scheme" in CHROME_CSS
    assert "[hidden] { display: none !important; }" in CHROME_CSS

    work_stream = (ASSETS / "work_stream_view.css").read_text(encoding="utf-8")
    assert "color-scheme" not in work_stream, "reset duplicated back into a Page"


def test_the_move_did_not_orphan_the_pulse_at_rules():
    """Extracting the chrome copied the two at-rules' *bodies* and dropped
    their wrappers: the keyframes were left as bare `0%, 100% { }` rules in
    work_stream_view.css, and the reduced-motion override landed at top
    level, disabling the connecting pulse for everyone."""
    assert "@keyframes onto-connection-pulse {" in CHROME_CSS
    reduced = re.search(
        r"@media \(prefers-reduced-motion: reduce\) \{([^}]*\}[^}]*)\}", CHROME_CSS
    ).group(1)
    assert 'data-status="connecting"' in reduced and "animation: none" in reduced

    top_level = re.sub(r"@[a-z-]+[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}", "", CHROME_CSS)
    for stylesheet in (top_level, (ASSETS / "work_stream_view.css").read_text(encoding="utf-8")):
        assert not re.search(r"(?m)^\s*\d+%[\s,]", stylesheet), "orphaned keyframe step"
