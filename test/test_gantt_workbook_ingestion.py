"""The IfcWorkSchedule Page ingests its workbook the way the WorkStream Page does.

Not a copy of that mechanism — the same one. The container connection is
rendered from the shared template with the schedule's own options, and the
Page's runtime reads the connected folder's spreadsheet in the browser
rather than depending on build-time data reaching the Surface graph.
"""
import json
import re
import tempfile
from datetime import datetime
from pathlib import Path

import pytest
from openpyxl import Workbook

from ontobdc_view.page.adapter.gantt_payload import GanttPayloadAdapter
from ontobdc_view.page.adapter.gantt_script import GanttScriptAdapter
from ontobdc_view.page.adapter.workstream_payload import WorkstreamPayloadAdapter

ADAPTER = GanttScriptAdapter()
SCRIPTS = ("i18n_apply", "graph_reader", "container_connection", "connection_state",
           "pyodide_runtime", "task_table_timeline", "dependency_arrows")


@pytest.mark.parametrize("name", SCRIPTS)
def test_every_script_is_buildable(name):
    assert ADAPTER.script_source(name).strip()


@pytest.mark.parametrize("name", SCRIPTS)
def test_every_script_attaches_to_the_one_gantt_runtime(name):
    """Two runtime globals on one Page do not see each other: the workbook
    would be read and then thrown away."""
    globals_used = set(re.findall(r"window\.(OntoBDC\w+)", ADAPTER.script_source(name)))
    assert globals_used <= {"OntoBDCGanttViewRuntime"}


def test_the_payload_mirrors_the_workstream_one():
    schedule = GanttPayloadAdapter().build({}, "urn:x:storage/dataset/sched/1BL9", "1BL9")
    work_stream = WorkstreamPayloadAdapter().build({}, "urn:x:storage/dataset/ws/WS-1", "WS-1")

    assert schedule is not None and work_stream is not None
    # Paths into the container, never data — the contract that lets the Page
    # stay fresh without the build embedding a workbook.
    for key in ("projectId", "elementId", "entity", "datapackagePath", "roCratePath"):
        assert key in schedule and key in work_stream
    assert schedule["datapackagePath"] == work_stream["datapackagePath"]


def test_no_payload_without_a_dataset_folder():
    assert GanttPayloadAdapter().build({}, "urn:x", "x") is None


def test_the_render_pipeline_reparses_and_redraws_after_ingestion():
    """Reading the workbook is useless if nothing re-runs: applyNodes must
    drive parse, render and arrows, and must fail loudly if one is missing."""
    source = ADAPTER.script_source("pyodide_runtime")
    for step in ("runParse", "runRender", "runArrows"):
        assert f'"{step}"' in source or f"runtime.{step}()" in source
    assert "did not export" in source


@pytest.mark.parametrize("name", ["graph_reader", "task_table_timeline", "dependency_arrows"])
def test_each_stage_exports_its_entry_point(name):
    entry = {"graph_reader": "runParse", "task_table_timeline": "runRender",
             "dependency_arrows": "runArrows"}[name]
    assert re.search(rf"rt\.{entry}\s*=\s*{entry}", ADAPTER.script_source(name))


def test_the_workbook_parser_turns_real_sheets_into_graph_nodes():
    """Runs the generated Python against a workbook shaped like the one
    `EntityContextWorkbookAdapter` writes."""
    script = re.search(
        r"const WORKBOOK_PARSE_SCRIPT = `(.*?)`;",
        ADAPTER.script_source("pyodide_runtime"),
        re.DOTALL,
    ).group(1)

    root = Path(tempfile.mkdtemp())
    (root / ".__ontobdc__").mkdir()
    (root / "payload" / "document").mkdir(parents=True)
    workbook_path = root / "payload" / "document" / "ifc_work_schedule.xlsx"

    sheets = {
        "IfcWorkSchedule": (["GlobalId", "Name"], [["S1", "Cronograma"]]),
        "IfcTask": (["GlobalId", "Name", "TaskTime"], [["T1", "Escavação", "TT1"], ["", "", ""]]),
        "IfcTaskTime": (["GlobalId", "ScheduleStart"], [["TT1", datetime(2026, 3, 2)]]),
        "IfcRelSequence": (["GlobalId", "RelatingProcess", "RelatedProcess"], [["Q1", "T1", "T2"]]),
    }
    workbook = Workbook()
    workbook.remove(workbook.active)
    resources = []
    for name, (header, rows) in sheets.items():
        sheet = workbook.create_sheet(title=name)
        sheet.append(header)
        for row in rows:
            sheet.append(row)
        resources.append({
            "name": name.lower(),
            "path": "../payload/document/ifc_work_schedule.xlsx",
            "dialect": {"excel": {"sheet": name}},
            "entityIdentifier": name,
        })
    workbook.save(workbook_path)
    workbook.close()
    (root / ".__ontobdc__" / "datapackage.json").write_text(
        json.dumps({"resources": resources}), encoding="utf-8"
    )

    scope = {
        "view_payload_json": json.dumps({
            "datapackagePath": ".__ontobdc__/datapackage.json",
            "scheduleUri": "urn:x:storage/dataset/sched/S1",
        }),
        "container_mount_path": str(root),
    }
    body = script.strip()
    tail = body.rindex("json.dumps({")
    exec(body[:tail], scope)  # noqa: S102 - the generated script is the subject
    result = json.loads(eval(body[tail:], scope))  # noqa: S307

    assert result["counts"] == {
        "IfcWorkSchedule": 1, "IfcTask": 1, "IfcTaskTime": 1, "IfcRelSequence": 1
    }, "blank rows must not become nodes"

    ibim = "https://infobim.org/ontology/ns#"
    task_time = next(n for n in result["nodes"] if n["@type"][0] == ibim + "IfcTaskTime")
    assert task_time[ibim + "ScheduleStart"][0]["@value"].startswith("2026-03-02"), (
        "dates must reach the graph as ISO strings the Page can parse"
    )
