from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BrandDefinition:
    """Build-time brand assets injected into the logo tile.

    SVGs should preferably use ``currentColor`` and/or OntoBDC theme CSS variables
    (for example ``var(--onto-theme-accent)``) when they are expected to react to
    the active theme. Fixed SVG colors are preserved intentionally.
    """

    name: str
    mark_svg: str
    logotype_svg: str
    slogan: str | None = None


DEFAULT_BRAND = BrandDefinition(
    name="OntoBDC",
    mark_svg='''<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="25" fill="none" stroke="currentColor" stroke-width="8"/><circle cx="32" cy="32" r="7" fill="currentColor"/></svg>''',
    logotype_svg='''<svg viewBox="0 0 260 64" aria-hidden="true"><circle cx="32" cy="32" r="23" fill="none" stroke="var(--onto-theme-accent, currentColor)" stroke-width="7"/><circle cx="32" cy="32" r="6" fill="var(--onto-theme-accent, currentColor)"/><text x="68" y="42" fill="currentColor" font-family="system-ui, sans-serif" font-size="31" font-weight="700">OntoBDC</text></svg>''',
    slogan="Data with Brains",
)
