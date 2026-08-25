from __future__ import annotations

from importlib.resources import files
from typing import Optional

from ontobdc_view.shared.domain.port.ontobdc_runtime_asset import (
    OntobdcRuntimeAssetPort,
)

# Dependency order matters: later modules reference globals/classes defined
# by earlier ones when concatenated into one inline <script>.
_ANNOTATION_MODULE_LOAD_ORDER = (
    "annotation_model.js",
    "annotation_visual_contract.js",
    "annotation_store.js",
    "annotation_surface.js",
    "annotation_visual_resolver.js",
    "annotation_renderer.js",
    "annotation_field_factory.js",
    "annotation_form_registry.js",
    "annotation_editor.js",
    "annotation_geometry_controller.js",
    "annotation_lifecycle.js",
    "annotation_workspace.js",
    "annotation_subject_page.js",
    "annotation_runtime.js",
)

_ANNOTATION_CSS_FILES = (
    "annotation_visual.css",
    "annotation_editor.css",
    "annotation_workspace.css",
    "annotation_subject_page.css",
)


class OntobdcRuntimeAssetAdapter(OntobdcRuntimeAssetPort):
    """Reads `ontobdc_view`'s own packaged JS/CSS runtime assets.

    Every method degrades gracefully (None/empty string) if an asset
    moved, so a Page still renders -- just without annotations/
    workstream-context -- rather than failing outright.
    """

    def annotation_runtime_script(self) -> Optional[str]:
        try:
            root = (
                files("ontobdc_view")
                .joinpath("page")
                .joinpath("asset")
                .joinpath("annotation")
            )
            parts = [
                root.joinpath(name).read_text(encoding="utf-8")
                for name in _ANNOTATION_MODULE_LOAD_ORDER
            ]
        except (FileNotFoundError, OSError, TypeError):
            return None
        return "\n".join(parts)

    def annotation_runtime_style(self) -> str:
        try:
            root = (
                files("ontobdc_view")
                .joinpath("page")
                .joinpath("asset")
                .joinpath("annotation")
            )
            parts = [
                root.joinpath(name).read_text(encoding="utf-8")
                for name in _ANNOTATION_CSS_FILES
            ]
        except (FileNotFoundError, OSError, TypeError):
            return ""
        return "\n".join(parts)

    def workstream_context_script(self) -> str:
        try:
            return (
                files("ontobdc_view")
                .joinpath("page")
                .joinpath("asset")
                .joinpath("workstream")
                .joinpath("workstream_context.js")
                .read_text(encoding="utf-8")
            )
        except (FileNotFoundError, OSError, TypeError):
            return ""
