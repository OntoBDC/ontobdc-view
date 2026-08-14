# OntoBDC View

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

`ontobdc-view` is the distributable browser presentation package for OntoBDC-generated views.

It ships Web Components and other browser assets as Python package data so the OntoBDC CLI can resolve them locally and embed them into standalone offline HTML artifacts.

## Install

```bash
pip install ontobdc-view
```

## Python API

```python
from ontobdc_view import component_path, read_component

path = component_path("onto-theme-tile.js")
source = read_component("onto-theme-tile.js")
```

`read_component()` is intended for generators that need to inline the JavaScript into a final HTML artifact.

## Integrated Presentation Surface preview

This preview builds and opens a complete `onto-presentation-surface` containing all current demonstration Tiles at the same time:

- Logo
- Theme
- Language
- Photo

Light:

```bash
python test/surface_preview.py --preview light
```

Dark:

```bash
python test/surface_preview.py --preview dark
```

The Surface computes its own grid from the available browser width. Resize the browser window to force a new allocation. The Logo and Photo Tiles receive their allocated `columns` and `rows` from the Surface and adapt their representation. Theme and Language remain `1x1`. Presentation events are printed in the browser console and the latest event is shown in the system log at the bottom of the page.

## Component preview

The development preview script builds the selected component, generates a temporary standalone HTML file and opens it in the default browser.

General form:

```bash
python test/preview.py <component-path> --preview light|dark --columns N --rows N
```

### Theme Tile

Light preview:

```bash
python test/preview.py src/ontobdc_view/assets/components/onto-theme-tile.js --preview light
```

Dark preview:

```bash
python test/preview.py src/ontobdc_view/assets/components/onto-theme-tile.js --preview dark
```

### Language Tile

```bash
python test/preview.py src/ontobdc_view/assets/components/onto-language-tile.js --preview light
```

```bash
python test/preview.py src/ontobdc_view/assets/components/onto-language-tile.js --preview dark
```

### Logo Tile

Mark only (`1x1`):

```bash
python test/preview.py src/ontobdc_view/assets/components/onto-logo-tile.js --preview light --columns 1 --rows 1
```

Logotype (`3x1`):

```bash
python test/preview.py src/ontobdc_view/assets/components/onto-logo-tile.js --preview light --columns 3 --rows 1
```

Logotype and slogan (`3x2`):

```bash
python test/preview.py src/ontobdc_view/assets/components/onto-logo-tile.js --preview dark --columns 3 --rows 2
```

### Photo Tile

Image only (`1x1`):

```bash
python test/preview.py src/ontobdc_view/assets/components/onto-photo-tile.js --preview light --columns 1 --rows 1
```

Image with additional presentation space (`2x2`):

```bash
python test/preview.py src/ontobdc_view/assets/components/onto-photo-tile.js --preview light --columns 2 --rows 2
```

Large photo representation with caption and metadata (`2x3`):

```bash
python test/preview.py src/ontobdc_view/assets/components/onto-photo-tile.js --preview dark --columns 2 --rows 3
```

The `--preview` option controls the host surface only: `light` opens the component over a white surface and `dark` over a black surface. `--columns` and `--rows` emulate the logical area allocated to the Tile by a Presentation Surface.

## Browser usage during development

```html
<script type="module" src="./onto-theme-tile.js"></script>

<onto-theme-tile style="width:72px;height:72px"></onto-theme-tile>
```

The component uses a closed Shadow DOM and emits a composed `theme-changed` event:

```js
document.addEventListener("theme-changed", event => {
  console.log(event.detail.theme);
});
```

## Packaging model

The Python package is only the distribution mechanism. The browser assets remain plain JavaScript/Web Components.

Expected OntoBDC flow:

```text
pip install ontobdc-view
        ↓
OntoBDC resolves installed assets
        ↓
OntoBDC reads the required component source
        ↓
OntoBDC embeds it in generated HTML
        ↓
standalone/offline artifact
```

`ontobdc-view` has its own version and release cycle, independent from the OntoBDC core runtime.
