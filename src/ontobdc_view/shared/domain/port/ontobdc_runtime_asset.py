from abc import ABC, abstractmethod
from typing import Optional


class OntobdcRuntimeAssetPort(ABC):
    """Reads `ontobdc_view`'s own packaged JS/CSS runtime assets (the
    annotation editor and the WorkStream dimension-URI helper) for
    inlining into a standalone Page.

    Page-rendering assets live in `ontobdc_view` only, never in
    `ontobdc` -- `ontobdc` is the CLI/backend package and has no
    business shipping JS/CSS. This port used to reach into `ontobdc`'s
    own package tree for these files; they were moved here instead.
    """

    @abstractmethod
    def annotation_runtime_script(self) -> Optional[str]:
        """Concatenate the native annotation modules, in dependency
        order. Returns None if a module is missing, so a Page can render
        without annotations rather than fail outright."""

    @abstractmethod
    def annotation_runtime_style(self) -> str:
        """Concatenate the native annotation CSS files."""

    @abstractmethod
    def workstream_context_script(self) -> str:
        """Read workstream_context.js (dimension URI helper)."""
