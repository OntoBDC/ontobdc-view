"""Container connection is shared between Pages, not copied per Page.

Acquiring a container handle — picker, IndexedDB persistence, permission,
descending into the dataset folder — is identical whichever entity a Page
shows. Copying it for a second Page guarantees the two drift the first time
one is fixed, so both render the same template with their own options.
"""
import re

import pytest

from ontobdc_view.page.adapter.container import (
    IFC_WORK_SCHEDULE_RUNTIME,
    WORK_STREAM_RUNTIME,
    connection_state_source,
    container_connection_source,
)
from ontobdc_view.page.adapter.work_stream import WorkStreamScriptAdapter

RUNTIMES = [WORK_STREAM_RUNTIME, IFC_WORK_SCHEDULE_RUNTIME]
SOURCES = [container_connection_source, connection_state_source]


@pytest.mark.parametrize("options", RUNTIMES, ids=lambda o: o.resource_name)
@pytest.mark.parametrize("source", SOURCES, ids=lambda s: s.__name__)
def test_every_placeholder_is_resolved(source, options):
    assert not re.findall(r"__[A-Z_]+__", source(options))


@pytest.mark.parametrize("source", SOURCES, ids=lambda s: s.__name__)
def test_the_two_pages_differ_only_by_their_declared_options(source):
    work_stream, schedule = source(WORK_STREAM_RUNTIME), source(IFC_WORK_SCHEDULE_RUNTIME)
    assert work_stream != schedule

    normalized = schedule
    # Read the options off the object rather than listing them here: a new
    # per-Page option added upstream must widen what this test tolerates
    # automatically, not fail as if the Pages had diverged.
    for attribute in vars(WORK_STREAM_RUNTIME):
        normalized = normalized.replace(
            getattr(IFC_WORK_SCHEDULE_RUNTIME, attribute),
            getattr(WORK_STREAM_RUNTIME, attribute),
        )
    assert normalized == work_stream, "the two Pages have diverged beyond their options"


def test_the_work_stream_page_still_emits_what_it_always_did():
    """The extraction must be a move, not a rewrite: the WorkStream Page's
    own scripts are the regression surface here."""
    adapter = WorkStreamScriptAdapter()
    connection = adapter.script_source("container_connection")

    assert "OntoBDCWorkStreamViewRuntime" in connection
    assert '"ontobdc-workstream-view"' in connection
    assert 'const WORK_STREAM_RESOURCE_NAME = "work_stream";' in connection
    assert connection == container_connection_source(WORK_STREAM_RUNTIME)


@pytest.mark.parametrize(
    "attribute",
    ["runtime_global", "handle_db_name", "resource_name", "no_context_key", "connection_event"],
)
def test_the_pages_share_no_runtime_identity(attribute):
    """Two Pages open in the same browser must not fight over one global,
    one IndexedDB store or one connection event."""
    assert getattr(WORK_STREAM_RUNTIME, attribute) != getattr(IFC_WORK_SCHEDULE_RUNTIME, attribute)
