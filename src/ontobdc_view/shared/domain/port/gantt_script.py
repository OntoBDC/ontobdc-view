from abc import ABC, abstractmethod


class GanttScriptPort(ABC):
    """Returns the IfcWorkSchedule Gantt Page's runtime JS source, by script name.

    Each name corresponds to one state of
    `GanttScriptGenerationProcessState` (ontobdc-wip) — the build-time
    Capability for that state writes the returned text to
    `.__ontobdc__/asset/ifc_work_schedule_view/<name>.js` inside the container.
    This port only builds text; it has no knowledge of the filesystem or
    of the statechart driving it, matching how `PageAssetPort` has no
    knowledge of the Capability that calls `read_page_asset`.
    """

    @abstractmethod
    def script_source(self, name: str) -> str:
        """Return the JS source for `name`.

        Raises `ValueError` if `name` isn't a known script.
        """
