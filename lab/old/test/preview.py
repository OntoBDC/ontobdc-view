
import argparse
import html
import json
import re
import tempfile
import webbrowser
from dataclasses import asdict
from pathlib import Path

from ontobdc_view import DEFAULT_BRAND, DEFAULT_PHOTO, normalize_languages, normalize_themes
from ontobdc_view.build import (
    BRAND_PLACEHOLDER,
    LANGUAGE_PLACEHOLDER,
    PHOTO_PLACEHOLDER,
    THEME_PLACEHOLDER,
)


CUSTOM_ELEMENT_RE = re.compile(
    r"customElements\.define\(\s*['\"]([^'\"]+)['\"]",
    re.MULTILINE,
)


def build_component(component_path: Path) -> tuple[str, str]:
    """Build the exact component source passed on the command line."""
    source = component_path.read_text(encoding="utf-8")

    if THEME_PLACEHOLDER in source:
        payload = json.dumps(
            [asdict(theme) for theme in normalize_themes()],
            ensure_ascii=False,
            separators=(",", ":"),
        )
        source = source.replace(THEME_PLACEHOLDER, payload)

    if LANGUAGE_PLACEHOLDER in source:
        payload = json.dumps(
            [asdict(language) for language in normalize_languages()],
            ensure_ascii=False,
            separators=(",", ":"),
        )
        source = source.replace(LANGUAGE_PLACEHOLDER, payload)

    if BRAND_PLACEHOLDER in source:
        payload = json.dumps(
            asdict(DEFAULT_BRAND),
            ensure_ascii=False,
            separators=(",", ":"),
        )
        source = source.replace(BRAND_PLACEHOLDER, payload)

    if PHOTO_PLACEHOLDER in source:
        payload = json.dumps(
            asdict(DEFAULT_PHOTO),
            ensure_ascii=False,
            separators=(",", ":"),
        )
        source = source.replace(PHOTO_PLACEHOLDER, payload)

    match = CUSTOM_ELEMENT_RE.search(source)
    if not match:
        raise RuntimeError(
            "could not infer custom element name; expected customElements.define(...)"
        )

    return match.group(1), source


def build_preview_html(
    *,
    element_name: str,
    javascript: str,
    preview: str,
    source_path: Path,
    columns: int,
    rows: int,
) -> str:
    background = "#ffffff" if preview == "light" else "#000000"
    foreground = "#111827" if preview == "light" else "#f8fafc"
    accent = "#0284c7" if preview == "light" else "#38bdf8"

    safe_title = html.escape(source_path.name)
    safe_element = html.escape(element_name)
    slot = 96
    gap = 12
    width = columns * slot + max(0, columns - 1) * gap
    height = rows * slot + max(0, rows - 1) * gap

    return f"""<!doctype html>
<html lang="pt-BR" data-theme="{preview}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OntoBDC View Preview · {safe_title}</title>
  <style>
    html, body {{
      margin: 0;
      min-height: 100%;
      background: {background};
      color: {foreground};
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      transition: background .18s ease, color .18s ease;
      --onto-theme-background: {background};
      --onto-theme-foreground: {foreground};
      --onto-theme-accent: {accent};
    }}
    body {{
      min-height: 100vh;
      display: grid;
      place-items: center;
    }}
    .preview-stage {{
      width: {width}px;
      height: {height}px;
      display: grid;
      place-items: stretch;
    }}
    .preview-meta {{
      position: fixed;
      left: 12px;
      bottom: 10px;
      font-size: 12px;
      opacity: .65;
      user-select: none;
    }}
  </style>
</head>
<body>
  <main class="preview-stage">
    <{safe_element} columns="{columns}" rows="{rows}"></{safe_element}>
  </main>
  <div class="preview-meta" id="preview-meta">{safe_title} · {safe_element} · {columns}×{rows} · preview={preview}</div>

  <script type="module">
{javascript}

    const component = document.querySelector("{safe_element}");
    const meta = document.querySelector("#preview-meta");

    function applyThemeFromBuildTokens(themeName) {{
      const root = document.documentElement;
      const style = getComputedStyle(root);
      const background = style.getPropertyValue("--onto-theme-background").trim();
      const foreground = style.getPropertyValue("--onto-theme-foreground").trim();

      if (background) {{
        root.style.background = background;
        document.body.style.background = background;
      }}
      if (foreground) {{
        root.style.color = foreground;
        document.body.style.color = foreground;
      }}

      meta.textContent = `{safe_title} · {safe_element} · {columns}×{rows} · theme=${{themeName}}`;
    }}

    component.addEventListener("theme-changed", (event) => {{
      console.log("[Presentation Event] theme-changed", event.detail);
      applyThemeFromBuildTokens(event.detail.theme);
    }});

    component.addEventListener("language-changed", (event) => {{
      console.log("[Presentation Event] language-changed", event.detail);
      meta.textContent = `{safe_title} · {safe_element} · {columns}×{rows} · language=${{event.detail.language}}`;
    }});

    component.addEventListener("photo-selected", (event) => {{
      console.log("[Presentation Event] photo-selected", event.detail);
      meta.textContent = `{safe_title} · {safe_element} · {columns}×{rows} · photo-selected=${{event.detail.photoId}}`;
    }});

    component.addEventListener("photo-open-requested", (event) => {{
      console.log("[Presentation Event] photo-open-requested", event.detail);
      meta.textContent = `{safe_title} · {safe_element} · {columns}×{rows} · photo-open-requested=${{event.detail.photoId}}`;
    }});

    customElements.whenDefined("{safe_element}").then(() => {{
      requestAnimationFrame(() => {{
        const currentTheme = document.documentElement.dataset.theme || "{preview}";
        applyThemeFromBuildTokens(currentTheme);
      }});
    }});
  </script>
</body>
</html>
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build an OntoBDC View Web Component and open a local HTML preview."
    )
    parser.add_argument(
        "component",
        type=Path,
        help="Path to the component JavaScript source/template.",
    )
    parser.add_argument(
        "--preview",
        choices=("light", "dark"),
        default="light",
        help="Preview surface: white for light, black for dark. Default: light.",
    )
    parser.add_argument("--columns", type=int, default=1, help="Logical tile columns. Default: 1.")
    parser.add_argument("--rows", type=int, default=1, help="Logical tile rows. Default: 1.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    component_path = args.component.expanduser().resolve()

    if not component_path.is_file():
        raise SystemExit(f"component not found: {component_path}")
    if args.columns < 1 or args.rows < 1:
        raise SystemExit("--columns and --rows must be >= 1")

    element_name, javascript = build_component(component_path)
    document = build_preview_html(
        element_name=element_name,
        javascript=javascript,
        preview=args.preview,
        source_path=component_path,
        columns=args.columns,
        rows=args.rows,
    )

    output_dir = Path(tempfile.mkdtemp(prefix="ontobdc-view-preview-"))
    output_path = output_dir / "index.html"
    output_path.write_text(document, encoding="utf-8")

    print(f"component: {component_path}")
    print(f"element:   <{element_name}>")
    print(f"preview:   {args.preview}")
    print(f"size:      {args.columns}x{args.rows}")
    print(f"html:      {output_path}")

    webbrowser.open(output_path.as_uri())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
