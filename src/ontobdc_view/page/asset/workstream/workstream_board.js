(function () {
  "use strict";

  const calendarDayCount = 11;
  const previousCalendarDays = 5;
  const nextCalendarDays = 5;
  const locale = "pt-BR";
  const schedulePrefix = "urn:infobim:ifc-work-schedule/";
  const relationMap = window.infoBimWorkStreamScheduleRelations || {};

  function projectTabsCard() {
    return document.querySelector('[data-card="project-tabs-card"]');
  }

  function panelHeader(card) {
    return card ? card.querySelector(".view-panel-head") : null;
  }

  function tabNavigation(card) {
    return card ? card.querySelector("[data-project-tablist]") : null;
  }

  function tabContent(card) {
    return card ? card.querySelector(".project-tabs-content") : null;
  }

  function replacePanelHeading(card) {
    const header = panelHeader(card);
    if (!header) {
      return;
    }
    const title = header.querySelector(".view-panel-title");
    const description = header.querySelector(".view-panel-copy");
    if (title) {
      title.textContent = "Frentes de Trabalho";
    }
    if (description) {
      description.textContent =
        "Acompanhe as frentes do projeto em uma janela móvel de duas semanas.";
    }
  }

  function createSingleTab() {
    const button = document.createElement("button");
    button.className = "project-tab";
    button.type = "button";
    button.id = "project-tab-workstreams";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", "true");
    button.setAttribute("aria-controls", "project-tab-panel-workstreams");
    button.setAttribute("tabindex", "0");
    button.dataset.tabId = "workstreams";

    const icon = document.createElement("span");
    icon.className = "project-tab-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "≋";

    const label = document.createElement("span");
    label.textContent = "Frentes de Trabalho";

    button.append(icon, label);
    return button;
  }

  function replaceTabNavigation(card) {
    const navigation = tabNavigation(card);
    if (!navigation) {
      return;
    }
    navigation.setAttribute("aria-label", "Frentes de Trabalho");
    navigation.replaceChildren(createSingleTab());
  }

  function createBoardPanel() {
    const panel = document.createElement("section");
    panel.className = "project-tab-panel";
    panel.id = "project-tab-panel-workstreams";
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", "project-tab-workstreams");
    panel.setAttribute("tabindex", "0");

    const scroll = document.createElement("div");
    scroll.className = "workstream-board-scroll";

    const board = document.createElement("div");
    board.className = "workstream-board";
    board.dataset.workstreamBoard = "";

    scroll.appendChild(board);
    panel.appendChild(scroll);
    return panel;
  }

  function replaceTabContent(card) {
    const content = tabContent(card);
    if (!content) {
      return null;
    }
    const panel = createBoardPanel();
    content.replaceChildren(panel);
    return panel.querySelector("[data-workstream-board]");
  }

  function normalizeDate(value) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  function previousDays(today) {
    const values = [];
    const cursor = new Date(today);
    for (let index = 0; index < previousCalendarDays; index += 1) {
      cursor.setDate(cursor.getDate() - 1);
      values.unshift(new Date(cursor));
    }
    return values;
  }

  function followingDays(today) {
    const values = [];
    const cursor = new Date(today);
    for (let index = 0; index < nextCalendarDays; index += 1) {
      cursor.setDate(cursor.getDate() + 1);
      values.push(new Date(cursor));
    }
    return values;
  }

  function calendarWindow() {
    const today = normalizeDate(new Date());
    return [...previousDays(today), today, ...followingDays(today)];
  }

  function sameDate(first, second) {
    return (
      first.getFullYear() === second.getFullYear()
      && first.getMonth() === second.getMonth()
      && first.getDate() === second.getDate()
    );
  }

  function weekdayLabel(value) {
    return new Intl.DateTimeFormat(locale, { weekday: "short" })
      .format(value)
      .replace(".", "");
  }

  function dayLabel(value) {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
    }).format(value);
  }

  function monthLabel(value) {
    return new Intl.DateTimeFormat(locale, { month: "short" })
      .format(value)
      .replace(".", "");
  }

  function createCell(className, row, column) {
    const cell = document.createElement("div");
    cell.className = `workstream-board-cell ${className}`;
    if (row) {
      cell.style.gridRow = String(row);
    }
    if (column) {
      cell.style.gridColumn = String(column);
    }
    return cell;
  }

  function createBoardHeading(workstreamCount) {
    const heading = createCell("workstream-board-heading", 1, 1);
    const title = document.createElement("strong");
    title.textContent = "Frentes de trabalho";
    const subtitle = document.createElement("span");
    subtitle.textContent = workstreamCount === 1
      ? "1 frente publicada"
      : `${workstreamCount} frentes publicadas`;
    heading.append(title, subtitle);
    return heading;
  }

  function createCalendarHeading(date, today, column) {
    const cell = createCell("workstream-calendar-day", 1, column);
    if (column === calendarDayCount + 1) {
      cell.classList.add("is-last-column");
    }
    if (sameDate(date, today)) {
      cell.classList.add("is-today");
    }

    const weekday = document.createElement("abbr");
    weekday.textContent = weekdayLabel(date);
    weekday.title = new Intl.DateTimeFormat(locale, { weekday: "long" })
      .format(date);

    const day = document.createElement("strong");
    day.textContent = dayLabel(date);

    const month = document.createElement("span");
    month.textContent = sameDate(date, today) ? "Hoje" : monthLabel(date);

    cell.append(weekday, day, month);
    return cell;
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
        console.warn("INFOBIM: JSON-LD inválido ignorado no cronograma.", error);
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

  function allRecords() {
    return nestedRecords(jsonLdNodes());
  }

  function workstreamList(records) {
    const workstreams = new Map();
    records.forEach((item) => {
      const facade = valueByLocalName(item, ["conformsTo"]);
      if (!String(facade || "").endsWith("WorkStreamFacade")) {
        return;
      }

      const identifier = String(
        valueByLocalName(item, ["identifier", "GlobalId"]) || ""
      ).trim();
      if (!identifier) {
        return;
      }
      const id = String(valueByLocalName(item, ["@id"]) || identifier);
      workstreams.set(id, {
        "@id": id,
        identifier,
        name: String(
          valueByLocalName(item, ["title", "name", "Name"])
          || "WorkStream"
        ),
        description: String(
          valueByLocalName(item, ["description", "Description"])
          || "Sem descrição publicada."
        ),
        view: `view/work_stream/${encodeURIComponent(identifier)}.html`,
      });
    });
    return Array.from(workstreams.values());
  }

  function textValue(item, keys, fallback) {
    for (const key of keys) {
      const value = item && item[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return fallback;
  }

  function workstreamName(item) {
    return textValue(item, ["name", "schema:name"], "WorkStream");
  }

  function workstreamDescription(item) {
    return textValue(
      item,
      ["description", "schema:description"],
      "Sem descrição publicada.",
    );
  }

  function workstreamView(item) {
    return textValue(item, ["view", "schema:url"], "");
  }

  function relatedScheduleUris(workstreamUri) {
    const value = relationMap[workstreamUri];
    if (Array.isArray(value)) {
      return value.map(String).map((item) => item.trim()).filter(Boolean);
    }
    return value ? [String(value).trim()].filter(Boolean) : [];
  }

  function createWorkstreamCell(item, taskCount, row) {
    const cell = createCell("workstream-board-workstream", row, 1);
    const view = workstreamView(item);
    const link = document.createElement(view ? "a" : "div");
    link.className = "workstream-board-link";
    if (view) {
      link.href = view;
    }

    const name = document.createElement("strong");
    name.textContent = workstreamName(item);

    const description = document.createElement("p");
    description.textContent = workstreamDescription(item);

    const status = document.createElement("span");
    if (taskCount === null) {
      status.textContent = "Abrir frente";
    } else if (taskCount === 1) {
      status.textContent = "1 tarefa no período";
    } else {
      status.textContent = `${taskCount} tarefas no período`;
    }

    link.append(name, description, status);
    cell.appendChild(link);
    return cell;
  }

  function createCalendarSlot(date, today, row, column) {
    const slot = createCell("workstream-calendar-slot", row, column);
    if (column === calendarDayCount + 1) {
      slot.classList.add("is-last-column");
    }
    if (sameDate(date, today)) {
      slot.classList.add("is-today");
    }
    slot.dataset.date = date.toISOString().slice(0, 10);
    return slot;
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

  function recordId(item) {
    return String(valueByLocalName(item, ["@id"]) || "").trim();
  }

  function scheduleRootUri(value) {
    const id = String(value || "").trim();
    if (!id.startsWith(schedulePrefix)) {
      return "";
    }
    const rowMarker = id.indexOf("/row/");
    return rowMarker >= 0 ? id.slice(0, rowMarker) : id;
  }

  function scheduleUris(records) {
    const values = new Set();
    records.forEach((item) => {
      const root = scheduleRootUri(recordId(item));
      if (root) {
        values.add(root);
      }
    });
    return Array.from(values).sort();
  }

  function taskRowKey(item) {
    const id = recordId(item);
    const match = id.match(/^(.*\/row\/\d+)(?:\/|$)/);
    return match ? match[1] : "";
  }

  function scheduleTasks(records, scheduleUri) {
    const scheduleRecords = records.filter((item) => {
      const id = recordId(item);
      return id === scheduleUri || id.startsWith(`${scheduleUri}/`);
    });
    const taskRecords = scheduleRecords.filter((item) => (
      valueByLocalName(item, [
        "work_breakdown_structure", "Identification", "WorkBreakdownStructureField",
      ])
      && valueByLocalName(item, ["name", "Name"])
    ));
    const tasksByRow = new Map();
    taskRecords.forEach((item) => {
      const key = taskRowKey(item);
      if (key) {
        tasksByRow.set(key, item);
      }
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

    return datedRecords.map((timeRecord, index) => {
      const taskRecord = tasksByRow.get(taskRowKey(timeRecord))
        || (valueByLocalName(timeRecord, ["name", "Name"])
          ? timeRecord
          : taskRecords[index] || timeRecord);
      return {
        id: recordId(taskRecord) || `${scheduleUri}/task/${index}`,
        name: String(
          valueByLocalName(taskRecord, ["name", "Name"])
          || "Tarefa sem nome"
        ),
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

  function tasksForSchedules(records, scheduleValues) {
    return scheduleValues.flatMap((scheduleUri) => (
      scheduleTasks(records, scheduleUri)
    ));
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

  function createScheduleTaskBar(task, row, range, includeWbs) {
    const bar = document.createElement("span");
    bar.className = "general-schedule-task-bar";
    bar.dataset.taskId = task.id;
    bar.style.gridRow = String(row);
    bar.style.gridColumn = `${range.start} / span ${range.span}`;

    const label = document.createElement("span");
    label.textContent = includeWbs && task.wbs
      ? `${task.wbs} — ${task.name}`
      : task.name;
    bar.appendChild(label);

    const interval = `${dayLabel(task.start)}–${dayLabel(task.finish)}`;
    bar.title = task.wbs
      ? `${task.wbs} · ${task.name} · ${interval}`
      : `${task.name} · ${interval}`;
    bar.setAttribute("aria-label", bar.title);
    return bar;
  }

  function createScheduleTimeline(tasks, dates, row, className, includeWbs) {
    const timeline = createCell(
      `general-schedule-timeline ${className || ""}`.trim(),
      row,
      "2 / -1",
    );
    const rowCount = Math.max(tasks.length, 1);
    timeline.style.setProperty("--general-schedule-row-count", String(rowCount));
    if (className) {
      timeline.style.minHeight = "112px";
    }
    timeline.setAttribute(
      "aria-label",
      tasks.length
        ? `${tasks.length} tarefas no período`
        : "Sem tarefas no período",
    );

    tasks.forEach((task, index) => {
      const range = taskGridRange(task, dates);
      if (range) {
        timeline.appendChild(
          createScheduleTaskBar(task, index + 1, range, includeWbs)
        );
      }
    });
    return timeline;
  }

  function createGeneralScheduleLabel(taskCount, row) {
    const cell = createCell("general-schedule-label", row, 1);
    const title = document.createElement("strong");
    title.textContent = "Cronograma Geral";
    const subtitle = document.createElement("span");
    subtitle.textContent = taskCount === 1
      ? "1 tarefa no período"
      : `${taskCount} tarefas no período`;
    cell.append(title, subtitle);
    return cell;
  }

  function renderHeader(board, dates, workstreamCount) {
    const today = normalizeDate(new Date());
    board.appendChild(createBoardHeading(workstreamCount));
    dates.forEach((date, index) => {
      board.appendChild(createCalendarHeading(date, today, index + 2));
    });
  }

  function renderWorkstreamRow(board, item, dates, records, row) {
    const schedules = relatedScheduleUris(item["@id"]);
    const tasks = tasksInWindow(
      tasksForSchedules(records, schedules),
      dates,
    );
    const taskCount = schedules.length ? tasks.length : null;
    board.appendChild(createWorkstreamCell(item, taskCount, row));

    if (schedules.length) {
      board.appendChild(
        createScheduleTimeline(
          tasks,
          dates,
          row,
          "workstream-schedule-timeline",
          true,
        )
      );
      return;
    }

    const today = normalizeDate(new Date());
    dates.forEach((date, index) => {
      board.appendChild(
        createCalendarSlot(date, today, row, index + 2)
      );
    });
  }

  function linkedScheduleUris() {
    const values = new Set();
    Object.values(relationMap).forEach((rawValue) => {
      const scheduleValues = Array.isArray(rawValue) ? rawValue : [rawValue];
      scheduleValues.forEach((value) => {
        const normalized = String(value || "").trim();
        if (normalized) {
          values.add(normalized);
        }
      });
    });
    return values;
  }

  function renderGeneralScheduleRow(board, dates, records, row) {
    const generalSchedules = scheduleUris(records);
    if (!generalSchedules.length) {
      return;
    }

    const tasks = tasksInWindow(
      tasksForSchedules(records, generalSchedules),
      dates,
    );
    board.append(
      createGeneralScheduleLabel(tasks.length, row),
      createScheduleTimeline(tasks, dates, row, "", false),
    );
  }

  function renderEmptyState(board, message) {
    const state = document.createElement("div");
    state.className = "workstream-board-state";
    state.style.gridColumn = "1 / -1";
    state.style.gridRow = "2";
    const text = document.createElement("p");
    text.textContent = message;
    state.appendChild(text);
    board.appendChild(state);
  }

  function renderBoard(board) {
    const dates = calendarWindow();
    const records = allRecords();
    const workstreams = workstreamList(records);

    if (dates.length !== calendarDayCount) {
      throw new Error("A janela do calendário deve conter 11 dias corridos.");
    }

    board.replaceChildren();
    renderHeader(board, dates, workstreams.length);

    if (!workstreams.length) {
      renderEmptyState(board, "Nenhuma frente de trabalho cadastrada.");
      return;
    }

    workstreams.forEach((item, index) => {
      renderWorkstreamRow(board, item, dates, records, index + 2);
    });
    renderGeneralScheduleRow(
      board,
      dates,
      records,
      workstreams.length + 2,
    );
  }

  function initialize() {
    const card = projectTabsCard();
    if (!card) {
      return;
    }

    replacePanelHeading(card);
    replaceTabNavigation(card);
    const board = replaceTabContent(card);
    if (!board) {
      return;
    }

    card.dataset.workstreamBoardReady = "true";
    renderBoard(board);
  }

  initialize();
}());
