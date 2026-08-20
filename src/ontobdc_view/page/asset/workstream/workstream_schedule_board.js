(function () {
  "use strict";

  const relationMap = window.infoBimWorkStreamScheduleRelations || {};
  const schedulePrefix = "urn:infobim:ifc-work-schedule/";
  const calendarDayCount = 15;
  const previousCalendarDays = 7;
  const nextCalendarDays = 7;
  const locale = "pt-BR";

  function normalizeDate(value) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  function calendarWindow() {
    const today = normalizeDate(new Date());
    const dates = [];
    for (let offset = -previousCalendarDays; offset <= nextCalendarDays; offset += 1) {
      const date = new Date(today);
      date.setDate(date.getDate() + offset);
      dates.push(date);
    }
    return dates;
  }

  function localName(value) {
    const parts = String(value).split(/[\/#:]/);
    return parts[parts.length - 1];
  }

  function valueByLocalName(item, names) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const accepted = new Set(names.map((name) => name.toLowerCase()));
    for (const [key, value] of Object.entries(item)) {
      if (!accepted.has(localName(key).toLowerCase())) {
        continue;
      }
      const candidate = Array.isArray(value)
        ? (value.length ? value[0] : null)
        : value;
      if (candidate && typeof candidate === "object" && "@value" in candidate) {
        return candidate["@value"];
      }
      if (candidate && typeof candidate === "object" && "@id" in candidate) {
        return candidate["@id"];
      }
      return candidate;
    }
    return null;
  }

  function jsonLdNodes() {
    const nodes = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try {
        const payload = JSON.parse(script.textContent || "{}");
        const documents = Array.isArray(payload) ? payload : [payload];
        documents.forEach((document) => {
          if (Array.isArray(document["@graph"])) {
            nodes.push(...document["@graph"]);
          } else {
            nodes.push(document);
          }
        });
      } catch (error) {
        console.warn("INFOBIM: JSON-LD inválido ignorado na relação de cronogramas.", error);
      }
    });
    return nodes;
  }

  function nestedRecords(nodes) {
    const records = [];
    const visit = (value) => {
      if (!value || typeof value !== "object") {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      records.push(value);
      Object.values(value).forEach(visit);
    };
    nodes.forEach(visit);
    return records;
  }

  function parseScheduleDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return normalizeDate(value);
    }
    if (typeof value !== "string") {
      return null;
    }
    const source = value.trim();
    const brazilian = source.match(/(?:^|\s)(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
    if (brazilian) {
      const year = Number(brazilian[3]);
      return new Date(
        year < 100 ? 2000 + year : year,
        Number(brazilian[2]) - 1,
        Number(brazilian[1]),
      );
    }
    const iso = source.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return iso
      ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
      : null;
  }

  function scheduleUriFromId(value) {
    const id = String(value || "");
    if (!id.startsWith(schedulePrefix)) {
      return "";
    }
    const suffix = id.slice(schedulePrefix.length);
    const identifier = suffix.split("/")[0];
    return identifier ? `${schedulePrefix}${identifier}` : "";
  }

  function allScheduleUris() {
    const values = new Set();
    nestedRecords(jsonLdNodes()).forEach((item) => {
      const uri = scheduleUriFromId(valueByLocalName(item, ["@id"]));
      if (uri) {
        values.add(uri);
      }
    });
    return Array.from(values);
  }

  function scheduleTasks(scheduleUri) {
    const records = nestedRecords(jsonLdNodes());
    const scheduleRecords = records.filter((item) => {
      const id = String(valueByLocalName(item, ["@id"]) || "");
      return id === scheduleUri || id.startsWith(`${scheduleUri}/`);
    });
    const datedRecords = scheduleRecords.filter((item) => {
      const start = valueByLocalName(item, [
        "schedule_start", "ScheduleStart", "StartDateField",
      ]);
      const finish = valueByLocalName(item, [
        "schedule_finish", "ScheduleFinish", "FinishDateField",
      ]);
      return parseScheduleDate(start) && parseScheduleDate(finish);
    });
    const taskRecords = scheduleRecords.filter((item) => (
      valueByLocalName(item, [
        "work_breakdown_structure", "Identification", "WorkBreakdownStructureField",
      ])
      && valueByLocalName(item, ["name", "Name"])
    ));
    return datedRecords.map((timeRecord, index) => {
      const taskRecord = valueByLocalName(timeRecord, ["name", "Name"])
        ? timeRecord
        : taskRecords[index] || timeRecord;
      return {
        id: String(valueByLocalName(taskRecord, [
          "@id", "document_identifier", "identifier", "IdentifierField",
        ]) || index),
        name: String(valueByLocalName(taskRecord, ["name", "Name"]) || "Tarefa sem nome"),
        wbs: String(valueByLocalName(taskRecord, [
          "work_breakdown_structure", "Identification", "WorkBreakdownStructureField",
        ]) || ""),
        start: parseScheduleDate(valueByLocalName(timeRecord, [
          "schedule_start", "ScheduleStart", "StartDateField",
        ])),
        finish: parseScheduleDate(valueByLocalName(timeRecord, [
          "schedule_finish", "ScheduleFinish", "FinishDateField",
        ])),
      };
    });
  }

  function tasksInWindow(tasks, dates) {
    const first = dates[0];
    const last = dates[dates.length - 1];
    return tasks
      .filter((task) => task.start <= last && task.finish >= first)
      .sort((left, right) => (
        left.start - right.start
        || left.finish - right.finish
        || left.name.localeCompare(right.name, locale)
      ));
  }

  function taskGridRange(task, dates) {
    const visible = dates
      .map((date, index) => ({ date, index }))
      .filter(({ date }) => date >= task.start && date <= task.finish);
    if (!visible.length) {
      return null;
    }
    return {
      start: visible[0].index + 1,
      span: visible[visible.length - 1].index - visible[0].index + 1,
    };
  }

  function workstreamUris() {
    const values = [];
    const seen = new Set();
    nestedRecords(jsonLdNodes()).forEach((item) => {
      const facade = valueByLocalName(item, ["conformsTo"]);
      if (!String(facade || "").endsWith("WorkStreamFacade")) {
        return;
      }
      const id = String(valueByLocalName(item, ["@id"]) || "").trim();
      if (id && !seen.has(id)) {
        seen.add(id);
        values.push(id);
      }
    });
    return values;
  }

  function relatedScheduleUris(workstreamUri) {
    const value = relationMap[workstreamUri];
    if (Array.isArray(value)) {
      return value.map(String).filter(Boolean);
    }
    return value ? [String(value)] : [];
  }

  function dayLabel(value) {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
    }).format(value);
  }

  function summaryTask(tasks) {
    if (!tasks.length) {
      return null;
    }
    return {
      start: new Date(Math.min(...tasks.map((task) => task.start.getTime()))),
      finish: new Date(Math.max(...tasks.map((task) => task.finish.getTime()))),
    };
  }

  function createTaskBar(task, row, range, labelText) {
    const bar = document.createElement("span");
    bar.className = "general-schedule-task-bar";
    bar.style.gridRow = String(row);
    bar.style.gridColumn = `${range.start} / span ${range.span}`;

    const label = document.createElement("span");
    label.textContent = labelText;
    bar.appendChild(label);

    bar.title = `${labelText} · ${dayLabel(task.start)}–${dayLabel(task.finish)}`;
    bar.setAttribute("aria-label", bar.title);
    return bar;
  }

  function createTimeline(tasks, dates, summaryOnly) {
    const timeline = document.createElement("div");
    timeline.className = "workstream-board-cell general-schedule-timeline";
    if (summaryOnly) {
      timeline.classList.add("workstream-schedule-timeline");
    }

    const visibleTasks = summaryOnly
      ? [summaryTask(tasks)].filter(Boolean)
      : tasks;
    timeline.style.setProperty(
      "--general-schedule-row-count",
      String(Math.max(visibleTasks.length, 1)),
    );
    timeline.style.minHeight = summaryOnly ? "112px" : "";

    visibleTasks.forEach((task, index) => {
      const range = taskGridRange(task, dates);
      if (!range) {
        return;
      }
      const label = summaryOnly
        ? "Cronograma da frente"
        : (task.wbs ? `${task.wbs} — ${task.name}` : task.name);
      timeline.appendChild(createTaskBar(task, index + 1, range, label));
    });
    return timeline;
  }

  function replaceWorkstreamSlots(label, tasks, dates) {
    const slots = [];
    let cursor = label.nextElementSibling;
    while (
      cursor
      && slots.length < calendarDayCount
      && cursor.classList.contains("workstream-calendar-slot")
    ) {
      slots.push(cursor);
      cursor = cursor.nextElementSibling;
    }
    if (slots.length !== calendarDayCount) {
      return;
    }

    const timeline = createTimeline(tasks, dates, true);
    slots[0].replaceWith(timeline);
    slots.slice(1).forEach((slot) => slot.remove());

    const status = label.querySelector(".workstream-board-link span");
    if (status) {
      status.textContent = tasks.length
        ? `${tasks.length} tarefas no período`
        : "Cronograma relacionado";
    }
  }

  function replaceGeneralSchedule(unrelatedScheduleUris, dates) {
    const label = document.querySelector(
      "[data-workstream-board] .general-schedule-label",
    );
    const timeline = document.querySelector(
      "[data-workstream-board] .general-schedule-timeline:not(.workstream-schedule-timeline)",
    );
    if (!label || !timeline) {
      return;
    }

    if (!unrelatedScheduleUris.length) {
      label.remove();
      timeline.remove();
      return;
    }

    const tasks = tasksInWindow(
      unrelatedScheduleUris.flatMap((scheduleUri) => scheduleTasks(scheduleUri)),
      dates,
    );
    const subtitle = label.querySelector("span");
    if (subtitle) {
      subtitle.textContent = tasks.length === 1
        ? "1 tarefa no período"
        : `${tasks.length} tarefas no período`;
    }
    timeline.replaceWith(createTimeline(tasks, dates, false));
  }

  function render() {
    const board = document.querySelector("[data-workstream-board]");
    if (!board || !Object.keys(relationMap).length) {
      return;
    }

    const dates = calendarWindow();
    if (dates.length !== calendarDayCount) {
      throw new Error("A janela do calendário deve conter 15 dias corridos.");
    }

    const workstreamIds = workstreamUris();
    const labels = Array.from(
      board.querySelectorAll(".workstream-board-workstream"),
    );
    const relatedSet = new Set();

    labels.forEach((label, index) => {
      const workstreamUri = workstreamIds[index];
      if (!workstreamUri) {
        return;
      }
      const schedules = relatedScheduleUris(workstreamUri);
      schedules.forEach((scheduleUri) => relatedSet.add(scheduleUri));
      if (!schedules.length) {
        return;
      }
      const tasks = tasksInWindow(
        schedules.flatMap((scheduleUri) => scheduleTasks(scheduleUri)),
        dates,
      );
      replaceWorkstreamSlots(label, tasks, dates);
    });

    replaceGeneralSchedule(
      allScheduleUris().filter((scheduleUri) => !relatedSet.has(scheduleUri)),
      dates,
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render, { once: true });
  } else {
    render();
  }
}());
