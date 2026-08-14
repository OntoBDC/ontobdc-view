from __future__ import annotations

import argparse
import json
import tempfile
import webbrowser
from pathlib import Path

from rdflib import Graph, URIRef

from ontobdc_view import component_source
from ontobdc_view.component.adapter.surface_definition import (
    parse_default_surface_layouts,
    parse_surface_definition,
)
from ontobdc_view.component.adapter.surface_resolution import to_render_payload

# `read_component`/`build_*_tile` (the previous convenience wrappers this
# preview used) are not exported by `ontobdc_view` on this branch — only
# `component_source(tag)` (`ComponentSourceAdapter`) is, and it already
# resolves the same build-time placeholders those wrappers used to.


def build_surface_preview_html(preview: str) -> str:
    background = "#ffffff" if preview == "light" else "#000000"
    foreground = "#111827" if preview == "light" else "#f8fafc"
    accent = "#0284c7" if preview == "light" else "#38bdf8"

    surface_js = component_source("onto-presentation-surface")
    theme_js = component_source("onto-theme-tile")
    language_js = component_source("onto-language-tile")
    logo_js = component_source("onto-logo-tile")
    photo_js = component_source("onto-photo-tile")

    return f"""<!doctype html>
<html lang="pt-BR" data-theme="{preview}" data-language="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OntoBDC Presentation Surface Preview</title>
  <style>
    :root {{
      --onto-theme-background: {background};
      --onto-theme-foreground: {foreground};
      --onto-theme-accent: {accent};
    }}
    html, body {{
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--onto-theme-background);
      color: var(--onto-theme-foreground);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      transition: background .18s ease, color .18s ease;
    }}
    onto-presentation-surface {{
      display: block;
      width: 100%;
      height: 100dvh;
    }}
    .system-log {{
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: 4px;
      z-index: 9999;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      pointer-events: none;
      font-size: 11px;
      line-height: 1;
      opacity: .62;
    }}
  </style>
</head>
<body>
  <onto-presentation-surface id="surface">
    <onto-logo-tile
      data-tile-id="logo"
      surface-region="operation"
      columns="2"
      rows="1"
      min-columns="1"
      max-columns="2">
    </onto-logo-tile>

    <onto-theme-tile
      data-tile-id="theme"
      surface-region="operation"
      columns="1"
      rows="1"
      min-columns="1"
      max-columns="1">
    </onto-theme-tile>

    <onto-language-tile
      data-tile-id="language"
      surface-region="operation"
      columns="1"
      rows="1"
      min-columns="1"
      max-columns="1">
    </onto-language-tile>

    <onto-photo-tile
      data-tile-id="photo"
      surface-region="content"
      columns="2"
      rows="3"
      min-columns="1"
      max-columns="3"
      min-rows="1"
      max-rows="3">
    </onto-photo-tile>
  </onto-presentation-surface>

  <div class="system-log" id="system-log">Presentation Surface · iniciando…</div>

  <script type="module">
{surface_js}
{theme_js}
{language_js}
{logo_js}
{photo_js}

    const root = document.documentElement;
    const surface = document.querySelector("#surface");
    const log = document.querySelector("#system-log");

    function writeLog(message, detail = null) {{
      log.textContent = detail ? `${{message}} · ${{JSON.stringify(detail)}}` : message;
      console.log(`[Presentation] ${{message}}`, detail ?? "");
    }}

    surface.addEventListener("surface-layout-changed", event => {{
      writeLog("surface-layout-changed", event.detail);
    }});

    surface.addEventListener("surface-placement-rejected", event => {{
      writeLog("surface-placement-rejected", event.detail);
    }});

    document.addEventListener("theme-changed", event => {{
      writeLog("theme-changed", {{
        ...event.detail,
        background: getComputedStyle(root).getPropertyValue("--onto-theme-background").trim(),
        foreground: getComputedStyle(root).getPropertyValue("--onto-theme-foreground").trim(),
      }});
    }});

    document.addEventListener("language-changed", event => {{
      writeLog("language-changed", event.detail);
    }});

    document.addEventListener("photo-selected", event => {{
      const tile = event.target.closest?.("onto-photo-tile") ?? event.target;
      surface.bringToFront(tile);
      writeLog("photo-selected", event.detail);
    }});

    document.addEventListener("photo-open-requested", event => {{
      writeLog("photo-open-requested", event.detail);
    }});

    customElements.whenDefined("onto-presentation-surface").then(() => {{
      requestAnimationFrame(() => {{
        writeLog("Presentation Surface pronta", {{
          theme: root.dataset.theme,
          columns: surface.columns,
          slotSize: Math.round(surface.slotSize),
          operation: surface.operationItems.map(tile => tile.dataset.tileId),
          content: surface.contentItems.map(tile => tile.dataset.tileId),
          pinned: surface.pinnedItems.map(tile => tile.dataset.tileId),
        }});
      }});
    }});
  </script>
</body>
</html>
"""


# Mirrors the CLAUDE.md intervention brief's target RDF pattern: logo at
# the logical start of an OperationRegion, theme+language at its logical
# end (theme first, per placementOrder), a scrollable ContentRegion and an
# empty PinnedRegion — parsed with the real `parse_surface_definition` /
# `to_render_payload` chain, not hand-built JSON, so this preview exercises
# the ontology -> parser -> renderer path end to end.
_SEMANTIC_SURFACE_TURTLE = """
@prefix view: <http://datacenter.app.br/ontology/ontobdc/domain/view.ttl#> .
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
    view:rowStart 1 ; view:columnStart 1 ; view:rowSpan 1 ; view:columnSpan 12 ;
    view:scrollable false ;
    view:hasComponentPlacement screen:logoPlacement ;
    view:hasComponentPlacement screen:themePlacement ;
    view:hasComponentPlacement screen:languagePlacement .

screen:content
    a view:ContentRegion ;
    view:rowStart 2 ; view:columnStart 1 ; view:rowSpan 10 ; view:columnSpan 12 ;
    view:scrollable true .

screen:pinned
    a view:PinnedRegion ;
    view:rowStart 12 ; view:columnStart 1 ; view:rowSpan 1 ; view:columnSpan 12 ;
    view:scrollable false .

screen:logo a view:LogoTile .
screen:theme a view:ThemeTile .
screen:language a view:LanguageTile .

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

screen:languagePlacement
    a view:ComponentPlacement ;
    view:placesComponent screen:language ;
    view:hasAlignment view:EndAlignment ;
    view:placementOrder 20 .
"""


def build_semantic_surface_definition_payload() -> dict:
    graph = Graph()
    graph.parse(data=_SEMANTIC_SURFACE_TURTLE, format="turtle")
    definition = parse_surface_definition(graph, URIRef("urn:ontobdc:screen:main"))
    return to_render_payload(definition)


def build_semantic_surface_preview_html(preview: str) -> str:
    """Same visual scenario as `build_surface_preview_html`, but the Surface
    topology (region geometry, scrollability, Logo/Theme/Language order) is
    driven entirely by `surfaceDefinition`, parsed from RDF, rather than by
    the `onto-presentation-surface` element's built-in legacy fallback."""
    background = "#ffffff" if preview == "light" else "#000000"
    foreground = "#111827" if preview == "light" else "#f8fafc"
    accent = "#0284c7" if preview == "light" else "#38bdf8"

    surface_js = component_source("onto-presentation-surface")
    theme_js = component_source("onto-theme-tile")
    language_js = component_source("onto-language-tile")
    logo_js = component_source("onto-logo-tile")
    photo_js = component_source("onto-photo-tile")
    definition_json = json.dumps(build_semantic_surface_definition_payload(), ensure_ascii=False)

    return f"""<!doctype html>
<html lang="pt-BR" data-theme="{preview}" data-language="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OntoBDC Presentation Surface Preview (semantic)</title>
  <style>
    :root {{
      --onto-theme-background: {background};
      --onto-theme-foreground: {foreground};
      --onto-theme-accent: {accent};
    }}
    html, body {{
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--onto-theme-background);
      color: var(--onto-theme-foreground);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      transition: background .18s ease, color .18s ease;
    }}
    onto-presentation-surface {{
      display: block;
      width: 100%;
      height: 100dvh;
    }}
    .system-log {{
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: 4px;
      z-index: 9999;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      pointer-events: none;
      font-size: 11px;
      line-height: 1;
      opacity: .62;
    }}
  </style>
</head>
<body>
  <onto-presentation-surface id="surface">
    <onto-theme-tile data-tile-id="theme" surface-region="operation" columns="1" min-columns="1" max-columns="1"></onto-theme-tile>
    <onto-language-tile data-tile-id="language" surface-region="operation" columns="1" min-columns="1" max-columns="1"></onto-language-tile>
    <onto-logo-tile data-tile-id="logo" surface-region="operation" columns="2" min-columns="1" max-columns="2"></onto-logo-tile>

    <onto-photo-tile
      data-tile-id="photo"
      surface-region="content"
      columns="2"
      rows="3"
      min-columns="1"
      max-columns="3"
      min-rows="1"
      max-rows="3">
    </onto-photo-tile>
  </onto-presentation-surface>

  <div class="system-log" id="system-log">Presentation Surface (semantic) · iniciando…</div>

  <script type="module">
{surface_js}
{theme_js}
{language_js}
{logo_js}
{photo_js}

    const root = document.documentElement;
    const surface = document.querySelector("#surface");
    const log = document.querySelector("#system-log");
    const definition = {definition_json};

    function writeLog(message, detail = null) {{
      log.textContent = detail ? `${{message}} · ${{JSON.stringify(detail)}}` : message;
      console.log(`[Presentation/semantic] ${{message}}`, detail ?? "");
    }}

    surface.addEventListener("surface-layout-changed", event => {{
      writeLog("surface-layout-changed", event.detail);
    }});

    document.addEventListener("photo-selected", event => {{
      const tile = event.target.closest?.("onto-photo-tile") ?? event.target;
      surface.bringToFront(tile);
      writeLog("photo-selected", event.detail);
    }});

    customElements.whenDefined("onto-presentation-surface").then(() => {{
      surface.surfaceDefinition = definition;
      requestAnimationFrame(() => {{
        writeLog("Presentation Surface (semantic) pronta", {{
          theme: root.dataset.theme,
          columns: surface.columns,
          slotSize: Math.round(surface.slotSize),
          operation: surface.operationItems.map(tile => tile.dataset.tileId),
          content: surface.contentItems.map(tile => tile.dataset.tileId),
          pinned: surface.pinnedItems.map(tile => tile.dataset.tileId),
        }});
      }});
    }});
  </script>
</body>
</html>
"""


# claude2.md's own three-tier example (compact/regular/wide), reparsed with
# `parse_default_surface_layouts` — a real caller would resize the browser
# window against this rather than a fixed viewport, so selection is driven
# live rather than baked into one screenshot.
_DEFAULT_LAYOUTS_TURTLE = """
@prefix view: <http://datacenter.app.br/ontology/ontobdc/domain/view.ttl#> .
@prefix layout: <urn:ontobdc:layout:> .

layout:compact
    a view:DefaultSurfaceLayout ;
    view:minAvailableColumns 1 ; view:maxAvailableColumns 4 ; view:layoutPriority 10 ;
    view:columnCount 4 ; view:rowCount 12 ;
    view:hasRegion layout:compactOperation ;
    view:hasRegion layout:compactContent ;
    view:hasRegion layout:compactPinned .

layout:regular
    a view:DefaultSurfaceLayout ;
    view:minAvailableColumns 5 ; view:maxAvailableColumns 8 ; view:layoutPriority 10 ;
    view:columnCount 8 ; view:rowCount 12 ;
    view:hasRegion layout:regularOperation ;
    view:hasRegion layout:regularContent ;
    view:hasRegion layout:regularPinned .

layout:wide
    a view:DefaultSurfaceLayout ;
    view:minAvailableColumns 9 ; view:layoutPriority 10 ;
    view:columnCount 12 ; view:rowCount 12 ;
    view:hasRegion layout:wideOperation ;
    view:hasRegion layout:wideContent ;
    view:hasRegion layout:widePinned .

layout:compactOperation
    a view:OperationRegion ; view:rowStart 1 ; view:columnStart 1 ; view:rowSpan 1 ; view:columnSpan 4 ;
    view:scrollable false ;
    view:hasComponentPlacement layout:compactLogoPlacement .

layout:regularOperation
    a view:OperationRegion ; view:rowStart 1 ; view:columnStart 1 ; view:rowSpan 1 ; view:columnSpan 8 ;
    view:scrollable false ;
    view:hasComponentPlacement layout:regularLogoPlacement ;
    view:hasComponentPlacement layout:regularThemePlacement .

layout:wideOperation
    a view:OperationRegion ; view:rowStart 1 ; view:columnStart 1 ; view:rowSpan 1 ; view:columnSpan 12 ;
    view:scrollable false ;
    view:hasComponentPlacement layout:wideLogoPlacement ;
    view:hasComponentPlacement layout:wideLanguagePlacement ;
    view:hasComponentPlacement layout:wideThemePlacement .

layout:compactContent a view:ContentRegion ; view:rowStart 2 ; view:columnStart 1 ; view:rowSpan 10 ; view:columnSpan 4 ; view:scrollable true .
layout:regularContent a view:ContentRegion ; view:rowStart 2 ; view:columnStart 1 ; view:rowSpan 10 ; view:columnSpan 8 ; view:scrollable true .
layout:wideContent a view:ContentRegion ; view:rowStart 2 ; view:columnStart 1 ; view:rowSpan 10 ; view:columnSpan 12 ; view:scrollable true .

layout:compactPinned a view:PinnedRegion ; view:rowStart 12 ; view:columnStart 1 ; view:rowSpan 1 ; view:columnSpan 4 ; view:scrollable false .
layout:regularPinned a view:PinnedRegion ; view:rowStart 12 ; view:columnStart 1 ; view:rowSpan 1 ; view:columnSpan 8 ; view:scrollable false .
layout:widePinned a view:PinnedRegion ; view:rowStart 12 ; view:columnStart 1 ; view:rowSpan 1 ; view:columnSpan 12 ; view:scrollable false .

layout:logo a view:LogoTile .
layout:theme a view:ThemeTile .
layout:language a view:LanguageTile .

layout:compactLogoPlacement a view:ComponentPlacement ; view:placesComponent layout:logo ; view:hasAlignment view:StartAlignment ; view:placementOrder 10 .

layout:regularLogoPlacement a view:ComponentPlacement ; view:placesComponent layout:logo ; view:hasAlignment view:StartAlignment ; view:placementOrder 10 .
layout:regularThemePlacement a view:ComponentPlacement ; view:placesComponent layout:theme ; view:hasAlignment view:EndAlignment ; view:placementOrder 10 .

layout:wideLogoPlacement a view:ComponentPlacement ; view:placesComponent layout:logo ; view:hasAlignment view:StartAlignment ; view:placementOrder 10 .
layout:wideLanguagePlacement a view:ComponentPlacement ; view:placesComponent layout:language ; view:hasAlignment view:EndAlignment ; view:placementOrder 10 .
layout:wideThemePlacement a view:ComponentPlacement ; view:placesComponent layout:theme ; view:hasAlignment view:EndAlignment ; view:placementOrder 20 .
"""


def build_default_layout_candidate_payloads() -> list:
    graph = Graph()
    graph.parse(data=_DEFAULT_LAYOUTS_TURTLE, format="turtle")
    return [to_render_payload(layout) for layout in parse_default_surface_layouts(graph)]


def build_responsive_surface_preview_html(preview: str) -> str:
    """Resize the browser window against this: with the default
    slotTarget=72/gap=12/padding=16, `columns = floor((width-20)/84)`, so
    below 440px wide it should show the compact OperationRegion (Logo
    only), 440-775px regular (Logo + Theme), and 776px+ wide
    (Logo + Language + Theme) — claude2.md's DefaultSurfaceLayout
    selection driven by real logical capacity, not a CSS breakpoint."""
    background = "#ffffff" if preview == "light" else "#000000"
    foreground = "#111827" if preview == "light" else "#f8fafc"
    accent = "#0284c7" if preview == "light" else "#38bdf8"

    surface_js = component_source("onto-presentation-surface")
    theme_js = component_source("onto-theme-tile")
    language_js = component_source("onto-language-tile")
    logo_js = component_source("onto-logo-tile")
    candidates_json = json.dumps(build_default_layout_candidate_payloads(), ensure_ascii=False)

    return f"""<!doctype html>
<html lang="pt-BR" data-theme="{preview}" data-language="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OntoBDC Presentation Surface Preview (responsive defaults)</title>
  <style>
    :root {{
      --onto-theme-background: {background};
      --onto-theme-foreground: {foreground};
      --onto-theme-accent: {accent};
    }}
    html, body {{ margin: 0; width: 100%; height: 100%; overflow: hidden;
      background: var(--onto-theme-background); color: var(--onto-theme-foreground);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    onto-presentation-surface {{ display: block; width: 100%; height: 100dvh; }}
    .system-log {{ position: fixed; left: 12px; right: 12px; bottom: 4px; z-index: 9999;
      overflow: hidden; white-space: nowrap; text-overflow: ellipsis; pointer-events: none;
      font-size: 11px; line-height: 1; opacity: .62; }}
  </style>
</head>
<body>
  <onto-presentation-surface id="surface">
    <onto-theme-tile data-tile-id="theme" surface-region="operation"></onto-theme-tile>
    <onto-language-tile data-tile-id="language" surface-region="operation"></onto-language-tile>
    <onto-logo-tile data-tile-id="logo" surface-region="operation"></onto-logo-tile>
  </onto-presentation-surface>

  <div class="system-log" id="system-log">Presentation Surface (responsive defaults) · iniciando…</div>

  <script type="module">
{surface_js}
{theme_js}
{language_js}
{logo_js}

    const surface = document.querySelector("#surface");
    const log = document.querySelector("#system-log");
    const candidates = {candidates_json};

    function writeLog(message, detail = null) {{
      log.textContent = detail ? `${{message}} · ${{JSON.stringify(detail)}}` : message;
      console.log(`[Presentation/responsive] ${{message}}`, detail ?? "");
    }}

    surface.addEventListener("surface-default-layout-changed", event => {{
      writeLog("surface-default-layout-changed", event.detail);
    }});

    customElements.whenDefined("onto-presentation-surface").then(() => {{
      surface.defaultSurfaceLayouts = candidates;
    }});
  </script>
</body>
</html>
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Open a full OntoBDC Presentation Surface with fixed operation row, scrollable content and fixed pinned row."
    )
    parser.add_argument(
        "--preview",
        choices=("light", "dark"),
        default="light",
        help="Initial presentation theme. Default: light.",
    )
    parser.add_argument(
        "--semantic",
        action="store_true",
        help="Drive the Surface topology from a parsed RDF SurfaceDefinition instead of the legacy fallback.",
    )
    parser.add_argument(
        "--responsive",
        action="store_true",
        help="Drive Surface topology from parsed DefaultSurfaceLayout candidates; resize the window to switch between them.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.responsive:
        document = build_responsive_surface_preview_html(args.preview)
    elif args.semantic:
        document = build_semantic_surface_preview_html(args.preview)
    else:
        document = build_surface_preview_html(args.preview)

    output_dir = Path(tempfile.mkdtemp(prefix="ontobdc-view-surface-preview-"))
    output_path = output_dir / "index.html"
    output_path.write_text(document, encoding="utf-8")

    print(f"preview:    {args.preview}")
    print(f"semantic:   {args.semantic}")
    print(f"responsive: {args.responsive}")
    if args.responsive:
        print("resize the window: <440px compact, 440-775px regular, 776px+ wide")
    else:
        print("operation: Logo (start) + Theme, Language (end)")
        print("content:   Photo")
        print("pinned:    empty (available for user-pinned tiles)")
    print(f"html:       {output_path}")

    webbrowser.open(output_path.as_uri())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
