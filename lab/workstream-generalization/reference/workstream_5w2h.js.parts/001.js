(function () {
  "use strict";

  const payload = window.ontoBDCWorkStreamView || {};
  const openButton = document.getElementById("open-container");
  const updateButton = document.getElementById("update-project");
  const statusElement = document.getElementById("container-status");
  const statusDot = document.getElementById("container-status-dot");
  const databaseName = "infobim-container-access";
  const storeName = "handles";
  const handleKey = String(payload.projectId || "active-project");
  let activeContainerHandle = null;
  let activePyodide = null;
  let resourceModel = {
    resources: [],
    catalogResources: [],
    relationships: {},
  };
  let previewObjectUrl = null;
  async function ensureSpatialAnnotations() {
    if (!window.OntoBDCWorkStreamAnnotations) {
      throw new Error(
        "O runtime de anotações do OntoBDC não foi inicializado.",
      );
    }
    return window.OntoBDCWorkStreamAnnotations;
  }

  function setStatus(message, state) {
    statusElement.textContent = state === "is-ready"
      ? "Carregado"
      : state === "is-error"
        ? "Erro: " + message
        : message;
    statusElement.title = message;
    statusDot.classList.remove("is-ready", "is-error");
    if (state) {
      statusDot.classList.add(state);
    }
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function loadStoredHandle() {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).get(handleKey);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function storeHandle(handle) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(handle, handleKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function deleteStoredHandle() {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).delete(handleKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function isContainerHandle(handle) {
    try {
      const metadataDirectory = await handle.getDirectoryHandle(".__ontobdc__");
      await metadataDirectory.getFileHandle("datapackage.json");
      return true;
    } catch (error) {
      if (error && error.name === "NotFoundError") {
        return false;
      }
      throw error;
    }
  }

  async function resolveContainerHandle(selectedHandle) {
    if (await isContainerHandle(selectedHandle)) {
      return selectedHandle;
    }

    const matches = [];
    for await (const entry of selectedHandle.values()) {
      if (entry.kind === "directory" && await isContainerHandle(entry)) {
        matches.push(entry);
      }
    }

    if (matches.length === 1) {
      return matches[0];
    }
    if (matches.length > 1) {
      throw new Error(
        "Esta pasta contém mais de um projeto InfoBIM. Escolha diretamente a pasta do projeto.",
      );
    }

    throw new Error(
      `A pasta “${selectedHandle.name}” não contém um projeto InfoBIM.`,
    );
  }

  async function requestWritableHandle(handle) {
    const permissionOptions = { mode: "readwrite" };
    const currentPermission = await handle.queryPermission(permissionOptions);
    return (
      currentPermission === "granted"
      || await handle.requestPermission(permissionOptions) === "granted"
    );
  }

  async function acquireContainerHandle() {
    let handle = await loadStoredHandle();
    if (handle) {
      if (await requestWritableHandle(handle)) {
        try {
          return await resolveContainerHandle(handle);
        } catch (error) {
          await deleteStoredHandle();
        }
      } else {
        await deleteStoredHandle();
      }
    }

    handle = await window.showDirectoryPicker({
      id: "infobim-project-container",
      mode: "readwrite",
      startIn: "documents",
    });
    const containerHandle = await resolveContainerHandle(handle);
    await storeHandle(handle);
    return containerHandle;
  }

  function normalizeRuntimeText(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\\n/g, "\n")
      .trim();
  }

  function appendInlineFormatting(element, value) {
    const source = String(value || "");
    const pattern = /(\*\*([\s\S]+?)\*\*|__([\s\S]+?)__)/g;
    let cursor = 0;
    let match = pattern.exec(source);
    while (match) {
      if (match.index > cursor) {
        element.appendChild(
          document.createTextNode(source.slice(cursor, match.index)),
        );
      }
      const formatted = document.createElement(match[2] ? "strong" : "em");
      formatted.textContent = match[2] || match[3];
      element.appendChild(formatted);
      cursor = pattern.lastIndex;
      match = pattern.exec(source);
    }
    if (cursor < source.length) {
      element.appendChild(document.createTextNode(source.slice(cursor)));
    }
  }

  function appendFormattedText(element, value) {
    String(value || "").split("\n").forEach((line, index) => {
      if (index > 0) {
        element.appendChild(document.createElement("br"));
      }
      appendInlineFormatting(element, line);
    });
  }

  function splitStructuredList(value) {
    const itemStart = String.raw`(?:\d+\s*(?:[.)]|[-–—])|\*(?!\*)|[-•▪◦●>])\s*`;
    const source = normalizeRuntimeText(value).replace(
      new RegExp(String.raw`\n(?=\s*${itemStart})`, "g"),
      "; ",
    );
    const separator = new RegExp(
      String.raw`;\s*(?=${itemStart})`,
      "g",
    );
    const items = source.split(separator).map((item) => item.trim());
    if (items.some((item) => !item)) {
      return null;
    }

    const numberedMarker = /^\s*(\d+)\s*(?:[.)]|[-–—])\s*/;
    const bulletMarker = /^\s*(?:\*(?!\*)|[-•▪◦●>])\s*/;
    const hasMarker = (item) => (
      numberedMarker.test(item) || bulletMarker.test(item)
    );
    const firstListIndex = items.findIndex(hasMarker);
    if (firstListIndex < 0) {
      return null;
    }
    const preamble = items
      .slice(0, firstListIndex)
      .join("; ")
      .trim();
    const listItems = items.slice(firstListIndex);
    if (listItems.length === 0 || !listItems.every(hasMarker)) {
      return null;
    }

    const numbered = listItems.every((item) => numberedMarker.test(item));
    const firstNumber = numbered
      ? Number(listItems[0].match(numberedMarker)[1])
      : null;
    return {
      ordered: numbered,
      start: firstNumber,
      preamble,
      items: listItems.map((item) =>
        item
          .replace(numberedMarker, "")
          .replace(bulletMarker, "")
          .replace(/;\s*$/, "")
          .trim()
      ),
    };
  }

  function renderStructuredField(element, value) {
    const text = value === null || value === undefined || value === ""
      ? "—"
      : normalizeRuntimeText(value);
    const structuredList = splitStructuredList(text);
    element.replaceChildren();
    if (!structuredList) {
      appendFormattedText(element, text);
      return;
    }

    if (structuredList.preamble) {
      const preamble = document.createElement("span");
      preamble.className = "five-w-two-h-list-preamble";
      appendFormattedText(preamble, structuredList.preamble);
      element.appendChild(preamble);
    }

    const list = document.createElement(
      structuredList.ordered ? "ol" : "ul",
    );
    list.className = "five-w-two-h-runtime-list";
    if (structuredList.ordered && structuredList.start !== 1) {
      list.start = structuredList.start;
    }
    structuredList.items.forEach((itemText) => {
      const item = document.createElement("li");
      appendFormattedText(item, itemText);
      list.appendChild(item);
    });
    element.appendChild(list);
  }

  function renderWorkStream(record) {
    document.getElementById("workstream-name").textContent =
      record.Name || "WorkStream";
    document.getElementById("workstream-description").textContent =
      record.Description || "";

    document.querySelectorAll("[data-field]").forEach((element) => {
      renderStructuredField(element, record[element.dataset.field]);
    });
  }

  function categoryMatches(resource, category) {
    return resource.category === category;
  }

  function resourceIsRelatedToRow(row, resource) {
    if (!row || !resource) {
      return false;
    }
    const dimensionUri =
      `${payload.dimensionBaseUri}/${row.dataset.dimension}`;
    return (resourceModel.relationships[dimensionUri] || [])