(() => {
  const WORK_STREAM_TYPE_NS = "http://datacenter.app.br/ontology/productivity/entity/work_stream/type.ttl#";
  const OBDC_NS = "http://ontobdc.org/ontology/domain/ontobdc/ns.ttl#";
  const DCTERMS_TITLE = "http://purl.org/dc/terms/title";
  const DCTERMS_IDENTIFIER = "http://purl.org/dc/terms/identifier";
  const DCTERMS_DESCRIPTION = "http://purl.org/dc/terms/description";
  const FILE_TYPES = new Set([
    `${OBDC_NS}GenericFile`,
    `${OBDC_NS}ImageFile`,
    `${OBDC_NS}PdfFile`,
    `${OBDC_NS}CsvFile`,
  ]);

  const WORKSTREAM_PAYLOAD = window.infoBimWorkStreamView || null;

  // Live (pyodide-mounted) 5W2H values override the static JSON-LD ones
  // when the user connects the container folder (or clicks refresh).
  // Stored separately from selfNode so the original graph stays untouched
  // (dimension cards' URI construction still relies on selfNode["@id"] etc.)
  let liveWorkbookRecord = null;
  let liveRelationships = null;

  const I18N = JSON.parse(document.getElementById("ontobdc-i18n")?.textContent || "{}");

  function t(key, vars) {
    const locale = document.documentElement.lang || document.documentElement.dataset.language || "en";
    const table = I18N[locale] || I18N.en || {};
    let text = table[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, value);
    }
    return text;
  }

  // Declarative translation for chrome that's static Jinja-rendered markup
  // (header/breadcrumb/buttons) rather than JS-built at runtime — walks
  // `data-i18n`/`data-i18n-title`/`data-i18n-aria-label` once per (re)render.
  function applyStaticI18n() {
    for (const el of document.querySelectorAll("[data-i18n]")) {
      el.textContent = t(el.dataset.i18n);
    }
    for (const el of document.querySelectorAll("[data-i18n-title]")) {
      el.title = t(el.dataset.i18nTitle);
    }
    for (const el of document.querySelectorAll("[data-i18n-aria-label]")) {
      el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel));
    }
  }

  // The seven WorkStreamDimensions (type.ttl :DimensionKind individuals),
  // each with its own Related/Found resource tree — a relate action links
  // a resource to exactly one dimension, never to the WorkStream itself.
  // `slug` matches each DimensionKind's schema:identifier exactly (used to
  // build the dimension's URI via OntoBDCWorkStreamContext.dimensionUri).
  const DIMENSIONS = [
    { key: "what", slug: "what", property: `${WORK_STREAM_TYPE_NS}what` },
    { key: "why", slug: "why", property: `${WORK_STREAM_TYPE_NS}why` },
    { key: "who", slug: "who", property: `${WORK_STREAM_TYPE_NS}who` },
    { key: "where", slug: "where", property: `${WORK_STREAM_TYPE_NS}where` },
    { key: "when", slug: "when", property: `${WORK_STREAM_TYPE_NS}when` },
    { key: "how", slug: "how", property: `${WORK_STREAM_TYPE_NS}how` },
    { key: "howMuch", slug: "how-much", property: `${WORK_STREAM_TYPE_NS}howMuch` },
  ];

  let graphNodes = [];
  let selfNode = null;
  let workStreamContext = null;
  let rawContainerHandle = null;
  let datasetHandle = null;
  let annotationRuntime = null;
  // tryReconnectSilently() (fired from render(), unattended) and
  // connectFolder() (fired from a user click) can both end up mid-flight on
  // the exact same stored handle's permission APIs at once -- a fast click
  // right as the page finishes loading races render()'s own silent
  // reconnect attempt. Serializing them through this promise avoids two
  // concurrent queryPermission()/requestPermission() calls on one handle.
  let pendingReconnectAttempt = null;
  // Each card registers a reload() (re-check relations) and a
  // setConnected()/setDisconnected() callback here, invoked from the
  // shared folder-connection flow below.
  const dimensionCards = [];

  function loadGraph() {
    const script = document.getElementById("ontobdc-page-jsonld");
    if (!script) return [];
    try {
      const parsed = JSON.parse(script.textContent);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }

  // Maps canonical column names (workbook headers / ICDD linkset left-hand
  // side identifiers) onto the property URIs used on this page, so a live
  // workbook record can override a given JSON-LD property. Keys are the
  // exact string names produced by the openpyxl parse script below (header
  // row of the WorkStream worksheet, lowercased on lookup); values are the
  // predicate URIs `literal()` normally reads from selfNode.
  const WORKBOOK_COLUMN_TO_PROPERTY = Object.freeze({
    Name: DCTERMS_TITLE,
    Description: DCTERMS_DESCRIPTION,
    What: `${WORK_STREAM_TYPE_NS}what`,
    Why: `${WORK_STREAM_TYPE_NS}why`,
    Who: `${WORK_STREAM_TYPE_NS}who`,
    Where: `${WORK_STREAM_TYPE_NS}where`,
    When: `${WORK_STREAM_TYPE_NS}when`,
    How: `${WORK_STREAM_TYPE_NS}how`,
    HowMuch: `${WORK_STREAM_TYPE_NS}howMuch`,
    "How much": `${WORK_STREAM_TYPE_NS}howMuch`,
  });

  function _workbookValueForProperty(propertyUri) {
    if (!liveWorkbookRecord || !propertyUri) return null;
    for (const [column, uri] of Object.entries(WORKBOOK_COLUMN_TO_PROPERTY)) {
      if (uri !== propertyUri) continue;
      const raw = liveWorkbookRecord[column] ?? liveWorkbookRecord[column.toLowerCase()];
      if (raw === null || raw === undefined) continue;
      const text = String(raw).trim();
      if (text !== "") return text;
    }
    return null;
  }

  function literal(node, property, lang) {
    const live = (node === selfNode || (node && node["@id"] === selfNode?.["@id"]))
      ? _workbookValueForProperty(property)
      : null;
    if (live !== null) return live;
    const values = node?.[property];
    if (!Array.isArray(values) || values.length === 0) return "";
    const localized = lang ? values.find((value) => value["@language"] === lang) : null;
    const picked = localized || values[0];
    return String(picked["@value"] ?? picked["@id"] ?? "").trim();
  }

  function nodeTypes(node) {
    const raw = node?.["@type"];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") return [raw];
    return [];
  }

  function isViewArtifact(filePath) {
    return typeof filePath === "string" && filePath.startsWith(".__ontobdc__/view/");
  }

  function resourceNodes() {
    return graphNodes.filter((node) => {
      const types = nodeTypes(node);
      if (!types.some((type) => FILE_TYPES.has(type))) return false;
      const filePath = literal(node, `${OBDC_NS}filePath`);
      return !isViewArtifact(filePath);
    });
  }

  function resourceLabel(node) {
    return literal(node, DCTERMS_TITLE) || literal(node, `${OBDC_NS}filePath`) || node["@id"];
  }

  function resourceMimeKind(node) {
    const types = nodeTypes(node);
    if (types.includes(`${OBDC_NS}ImageFile`)) return "image";
    if (types.includes(`${OBDC_NS}PdfFile`)) return "pdf";
    if (types.includes(`${OBDC_NS}CsvFile`)) return "csv";
    return "generic";
  }

  // Minimal RFC4180-ish parser: handles quoted fields, escaped "" and commas
  // inside quotes. Ported from onto-csv-file-tile.js's #parseCsv
  // (component/asset/, the main Surface's CSV Tile) — this page's <script>
  // is loaded as a plain non-module tag and there is no shared-module
  // mechanism between page/asset/*.js and component/asset/*.js, so this is
  // a deliberate second copy rather than an import.
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (inQuotes) {
        if (char === '"' && text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      } else {
        field += char;
      }
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
  }

  function renderCsvTable(rows) {
    const wrap = document.createElement("div");
    wrap.className = "csv-table-wrap";

    const scroll = document.createElement("div");
    scroll.className = "csv-table-scroll";
    const [header, ...body] = rows;
    const table = document.createElement("table");
    table.className = "csv-table";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const cell of header) {
      const th = document.createElement("th");
      th.textContent = cell;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const cells of body) {
      const tr = document.createElement("tr");
      for (const cell of cells) {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    scroll.appendChild(table);
    wrap.appendChild(scroll);

    const count = document.createElement("div");
    count.className = "csv-table-count";
    count.textContent = body.length === 1 ? t("row", { count: body.length }) : t("rows", { count: body.length });
    wrap.appendChild(count);

    return wrap;
  }

  function renderCsvFallback(href) {
    const fallback = document.createElement("div");
    fallback.className = "csv-fallback";
    const message = document.createElement("span");
    message.textContent = t("previewUnavailable");
    const link = document.createElement("a");
    link.className = "resource-open-link";
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = t("openFile");
    link.addEventListener("click", (event) => event.stopPropagation());
    fallback.append(message, link);
    return fallback;
  }

  function renderHeader() {
    const lang = (document.documentElement.lang || "en").toLowerCase();
    const resourceId = document.querySelector(".onto-page")?.getAttribute("data-ontobdc-resource") || "";

    const identifier = selfNode
      ? literal(selfNode, DCTERMS_IDENTIFIER) || selfNode["@id"] || resourceId
      : resourceId;
    const name = selfNode
      ? literal(selfNode, DCTERMS_TITLE, lang) || literal(selfNode, DCTERMS_TITLE)
      : "";

    document.title = name || identifier || document.title;
    document.querySelector(".name").textContent = name || identifier || t("breadcrumbWorkStream");
    document.querySelector(".identifier").textContent = identifier;

    const description = literal(selfNode, DCTERMS_DESCRIPTION);
    const fieldsContainer = document.querySelector(".fields");
    fieldsContainer.innerHTML = "";
    if (description) {
      const row = document.createElement("div");
      row.className = "field";
      const labelEl = document.createElement("div");
      labelEl.className = "field-label";
      labelEl.textContent = t("description");
      const valueEl = document.createElement("div");
      valueEl.className = "field-value";
      valueEl.textContent = description;
      row.append(labelEl, valueEl);
      fieldsContainer.appendChild(row);
    }

    return identifier;
  }

  // --- Folder connection (File System Access API + IndexedDB persistence) ---

  const HANDLE_DB_NAME = "ontobdc-workstream-view";
  const HANDLE_STORE_NAME = "handles";
  const HANDLE_KEY = "containerHandle";
  const HANDLE_PICKER_ID = "infobim-project-container";

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
        t("multipleDatasetsSelectedFolder"),
      );
    }

    throw new Error(t("noDatasetSelectedFolder"));
  }

  function openHandleDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(HANDLE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(HANDLE_STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function storeHandle(handle) {
    const db = await openHandleDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE_NAME, "readwrite");
      tx.objectStore(HANDLE_STORE_NAME).put(handle, HANDLE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function loadStoredHandle() {
    try {
      const db = await openHandleDb();
      const handle = await new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE_NAME, "readonly");
        const request = tx.objectStore(HANDLE_STORE_NAME).get(HANDLE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return handle;
    } catch {
      return null;
    }
  }

  async function deleteStoredHandle() {
    try {
      const db = await openHandleDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE_NAME, "readwrite");
        tx.objectStore(HANDLE_STORE_NAME).delete(HANDLE_KEY);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch (error) {
      console.warn("Failed to delete stored folder handle:", error);
    }
  }

  async function requestWritableHandle(handle) {
    const permissionOptions = { mode: "readwrite" };
    const currentPermission = await handle.queryPermission(permissionOptions);
    return (
      currentPermission === "granted"
      || await handle.requestPermission(permissionOptions) === "granted"
    );
  }

  // Exact 1:1 copy of techcenter-doc/workstream_5w2h.js acquireContainerHandle
  // (lines 182-204 in the reference).
  //
  // Tries the stored handle first: if it still works (permission re-granted
  // via the lightweight "Allow folder access?" prompt and
  // resolveContainerHandle still matches a dataset), return the resolved
  // handle silently, NO directory picker navigation needed. Otherwise it
  // deletes the stale stored handle and falls through to the native
  // showDirectoryPicker() dialog, pre-wired to the "documents" startIn
  // bucket and with a persistent picker-id so the OS remembers this
  // container's last picked location on every subsequent visit.
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
      id: HANDLE_PICKER_ID,
      mode: "readwrite",
      startIn: "documents",
    });
    const containerHandle = await resolveContainerHandle(handle);
    await storeHandle(handle);
    return containerHandle;
  }

  // 1:1 copy of techcenter-doc/workstream_5w2h.js openContainer()
  // (lines 1713-2043 reference). Atomic single-function flow — no splitting
  // across four half-functions. Every intermediate failure lands in the same
  // catch/finally so the button never ends up disabled with fake state.
  async function openContainer() {
    const button = document.querySelector(".connect-btn");
    const refreshBtn = document.querySelector(".refresh-btn");
    button.disabled = true;
    button.textContent = t("requestingAccess");

    try {
      if (typeof window.showDirectoryPicker !== "function") {
        throw new Error(
          t("browserFileSystemAccessUnavailable")
        );
      }
      if (!WORKSTREAM_PAYLOAD) {
        throw new Error(t("noWorkStreamContext"));
      }

      // Step 1 — Handle acquisition + resolution.
      // acquireContainerHandle already:
      //   * tries the stored handle (lightweight permission prompt)
      //   * falls back to showDirectoryPicker with picker-id
      //   * resolves the selected handle before returning
      const resolvedDatasetHandle = await acquireContainerHandle();
      rawContainerHandle = resolvedDatasetHandle;
      datasetHandle = resolvedDatasetHandle;

      // Step 2 — Pyodide + mount + parse. Uses our ensurePyodide wrapper so
      // we don't re-download rdflib/openpyxl on every click.
      const pyodide = await ensurePyodide({ withOpenpyxl: true });
      if (activeMountPath) {
        try {
          pyodide.FS.unmount(activeMountPath);
        } catch {
        }
        activeMountPath = null;
      }
      const mountPath = `/container_${Date.now()}`;
      pyodide.FS.mkdirTree(mountPath);
      await pyodide.mountNativeFS(mountPath, resolvedDatasetHandle);
      activeMountPath = mountPath;
      try {
        pyodide.registerJsModule("ontobdc_trace", {
          log: (msg) => {
            console.log("[ontobdc-pyodide]", String(msg));
          },
        });
      } catch {
        // already registered from a previous openContainer() call
      }
      pyodide.FS.syncfs(true, (err) => {
        if (err) {
          console.warn("[ontobdc-pyodide] syncfs init warning:", err);
        }
      });

      pyodide.globals.set("view_payload_json", JSON.stringify(WORKSTREAM_PAYLOAD));
      pyodide.globals.set("container_mount_path", mountPath);
      const resultProxy = await pyodide.runPythonAsync(WORKBOOK_PARSE_SCRIPT);
      const result = JSON.parse(String(resultProxy));
      if (resultProxy && typeof resultProxy.destroy === "function") {
        try {
          resultProxy.destroy();
        } catch {
          // no-op
        }
      }

      // Step 3 — Apply live data + wire UI.
      applyLiveWorkbookResult(result);
      setConnected(resolvedDatasetHandle, resolvedDatasetHandle);

      if (refreshBtn && WORKSTREAM_PAYLOAD) {
        refreshBtn.disabled = false;
        refreshBtn.hidden = false;
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      const userMessage = message.includes("datapackage.json")
        ? t("datapackageJsonNotFound")
        : message;
      setConnectError(userMessage, t("connectFolder"));
    } finally {
      button.disabled = false;
      if (!rawContainerHandle) {
        button.textContent = t("connectFolder");
      }
      if (refreshBtn) {
        refreshBtn.disabled = !rawContainerHandle;
        if (rawContainerHandle && !refreshBtn.textContent) {
          refreshBtn.textContent = t("refreshFromWorkbook");
        }
      }
    }
  }

  function setConnected(rawHandle, resolvedDatasetHandle) {
    rawContainerHandle = rawHandle;
    datasetHandle = resolvedDatasetHandle ?? rawHandle;
    document.querySelector(".connect-btn").textContent = t("reconnectFolder");
    document.querySelector(".connect-btn").disabled = false;
    document.querySelector(".workspace-btn").disabled = false;
    document.querySelector(".subjects-btn").disabled = false;
    const refreshBtn = document.querySelector(".refresh-btn");
    if (refreshBtn && WORKSTREAM_PAYLOAD) {
      refreshBtn.disabled = false;
      refreshBtn.hidden = false;
    }
  }

  function setConnectError(message, fallbackLabel) {
    const button = document.querySelector(".connect-btn");
    button.textContent = message;
    button.disabled = false;
    setTimeout(() => {
      if (!rawContainerHandle) button.textContent = fallbackLabel;
    }, 4000);
  }

  async function tryReconnectSilentlyImpl() {
    // Fire-and-forget silent reconnect kicked off by render() on load.
    // NEVER falls through to showDirectoryPicker() (that API requires a
    // real user gesture and would throw on an unattended onload). It only
    // proceeds if:
    //   (1) there is a stored handle already in IndexedDB, AND
    //   (2) queryPermission("readwrite") already === "granted" this
    //       session (no "Allow access?" prompt needed).
    // If both conditions hold, acquireContainerHandle → openContainer()
    // takes the fast "stored handle" path and never touches the picker.
    // If ANYTHING fails, the botton falls back to the "connectFolder"
    // label — no fake connected state is ever painted.
    const handle = await loadStoredHandle();
    if (!handle) return;
    try {
      const permission = await handle.queryPermission({ mode: "readwrite" });
      if (permission !== "granted") {
        document.querySelector(".connect-btn").textContent = t("allowFolderAccess");
        return;
      }
      await openContainer();
    } catch (error) {
      console.warn("Silent reconnect failed, user will have to click manually:", error);
      // Explicitly NOT fake-setting the button as connected. On any
      // failure the label says "Conectar pasta" and user clicks themselves.
      document.querySelector(".connect-btn").textContent = t("connectFolder");
    }
  }

  // Registers the attempt in pendingReconnectAttempt for its whole
  // duration (including setConnected(), not just the permission check) so
  // concurrent openContainer() clicks can wait it out instead of racing it
  // on the same handle's permission APIs.
  function tryReconnectSilently() {
    const attempt = tryReconnectSilentlyImpl().finally(() => {
      if (pendingReconnectAttempt === attempt) pendingReconnectAttempt = null;
    });
    pendingReconnectAttempt = attempt;
    return attempt;
  }

  // --- Annotation runtime wiring ---

  // The WorkStream's own URI is
  // "urn:ontobdc:storage/dataset/<container>/<dataset-folder>/<instance-id>"
  // (see context/plugin/command/entity.py's dataset-per-instance URIs) —
  // the dataset folder name is always the second-to-last path segment.
  // Used to store annotations *inside* that dataset's own payload, instead
  // of a container-wide bucket unrelated to any dataset.
  function datasetFolderName(entityId) {
    const segments = String(entityId || "").split("/").filter(Boolean);
    return segments.length >= 2 ? segments[segments.length - 2] : null;
  }

  function ensureAnnotationRuntime() {
    if (annotationRuntime || typeof OntoBDCAnnotations === "undefined") return annotationRuntime;
    const folder = selfNode ? datasetFolderName(selfNode["@id"]) : null;
    annotationRuntime = OntoBDCAnnotations.createRuntime({
      normalizeContext: (raw) => raw,
      visual: { contract: OntoBDCAnnotationVisualContract },
      store: folder
        ? { metadataDirectory: folder, datasetDirectory: "payload/triple" }
        : undefined,
    });
    return annotationRuntime;
  }

  function openDialog(title) {
    const dialog = document.createElement("dialog");
    dialog.className = "onto-annotation-dialog";
    const header = document.createElement("div");
    header.className = "onto-annotation-dialog-header";
    const heading = document.createElement("strong");
    heading.textContent = title;
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "icon-btn";
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => dialog.close());
    header.append(heading, closeButton);
    const body = document.createElement("div");
    body.className = "onto-annotation-dialog-body";
    dialog.append(header, body);
    document.body.appendChild(dialog);
    dialog.addEventListener("close", () => dialog.remove());
    dialog.showModal();
    return body;
  }

  async function openWorkspace() {
    const runtime = ensureAnnotationRuntime();
    if (!runtime || !datasetHandle) return;
    const body = openDialog(t("annotations"));
    await runtime.openWorkspace(body, { containerHandle: datasetHandle });
  }

  async function openSubjectPage() {
    const runtime = ensureAnnotationRuntime();
    if (!runtime || !datasetHandle) return;
    const body = openDialog(t("subjects"));
    await runtime.openSubjectPage(body, { containerHandle: datasetHandle }, null);
  }

  async function resolveFile(filePath) {
    const segments = filePath.split("/").filter(Boolean);
    let directory = datasetHandle;
    for (const segment of segments.slice(0, -1)) {
      directory = await directory.getDirectoryHandle(segment);
    }
    const fileHandle = await directory.getFileHandle(segments[segments.length - 1]);
    return fileHandle.getFile();
  }

  async function annotateResource(node, dimensionUri, button) {
    const runtime = ensureAnnotationRuntime();
    if (!runtime || !datasetHandle || !node) return;
    const filePath = literal(node, `${OBDC_NS}filePath`);
    if (!filePath) return;
    const originalTitle = button.title;
    button.disabled = true;
    button.title = t("opening");
    try {
      const file = await resolveFile(filePath);
      await runtime.open({
        containerHandle: datasetHandle,
        file,
        mediaType: file.type,
        logicalSource: node["@id"],
        representationSource: node["@id"],
        representationName: resourceLabel(node),
        dimension: dimensionUri,
      });
      button.disabled = false;
      button.title = originalTitle;
    } catch (error) {
      console.error(error);
      button.title = (error && error.message) || String(error);
      window.alert(`Could not open the annotation editor: ${(error && error.message) || error}`);
      setTimeout(() => {
        button.disabled = !datasetHandle;
        button.title = originalTitle;
      }, 3000);
    }
  }

  function wireAnnotationControls() {
    document.querySelector(".connect-btn").addEventListener("click", openContainer);
    document.querySelector(".workspace-btn").addEventListener("click", openWorkspace);
    document.querySelector(".subjects-btn").addEventListener("click", openSubjectPage);
    const refreshBtn = document.querySelector(".refresh-btn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", refreshFromWorkbook);
      if (!WORKSTREAM_PAYLOAD) refreshBtn.hidden = true;
    }
  }

  // --- Linkset editing (pyodide + rdflib, loaded lazily on first use) ---
  //
  // Generalized from InfoBIM's WorkStream<->resource linkset: same ISO
  // 21597 (DirectedBinaryLink) shape, but with an OntoBDC URN scheme
  // instead of `urn:infobim:...`, and no dependency on openpyxl/workbook
  // parsing — 5W2H data is already resolved server-side, pyodide here only
  // ever reads/writes the dimension<->resource linksets themselves. A link
  // binds a *dimension* URI (not the WorkStream itself) to a resource URI.
  // Two independent linkset files exist under .__ontobdc__/linkset/:
  //   * WorkStreamResource.ttl  — "Related" (curated, confirmed relations;
  //                                no lifecycle — a link exists or not)
  //   * WorkStreamSuggested.ttl — "Suggested" (candidates with a lifecycle
  //                                state: Proposed -> Rejected. Rejected
  //                                links are kept for audit but are never
  //                                surfaced on the Suggested tab).
  // Both share the ISO 21597 DirectedBinaryLink structure and are loaded
  // from a version-pinned CDN on first need — the rest of the page works
  // fully offline without it.

  const PYODIDE_CDN_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js";

  const LINKSET_FILES = Object.freeze({
    related: "WorkStreamResource.ttl",
    suggested: "WorkStreamSuggested.ttl",
  });

  const LINKSET_NS_PREFIXES = Object.freeze({
    related: "urn:ontobdc:linkset:workstream-resource",
    suggested: "urn:ontobdc:linkset:workstream-suggested",
  });

  const SUGGESTION_STATUS_NS = "http://ontobdc.org/ontology/domain/ontobdc/ns.ttl#";

  const SUGGESTION_STATUS = Object.freeze({
    PROPOSED: `${SUGGESTION_STATUS_NS}Proposed`,
    REJECTED: `${SUGGESTION_STATUS_NS}Rejected`,
  });

  const SUGGESTION_STATUS_PREDICATE = `${SUGGESTION_STATUS_NS}suggestionStatus`;
  const SUGGESTION_MODIFIED_AT_PREDICATE = `${SUGGESTION_STATUS_NS}suggestionModifiedAt`;

  const LINKSET_ACTIONS = Object.freeze({
    related: { add: "relate", remove: "unrelate" },
    suggested: { add: "suggest", remove: "unsuggest" },
  });

  let pyodideInstance = null;
  let pyodideLoadPromise = null;
  let pyodideHasOpenpyxl = false;

  function loadScriptTag(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  async function ensurePyodide(options) {
    const withOpenpyxl = Boolean(options && options.withOpenpyxl);
    if (pyodideInstance && (!withOpenpyxl || pyodideHasOpenpyxl)) {
      return pyodideInstance;
    }
    if (!pyodideLoadPromise) {
      pyodideLoadPromise = (async () => {
        if (typeof loadPyodide !== "function") {
          await loadScriptTag(PYODIDE_CDN_URL);
        }
        const instance = await loadPyodide();
        await instance.loadPackage("micropip");
        await instance.runPythonAsync("import micropip\nawait micropip.install('rdflib')");
        return instance;
      })();
    }
    try {
      pyodideInstance = await pyodideLoadPromise;
    } catch (error) {
      pyodideLoadPromise = null;
      throw error;
    }
    if (withOpenpyxl && !pyodideHasOpenpyxl) {
      await pyodideInstance.runPythonAsync("import micropip\nawait micropip.install('openpyxl')");
      pyodideHasOpenpyxl = true;
    }
    return pyodideInstance;
  }

  // Matches the canonical reference runtime (techcenter-doc workstream_5w2h.js
  // openContainer() Python block). Reads the dataset's `datapackage.json`,
  // locates the "work_stream" resource Excel file, parses the worksheet with
  // openpyxl, finds the row whose GlobalId matches the current elementId,
  // then re-parses the WorkStream.ttl ICDD linkset (column ↔ property URI
  // mapping) and the WorkStreamResource.ttl dimension ↔ resource relation
  // linkset, plus the RO-Crate manifest for file display categories. Returns
  // exactly the same shape as the reference runtime so callers downstream
  // don't have to branch.
  const WORKBOOK_PARSE_SCRIPT = `
import json
from pathlib import Path
from urllib.parse import unquote

from openpyxl import load_workbook
from rdflib import Graph, Literal, Namespace, URIRef
from rdflib.namespace import RDF

try:
    import ontobdc_trace as _trace
    _trace_p = lambda msg: _trace.log(str(msg))
except Exception:
    _trace_p = lambda msg: None

try:
    import pyodide_js as _pjs
    def _resync(label: str) -> None:
        try:
            _pjs.FS.syncfs(True, lambda _err=None: None)
        except Exception as sync_err:
            _trace_p("SYNC_FAIL_" + label + ":" + str(sync_err)[:200])
except Exception:
    def _resync(label: str) -> None:
        return

def _resolve_candidates(payload_key: str, *extra_candidates):
    raw = payload.get(payload_key) or ""
    candidates = []
    if raw:
        candidates.append(container / raw)
    for entry in extra_candidates:
        if isinstance(entry, str):
            candidate_path = container / entry
        else:
            candidate_path = Path(entry)
        if not any(str(c) == str(candidate_path) for c in candidates):
            candidates.append(candidate_path)
    chosen = None
    for candidate in candidates:
        try:
            exists_p = candidate.exists()
        except Exception:
            exists_p = False
        _trace_p("CANDIDATE_" + payload_key + "=" + str(candidate) + " EX=" + str(exists_p))
        if exists_p and chosen is None:
            chosen = candidate
    if chosen is None and candidates:
        chosen = candidates[0]
    return chosen

payload = json.loads(view_payload_json)
container = Path(container_mount_path)
_trace_p("CONTAINER=" + str(container) + " EX=" + str(container.exists()))

_resync("pre_datapackage")
datapackage_candidates = [
    payload.get("datapackagePath") or "",
    ".__ontobdc__/datapackage.json",
    "__ontobdc__/datapackage.json",
    "datapackage.json",
]
_dp_seen = set()
_dp_ordered = []
for _c in datapackage_candidates:
    _norm = str(container / _c) if _c and not str(_c).startswith(str(container)) else str(_c)
    if not _c or _norm in _dp_seen:
        continue
    _dp_seen.add(_norm)
    _dp_ordered.append(_c)
datapackage_path = _resolve_candidates("datapackagePath", *_dp_ordered)
_resync("datapackage_read")
_trace_p("TRY_datapackage_path=" + str(datapackage_path) + " EX=" + str(datapackage_path.exists()))
datapackage_raw = datapackage_path.read_text(encoding="utf-8")
datapackage = json.loads(datapackage_raw)
_trace_p(
    "DATAPACKAGE_RESOURCES_PREVIEW="
    + json.dumps(datapackage.get("resources", []), ensure_ascii=False)[:1000]
)
resource = next(
    (item for item in datapackage.get("resources", []) if item.get("name") == "work_stream"),
    None,
)
if not resource:
    raise ValueError(
        "datapackage.json does not contain a resource named \"work_stream\".\n"
        + "datapackage_path=" + str(datapackage_path) + "\n"
        + "container_root_children="
        + json.dumps(
            [p.name for p in container.iterdir()][:50],
            ensure_ascii=False,
        )[:800]
        + "\n"
        + "resources="
        + json.dumps(datapackage.get("resources", []), ensure_ascii=False)[:1200]
    )
workbook_path = (datapackage_path.parent / resource["path"]).resolve()
_trace_p("WORKBOOK_PATH=" + str(workbook_path) + " EX=" + str(workbook_path.exists()))
worksheet_name = (
    resource.get("dialect", {})
    .get("excel", {})
    .get("sheet", "WorkStream")
)

entity_id = resource.get("entityIdentifier") or "work_stream"
linkset_dir = datapackage_path.parent / "linkset"
facade_candidates = [
    payload.get("linksetPath") or "",
    f".__ontobdc__/linkset/WorkStream.ttl",
    f"{linkset_dir.name}/{entity_id}_linkset.ttl",
    f"{linkset_dir.name}/WorkStream.ttl",
    f"{linkset_dir.name}/facade.ttl",
]
# Dedupe while preserving order
_facade_seen = set()
_facade_ordered = []
for _c in facade_candidates:
    _norm = str(container / _c) if _c and not str(_c).startswith(str(container)) else str(_c)
    if not _c or _norm in _facade_seen:
        continue
    _facade_seen.add(_norm)
    _facade_ordered.append(_c)
linkset_path = _resolve_candidates("linksetPath", *_facade_ordered)

resource_candidates = [
    payload.get("resourceLinksetPath") or "",
    ".__ontobdc__/linkset/WorkStreamResource.ttl",
    f"{linkset_dir.name}/WorkStreamResource.ttl",
    f"{linkset_dir.name}/resource_linkset.ttl",
]
_resource_seen = set()
_resource_ordered = []
for _c in resource_candidates:
    _norm = str(container / _c) if _c and not str(_c).startswith(str(container)) else str(_c)
    if not _c or _norm in _resource_seen:
        continue
    _resource_seen.add(_norm)
    _resource_ordered.append(_c)
resource_linkset_path = _resolve_candidates("resourceLinksetPath", *_resource_ordered)

# RO-Crate: dataset level first; if absent, container level (dataset folder's
# sibling .__ontobdc__) because many generated containers ship a single shared
# ro-crate-metadata.json at the container root, not duplicated per dataset.
ro_crate_candidates = [
    payload.get("roCratePath") or "",
    ".__ontobdc__/ro-crate-metadata.json",
]
parent_meta = (container.parent / ".__ontobdc__" / "ro-crate-metadata.json")
try:
    if parent_meta.exists():
        ro_crate_candidates.append(str(parent_meta))
except Exception:
    pass
ro_crate_path = _resolve_candidates("roCratePath", *ro_crate_candidates)

# File display ontology: dataset level first, then the shared container-level
# asset path. The UI's own FILE_DISPLAY_PARSE_SCRIPT also has candidate paths
# file.ttl / file_display.ttl, so we keep the same convention here.
file_display_candidates = [
    payload.get("fileDisplayOntologyPath") or "",
    ".__ontobdc__/ontology/file_display.ttl",
    ".__ontobdc__/ontology/file.ttl",
]
file_parent_candidates = [
    container.parent / ".__ontobdc__" / "ontology" / "file_display.ttl",
    container.parent / ".__ontobdc__" / "asset" / "infobim-view" / "ontology" / "file_display.ttl",
    container.parent / ".__ontobdc__" / "ontology" / "file.ttl",
    container.parent / ".__ontobdc__" / "asset" / "infobim-view" / "ontology" / "file.ttl",
]
for _c in file_parent_candidates:
    try:
        if _c.exists():
            file_display_candidates.append(str(_c))
    except Exception:
        pass
file_display_ontology_path = _resolve_candidates("fileDisplayOntologyPath", *file_display_candidates)

dataset_prefix = str(payload.get("datasetPath") or "").strip("/")

LS = Namespace("https://standards.iso.org/iso/21597/-1/ed-1/en/Linkset#")
SCHEMA = Namespace("http://schema.org/")
linkset = Graph()
mappings = {}
_resync("linkset")
_trace_p("USING_linkset_path=" + str(linkset_path) + " EX=" + str(linkset_path.exists() if linkset_path is not None else "none"))
icdd_mode = False
if linkset_path is not None and linkset_path.exists():
    linkset.parse(linkset_path, format="turtle")
    icdd_links = list(linkset.subjects(RDF.type, LS.DirectedBinaryLink))
    _trace_p("ICDD_links=" + str(len(icdd_links)))
    if icdd_links:
        icdd_mode = True
        for link in icdd_links:
            from_element = linkset.value(link, LS.hasFromLinkElement)
            to_element = linkset.value(link, LS.hasToLinkElement)
            from_identifier = linkset.value(from_element, LS.hasIdentifier)
            to_identifier = linkset.value(to_element, LS.hasIdentifier)
            column = linkset.value(from_identifier, LS.identifier)
            facade_field = linkset.value(to_identifier, LS.uri)
            if isinstance(column, Literal) and facade_field is not None:
                mappings[str(column)] = str(facade_field)
if not icdd_mode and linkset_path is not None and linkset_path.exists():
    # No ICDD DirectedBinaryLink found. This dataset ships a facade.ttl
    # (schema:identifier based FacadeField registry) instead. Derive the
    # same column->uri mappings from those so downstream callers get an
    # identical mappings dict shape either way.
    FACADE = Namespace(str(linkset.identifier) + "#") if linkset.identifier else None
    facade_field_type = URIRef("http://datacenter.app.br/ontology/productivity/entity/work_stream/facade.ttl#FacadeField")
    for field in linkset.subjects(RDF.type, facade_field_type):
        label_bearer = linkset.value(field, SCHEMA.identifier)
        maps_to = linkset.value(field, URIRef("http://datacenter.app.br/ontology/productivity/entity/work_stream/facade.ttl#mapsToProperty"))
        if label_bearer is not None and maps_to is not None:
            mappings[str(label_bearer)] = str(maps_to)
    _trace_p("FACADE_mappings_count=" + str(len(mappings)))

_resync("workbook")
workbook = load_workbook(workbook_path, data_only=True, read_only=True)
worksheet = workbook[worksheet_name]
headers = [str(cell.value or "").strip() for cell in worksheet[1]]
record = None
for values in worksheet.iter_rows(min_row=2, values_only=True):
    candidate = dict(zip(headers, values))
    if str(candidate.get("GlobalId") or "").strip() == payload["elementId"]:
        record = candidate
        break
workbook.close()

if record is None:
    raise ValueError(
        f"WorkStream not found in workbook: {payload['elementId']}"
    )
# Only enforce ICDD-linkset header coverage when the container actually
# shipped an ICDD DirectedBinaryLink linkset. Facade.ttl-only containers
# (and techcenter-doc style legacy containers where mappings is empty by
# design) proceed with header -> WORKBOOK_COLUMN_TO_PROPERTY resolution.
if icdd_mode and mappings and any(field not in mappings for field in headers):
    missing = sorted(field for field in headers if field not in mappings)
    raise ValueError(
        "The ICDD linkset does not map workbook fields: " + ", ".join(missing)
    )

def values(item, key):
    value = item.get(key)
    if value is None:
        return []
    return value if isinstance(value, list) else [value]

def text_values(item, *keys):
    result = []
    for key in keys:
        for value in values(item, key):
            if isinstance(value, dict):
                value = value.get("@id") or value.get("@value")
            if value is not None:
                result.append(str(value))
    return result

FILE_DISPLAY = Namespace(
    "https://w3id.org/ontobdc/ontology/file-display#"
)
file_display_graph = Graph()
_resync("file_display")
_trace_p("USING_file_display_ontology=" + str(file_display_ontology_path) + " EX=" + str(file_display_ontology_path.exists() if file_display_ontology_path is not None else "none"))
if file_display_ontology_path is not None and file_display_ontology_path.exists():
    file_display_graph.parse(file_display_ontology_path, format="turtle")
display_profiles = []
for profile in file_display_graph.subjects(
    RDF.type,
    FILE_DISPLAY.FileDisplayProfile,
):
    category = file_display_graph.value(
        profile,
        FILE_DISPLAY.displayCategory,
    )
    if category is None:
        continue
    display_profiles.append({
        "category": str(category),
        "requiredSemanticTypes": {
            str(value).strip()
            for value in file_display_graph.objects(
                profile,
                FILE_DISPLAY.requiredSemanticType,
            )
            if str(value).strip()
        },
        "mimeTypes": {
            str(value).strip().lower()
            for value in file_display_graph.objects(
                profile,
                FILE_DISPLAY.acceptedMimeType,
            )
            if str(value).strip()
        },
        "extensions": {
            str(value).strip().lower()
            for value in file_display_graph.objects(
                profile,
                FILE_DISPLAY.acceptedExtension,
            )
            if str(value).strip()
        },
    })

def category_for(item, resource_id):
    formats = {
        value.strip().lower()
        for value in text_values(item, "encodingFormat")
        if value.strip()
    }
    semantic_types = {
        value.strip()
        for value in text_values(item, "@type", "additionalType")
        if value.strip()
    }
    extension = Path(unquote(resource_id)).suffix.lower()

    def semantic_name(value):
        return value.rsplit("#", 1)[-1].rsplit("/", 1)[-1]

    semantic_names = {semantic_name(value) for value in semantic_types}
    for profile in display_profiles:
        required_types = profile["requiredSemanticTypes"]
        required_names = {semantic_name(value) for value in required_types}
        if required_types and not (
            semantic_types.intersection(required_types)
            or semantic_names.intersection(required_names)
        ):
            continue
        if (
            formats.intersection(profile["mimeTypes"])
            or extension in profile["extensions"]
        ):
            return profile["category"]
    return None

_resync("ro_crate")
_trace_p("USING_ro_crate_path=" + str(ro_crate_path) + " EX=" + str(ro_crate_path.exists() if ro_crate_path is not None else "none"))
try:
    if ro_crate_path is None or not ro_crate_path.exists():
        ro_crate = {"@graph": []}
    else:
        ro_crate_text = ro_crate_path.read_text(encoding="utf-8").strip()
        ro_crate = json.loads(ro_crate_text) if ro_crate_text else {"@graph": []}
except FileNotFoundError:
    ro_crate = {"@graph": []}

catalog_resources = []
resources = []
for item in ro_crate.get("@graph", []):
    source_resource_id = item.get("@id")
    types = set(text_values(item, "@type"))
    if not source_resource_id or source_resource_id in (".", "./"):
        continue
    is_external_resource = (
        "://" in source_resource_id
        or source_resource_id.startswith("urn:")
    )
    resource_id = (
        source_resource_id
        if is_external_resource or not dataset_prefix
        else f"{dataset_prefix}/{source_resource_id.lstrip('./')}"
    )
    if not types.intersection({
        "File", "MediaObject", "DigitalDocument",
        "CreativeWork", "Message", "EmailMessage",
    }):
        continue
    names = text_values(item, "name")
    formats = text_values(item, "encodingFormat")
    category = category_for(item, source_resource_id)
    display_parts = [
        unquote(part)
        for part in resource_id.split("/")
        if part
    ]
    catalog_resource = {
        "id": resource_id,
        "sourceId": source_resource_id,
        "name": (
            unquote(names[0])
            if names
            else unquote(Path(resource_id).name)
        ),
        "displayParts": display_parts,
        "encodingFormat": formats[0] if formats else "",
    }
    catalog_resources.append(catalog_resource)
    if category is not None:
        resources.append({
            **catalog_resource,
            "category": category,
        })

relationships = {}
_resync("resource_linkset")
_trace_p("USING_resource_linkset=" + str(resource_linkset_path) + " EX=" + str(resource_linkset_path.exists() if resource_linkset_path is not None else "none"))
if resource_linkset_path is not None and resource_linkset_path.exists():
    resource_linkset = Graph()
    resource_linkset.parse(resource_linkset_path, format="turtle")
    resource_id_by_endpoint = {
        key: item["id"]
        for item in resources
        for key in (item["id"], item["sourceId"])
    }

    def endpoint_value(element):
        identifier = resource_linkset.value(element, LS.hasIdentifier)
        return (
            resource_linkset.value(identifier, LS.uri)
            or resource_linkset.value(identifier, LS.identifier)
        )

    for link in resource_linkset.subjects(RDF.type, LS.DirectedBinaryLink):
        endpoints = [
            endpoint_value(resource_linkset.value(link, LS.hasFromLinkElement)),
            endpoint_value(resource_linkset.value(link, LS.hasToLinkElement)),
        ]
        endpoint_strings = [str(value) for value in endpoints if value is not None]
        dimension_uri = next(
            (
                value for value in endpoint_strings
                if value.startswith(payload["dimensionBaseUri"] + "/")
            ),
            None,
        )
        resource_id = next(
            (
                resource_id_by_endpoint[value]
                for value in endpoint_strings
                if value in resource_id_by_endpoint
            ),
            None,
        )
        if dimension_uri and resource_id:
            relationships.setdefault(dimension_uri, []).append(resource_id)

json.dumps(
    {
        "record": record,
        "mappings": mappings,
        "resources": resources,
        "catalogResources": catalog_resources,
        "relationships": relationships,
        "workbookPath": str(workbook_path),
        "linksetPath": str(linkset_path),
    },
    ensure_ascii=False,
)
`;

  let activeMountPath = null;

  async function openContainerFromHandle(handle) {
    if (!WORKSTREAM_PAYLOAD) {
      throw new Error("No WorkStream context payload present on this page.");
    }
    const resolved = await resolveContainerHandle(handle);
    const pyodide = await ensurePyodide({ withOpenpyxl: true });
    if (activeMountPath) {
      try {
        pyodide.FS.unmount(activeMountPath);
      } catch {
      }
      activeMountPath = null;
    }
    const mountPath = `/container_${Date.now()}`;
    pyodide.FS.mkdirTree(mountPath);
    await pyodide.mountNativeFS(mountPath, resolved);
    activeMountPath = mountPath;

    pyodide.registerJsModule("ontobdc_trace", {
      log: (msg) => {
        console.log("[ontobdc-pyodide]", String(msg));
      },
    });
    pyodide.FS.syncfs(true, (err) => {
      if (err) console.warn("[ontobdc-pyodide] syncfs init warning:", err);
    });

    pyodide.globals.set("view_payload_json", JSON.stringify(WORKSTREAM_PAYLOAD));
    pyodide.globals.set("container_mount_path", mountPath);
    const resultProxy = await pyodide.runPythonAsync(WORKBOOK_PARSE_SCRIPT);
    const result = JSON.parse(String(resultProxy));
    if (resultProxy && typeof resultProxy.destroy === "function") {
      try { resultProxy.destroy(); } catch { /* no-op */ }
    }
    return result;
  }

  async function refreshFromWorkbook() {
    if (!rawContainerHandle) return;
    const refreshBtn = document.querySelector(".refresh-btn");
    const originalLabel = refreshBtn?.textContent || "";
    try {
      if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = t("refreshingFromWorkbook");
      }
      const result = await openContainerFromHandle(rawContainerHandle);
      applyLiveWorkbookResult(result);
    } catch (error) {
      console.error(error);
      window.alert(`Could not refresh from workbook: ${error.message || error}`);
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = !rawContainerHandle;
        if (rawContainerHandle) refreshBtn.textContent = originalLabel || t("refreshFromWorkbook");
      }
    }
  }

  function applyLiveWorkbookResult(result, options) {
    if (!result) return;
    const fireCardOnConnected = !(options && options.fireCardOnConnected === false);
    liveWorkbookRecord = result.record || null;
    liveRelationships = result.relationships || null;
    renderHeader();
    // Re-mount every dimension card. The live record may have added a
    // dimension value that the static JSON-LD left blank (so the card
    // didn't even exist before this refresh), or removed one — a full
    // re-render is simpler and safer than trying to patch individual
    // cards' .dimension-value text nodes in-place.
    renderDimensionCards();
    applyStaticI18n();
    if (fireCardOnConnected) {
      for (const card of dimensionCards) {
        if (card.onConnected) card.onConnected();
      }
    }
  }

  async function linksetFileHandle(kind, create) {
    const fileName = LINKSET_FILES[kind];
    if (!fileName) throw new Error(`Unknown linkset kind: ${kind}`);
    const metadata = await datasetHandle.getDirectoryHandle(".__ontobdc__", { create });
    const linksetDir = await metadata.getDirectoryHandle("linkset", { create });
    return linksetDir.getFileHandle(fileName, { create });
  }

  async function readLinksetText(kind) {
    try {
      const handle = await linksetFileHandle(kind, false);
      return await (await handle.getFile()).text();
    } catch {
      return "";
    }
  }

  async function writeLinksetText(kind, text) {
    const handle = await linksetFileHandle(kind, true);
    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
  }

  const LINKSET_PYTHON_SCRIPT = `
import hashlib
import json
from datetime import datetime, timezone
from rdflib import BNode, Graph, Literal, Namespace, URIRef
from rdflib.namespace import RDF, XSD

LS = Namespace("https://standards.iso.org/iso/21597/-1/ed-1/en/Linkset#")
OBDC = Namespace(status_ns)

STATUS_PROPOSED = URIRef(status_proposed)
STATUS_REJECTED = URIRef(status_rejected)
PREDICATE_STATUS = URIRef(status_predicate)
PREDICATE_MODIFIED_AT = URIRef(status_modified_at_predicate)

graph = Graph()
graph.bind("obdc", OBDC, override=False)
graph.bind("ls", LS, override=False)
if existing_ttl.strip():
    graph.parse(data=existing_ttl, format="turtle")

def link_element_uri(element):
    if element is None:
        return None
    identifier = graph.value(element, LS.hasIdentifier)
    if identifier is None:
        return None
    value = graph.value(identifier, LS.uri)
    return str(value) if value is not None else None

def find_link(from_uri, to_uri):
    for link in graph.subjects(RDF.type, LS.DirectedBinaryLink):
        from_el = graph.value(link, LS.hasFromLinkElement)
        to_el = graph.value(link, LS.hasToLinkElement)
        if link_element_uri(from_el) == from_uri and link_element_uri(to_el) == to_uri:
            return link
    return None

def remove_link(link):
    for predicate in (LS.hasFromLinkElement, LS.hasToLinkElement):
        element = graph.value(link, predicate)
        if element is None:
            continue
        identifier = graph.value(element, LS.hasIdentifier)
        if identifier is not None:
            graph.remove((identifier, None, None))
        graph.remove((element, None, None))
    graph.remove((link, None, None))

def make_element(uri):
    element = BNode()
    identifier = BNode()
    graph.add((element, LS.hasIdentifier, identifier))
    graph.add((identifier, RDF.type, LS.URIBasedIdentifier))
    graph.add((identifier, LS.uri, Literal(uri, datatype=XSD.anyURI)))
    return element

def set_link_status(link, status_uri):
    graph.set((link, PREDICATE_STATUS, status_uri))
    now = datetime.now(timezone.utc).isoformat()
    graph.set((link, PREDICATE_MODIFIED_AT, Literal(now, datatype=XSD.dateTimeStamp)))

def link_status(link):
    value = graph.value(link, PREDICATE_STATUS)
    return str(value) if value is not None else None

action_add = ns_prefix + ":add"
action_remove = ns_prefix + ":remove"
has_status_lifecycle = has_status_lifecycle == "true"

existing_link = find_link(dimension_uri, resource_uri) if resource_uri else None

if action == action_remove and existing_link is not None:
    if has_status_lifecycle:
        set_link_status(existing_link, STATUS_REJECTED)
    else:
        remove_link(existing_link)
elif action == action_add:
    if existing_link is None:
        digest = hashlib.sha256((dimension_uri + "|" + resource_uri).encode("utf-8")).hexdigest()[:16]
        link = URIRef(f"{ns_prefix}:{digest}")
        graph.add((link, RDF.type, LS.DirectedBinaryLink))
        graph.add((link, LS.hasFromLinkElement, make_element(dimension_uri)))
        graph.add((link, LS.hasToLinkElement, make_element(resource_uri)))
        if has_status_lifecycle:
            set_link_status(link, STATUS_PROPOSED)
    elif has_status_lifecycle:
        current_status = link_status(existing_link)
        if current_status == str(STATUS_REJECTED):
            set_link_status(existing_link, STATUS_PROPOSED)

active_entries = {}
all_status_entries = {}
for link in graph.subjects(RDF.type, LS.DirectedBinaryLink):
    from_el = graph.value(link, LS.hasFromLinkElement)
    to_el = graph.value(link, LS.hasToLinkElement)
    from_uri = link_element_uri(from_el)
    to_uri = link_element_uri(to_el)
    if not from_uri or not to_uri:
        continue
    status = link_status(link)
    all_status_entries.setdefault(from_uri, {})[to_uri] = status
    is_rejected = has_status_lifecycle and status == str(STATUS_REJECTED)
    if not is_rejected:
        active_entries.setdefault(from_uri, []).append(to_uri)

json.dumps({
    "ttl": graph.serialize(format="turtle"),
    "entries": active_entries,
    "allStatus": all_status_entries,
})
`;

  // Runs one read/add/remove op on a linkset kind (related/suggested)
  // and returns { ttl, entries, allStatus } where:
  //   * `entries`     — dimension URI -> resource URI list (only "active"
  //                     links: every related link, plus Proposed suggestions;
  //                     Rejected suggestions are excluded on purpose).
  //   * `allStatus`   — dimension URI -> resource URI -> status string,
  //                     useful for lifecycle visibility on the UI side.
  // Read once and shared across all seven cards, instead of re-parsing the
  // same file seven times.
  async function runLinksetOperation(kind, action, dimensionUri, resourceId) {
    const pyodide = await ensurePyodide();
    const nsPrefix = LINKSET_NS_PREFIXES[kind];
    if (!nsPrefix) throw new Error(`Unknown linkset kind: ${kind}`);
    const actionCodes = LINKSET_ACTIONS[kind];
    if (!actionCodes) throw new Error(`Unknown linkset kind: ${kind}`);

    const codeMap = {
      [actionCodes.add]: `${nsPrefix}:add`,
      [actionCodes.remove]: `${nsPrefix}:remove`,
      read: "read",
    };
    const codedAction = codeMap[action];
    if (codedAction === undefined) throw new Error(`Unknown action ${action} for kind ${kind}`);

    const hasStatusLifecycle = kind === "suggested" ? "true" : "false";
    const existingTtl = await readLinksetText(kind);
    pyodide.globals.set("existing_ttl", existingTtl);
    pyodide.globals.set("ns_prefix", nsPrefix);
    pyodide.globals.set("has_status_lifecycle", hasStatusLifecycle);
    pyodide.globals.set("status_ns", SUGGESTION_STATUS_NS);
    pyodide.globals.set("status_proposed", SUGGESTION_STATUS.PROPOSED);
    pyodide.globals.set("status_rejected", SUGGESTION_STATUS.REJECTED);
    pyodide.globals.set("status_predicate", SUGGESTION_STATUS_PREDICATE);
    pyodide.globals.set("status_modified_at_predicate", SUGGESTION_MODIFIED_AT_PREDICATE);
    pyodide.globals.set("dimension_uri", dimensionUri || "");
    pyodide.globals.set("resource_uri", resourceId || "");
    pyodide.globals.set("action", codedAction);
    const resultJson = await pyodide.runPythonAsync(LINKSET_PYTHON_SCRIPT);
    const result = JSON.parse(resultJson);
    if (action !== "read") await writeLinksetText(kind, result.ttl);
    return {
      entries: result.entries || {},
      allStatus: result.allStatus || {},
    };
  }

  async function loadAllLinks(kind) {
    if (!datasetHandle) return { entries: {}, allStatus: {} };
    try {
      return await runLinksetOperation(kind, "read", null, null);
    } catch (error) {
      console.error(error);
      return { entries: {}, allStatus: {} };
    }
  }

  // --- Declarative file display profiles (brasidatacenter/ontology/ontobdc/domain/file.ttl) ---
  //
  // Mirror of the InfoBIM reference's file_display.ttl engine (see html.py
  // CANDIDATE_DISPLAY_PROFILES and the 006.js `category_for` function): when
  // a container ships a file.ttl (compatible with the canonical OntoBDC file
  // ontology) under .__ontobdc__/ontology/file.ttl (or the legacy
  // file_display.ttl path for coexistence with existing generated datasets)
  // we parse its :FileDisplayProfile individuals in pyodide/rdflib and return
  // both (a) the ordered list of display categories for rendering category
  // tiles and (b) a helper `category_for(resource_node)` that matches a JSON-LD
  // resource (its type, mime, filePath extension, size) against each profile
  // following the canonical precedence chain:
  //   1. profile requires a semantic type and the resource has that type
  //   2. profile has an acceptedMimeType equal to the resource's inferred mime
  //   3. profile has an acceptedExtension equal to the resource's lowercased
  //      filename extension (including the leading full stop)
  // :PhotographicRecord uses its requiredSemanticType and is checked first;
  // all other profiles fall back exactly to the mime/extension criteria of
  // the InfoBIM reference so the user sees the familiar Pranchas / Documentos
  // / Comunicação / Fotos splits on generated datasets.
  //
  // When no such ontology file exists in the container the engine returns an
  // empty list of categories and every call to `category_for` returns null
  // so the UI gracefully degrades to its legacy no-tile, "show all the
  // catalogued files" behaviour.

  const FILE_DISPLAY_ONTOLOGY_CANDIDATES = Object.freeze([
    "file.ttl",
    "file_display.ttl",
  ]);

  const FILE_DISPLAY_PARSE_SCRIPT = `
import json
from rdflib import Graph, Namespace, RDF, RDFS, URIRef

FILE = Namespace("https://w3id.org/ontobdc/ontology/file#")
OBDC = Namespace("http://ontobdc.org/ontology/domain/ontobdc/ns.ttl#")
SIG = Namespace("http://ontobdc.org/ontology/domain/signature.ttl#")

g = Graph()
if ontology_ttl.strip():
    g.parse(data=ontology_ttl, format="turtle")

def scalar(uri, predicate):
    value = g.value(uri, predicate)
    if value is None:
        return None
    try:
        return str(value.toPython())
    except Exception:
        return str(value)

def all_values(uri, predicate):
    return [
        str(v) if not isinstance(v, URIRef) else str(v)
        for v in g.objects(uri, predicate)
    ]

profiles = []
for profile_uri in sorted(g.subjects(RDF.type, FILE.FileDisplayProfile), key=lambda u: str(u)):
    category = scalar(profile_uri, FILE.displayCategory)
    if not category:
        continue
    profiles.append({
        "id": category,
        "category": category,
        "label": scalar(profile_uri, FILE.categoryLabel) or category,
        "requiredSemanticType": str(scalar(profile_uri, FILE.requiredSemanticType))
            if scalar(profile_uri, FILE.requiredSemanticType) else None,
        "acceptedMimeTypes": sorted(set(all_values(profile_uri, FILE.acceptedMimeType))),
        "acceptedExtensions": sorted(set(all_values(profile_uri, FILE.acceptedExtension))),
    })

# Preserve the canonical InfoBIM ordering users already expect when all four
# legacy categories are present. Any custom categories added to the ontology
# file keep their sorted-by-URI position after the known ones.
canonical_order = {"drawings": 10, "documents": 20, "photos": 30, "messages": 40}
profiles.sort(key=lambda p: (canonical_order.get(p["id"], 99), p["label"], p["id"]))

json.dumps({"profiles": profiles})
`;

  const FILE_DISPLAY_STATUS_NS = "http://ontobdc.org/ontology/domain/ontobdc/ns.ttl#";

  function extensionOfNode(node) {
    const filePath = literal(node, `${OBDC_NS}filePath`);
    if (!filePath) return null;
    const fileName = filePath.split("/").pop();
    if (!fileName || !fileName.includes(".")) return null;
    const index = fileName.lastIndexOf(".");
    return fileName.slice(index).toLowerCase();
  }

  function mimeOfNode(node) {
    return literal(node, `${FILE_DISPLAY_STATUS_NS}mimeType`) || literal(node, "https://schema.org/encodingFormat");
  }

  function typedAs(node, requiredTypeUri) {
    if (!requiredTypeUri) return true;
    const types = nodeTypes(node);
    if (types.some((type) => type === requiredTypeUri)) return true;
    const short = requiredTypeUri.split("#").slice(-1)[0] || requiredTypeUri;
    return types.some((type) => type.endsWith(`#${short}`));
  }

  function matchesProfile(node, profile, inferredExtension, inferredMime) {
    const required = profile.requiredSemanticType;
    const extMatches = inferredExtension
      ? profile.acceptedExtensions.includes(inferredExtension)
      : false;
    const mimeMatches = inferredMime
      ? profile.acceptedMimeTypes.includes(inferredMime)
      : false;
    if (required) {
      if (!typedAs(node, required)) return false;
      return extMatches || mimeMatches || profile.acceptedExtensions.length + profile.acceptedMimeTypes.length === 0;
    }
    return extMatches || mimeMatches;
  }

  let cachedFileDisplayPromise = null;

  async function readFileDisplayOntologyText() {
    if (!datasetHandle) return null;
    try {
      const metadata = await datasetHandle.getDirectoryHandle(".__ontobdc__", { create: false });
      const ontologyDir = await metadata.getDirectoryHandle("ontology", { create: false });
      let handle = null;
      for (const fileName of FILE_DISPLAY_ONTOLOGY_CANDIDATES) {
        try {
          handle = await ontologyDir.getFileHandle(fileName, { create: false });
          break;
        } catch {
          handle = null;
        }
      }
      if (!handle) return null;
      return await (await handle.getFile()).text();
    } catch {
      return null;
    }
  }

  // Returns { profiles: Array<DisplayProfile> }
  // DisplayProfile = {
  //   id: string, category: string, label: string,
  //   requiredSemanticType: string|null,
  //   acceptedMimeTypes: string[], acceptedExtensions: string[]
  // }
  async function loadFileDisplayProfiles() {
    if (cachedFileDisplayPromise) return cachedFileDisplayPromise;
    cachedFileDisplayPromise = (async () => {
      try {
        const [ontologyText, pyodide] = await Promise.all([
          readFileDisplayOntologyText(),
          ensurePyodide(),
        ]);
        if (!ontologyText) return { profiles: [] };
        pyodide.globals.set("ontology_ttl", ontologyText);
        const resultJson = await pyodide.runPythonAsync(FILE_DISPLAY_PARSE_SCRIPT);
        const result = JSON.parse(resultJson);
        return { profiles: Array.isArray(result.profiles) ? result.profiles : [] };
      } catch (error) {
        console.error(error);
        return { profiles: [] };
      }
    })();
    return cachedFileDisplayPromise;
  }

  function categoryForNode(node, profiles) {
    if (!node || !profiles || profiles.length === 0) return null;
    const inferredExtension = extensionOfNode(node);
    const inferredMime = mimeOfNode(node);
    for (const profile of profiles) {
      if (matchesProfile(node, profile, inferredExtension, inferredMime)) {
        return profile.id;
      }
    }
    return null;
  }

  // --- Dimension card ---

  function createDimensionCard(dimension, value) {
    const dimensionUri = workStreamContext ? workStreamContext.dimensionUri(dimension.slug) : "";

    const card = document.createElement("section");
    card.className = "tile dimension-card";
    card.innerHTML = `
      <div class="dimension-card-head">
        <div class="dimension-label">${t(dimension.key)}</div>
      </div>
      <div class="dimension-value"></div>
      <div class="resource-tabs" role="tablist">
        <button type="button" class="resource-tab is-active" data-tab="related" role="tab" aria-selected="true">${t("related")}</button>
        <button type="button" class="resource-tab" data-tab="suggested" role="tab" aria-selected="false">${t("suggested")}</button>
        <button type="button" class="resource-tab" data-tab="found" role="tab" aria-selected="false">${t("found")}</button>
      </div>
      <div class="resource-body">
        <div class="resource-list">
          <nav class="resource-categories" aria-label="${t("resourceCategories")}" data-resource-categories hidden></nav>
          <div class="resource-tree-container"></div>
        </div>
        <div class="resource-preview-column">
          <div class="preview-tabs" role="tablist"></div>
          <div class="resource-preview"></div>
          <div class="inline-annotations">
            <span class="inline-annotations-label">${t("annotations")}</span>
            <div class="inline-annotations-actions">
              <button type="button" class="icon-btn view-annotations-btn" disabled hidden title="${t("viewAnnotations")}" aria-label="${t("viewAnnotations")}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              <button type="button" class="icon-btn create-annotation-btn" disabled hidden title="${t("createAnnotation")}" aria-label="${t("createAnnotation")}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    card.querySelector(".dimension-value").textContent = value;

    const previewEl = card.querySelector(".resource-preview");
    const tabStripEl = card.querySelector(".preview-tabs");
    const emptyPane = document.createElement("div");
    emptyPane.className = "preview-pane preview-pane-empty is-active";
    emptyPane.innerHTML = '<div class="resource-preview-empty"></div>';
    emptyPane.querySelector(".resource-preview-empty").textContent = t("selectResourceToPreview");
    previewEl.appendChild(emptyPane);

    let activeTab = "related";
    // Multi-tab preview state: `openTabs` is the ordered list of currently
    // open resource ids (tab strip order); `activeTabId` is whichever one
    // is visible right now (null = nothing open, the empty pane shows);
    // `previewPanes` caches each open tab's mounted DOM subtree so
    // switching tabs never re-fetches/re-parses a CSV or reloads a PDF
    // iframe. This is deliberately independent of the three filter axes
    // below — flipping a filter must never touch which preview tabs are
    // open.
    let openTabs = [];
    let activeTabId = null;
    const previewPanes = new Map();
    let relatedResourceIds = new Set();
    let suggestedResourceIds = new Set();
    let displayProfiles = [];
    let activeCategory = null;
    let expandedPaths = new Set();
    let connected = false;
    let annotationsTile = null;
    let annotationsTileResourceId = null;

    function currentTabNodes() {
      const resources = resourceNodes();
      const withStatus = resources.filter((node) => {
        if (activeTab === "related") return relatedResourceIds.has(node["@id"]);
        if (activeTab === "suggested") return suggestedResourceIds.has(node["@id"]);
        return true;
      });
      if (!activeCategory) return withStatus;
      return withStatus.filter((node) => categoryForNode(node, displayProfiles) === activeCategory);
    }

    function renderCategoryTiles() {
      const container = card.querySelector("[data-resource-categories]");
      if (!container) return;
      container.innerHTML = "";
      if (!displayProfiles || displayProfiles.length === 0) {
        container.hidden = true;
        return;
      }
      container.hidden = false;
      const allButton = document.createElement("button");
      allButton.type = "button";
      allButton.className = `resource-category-link${activeCategory === null ? " is-active" : ""}`;
      allButton.dataset.category = "";
      allButton.setAttribute("role", "tab");
      allButton.setAttribute("aria-expanded", String(activeCategory === null));
      allButton.textContent = t("all");
      allButton.title = t("showAllCategories");
      allButton.addEventListener("click", () => {
        activeCategory = null;
        renderCategoryTiles();
        renderResources();
      });
      container.appendChild(allButton);
      for (const profile of displayProfiles) {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = `resource-category-link${activeCategory === profile.id ? " is-active" : ""}`;
        tile.dataset.category = profile.id;
        tile.setAttribute("role", "tab");
        tile.setAttribute("aria-expanded", String(activeCategory === profile.id));
        tile.textContent = profile.label;
        tile.title = `Show only ${profile.label} resources`;
        tile.addEventListener("click", () => {
          activeCategory = profile.id;
          renderCategoryTiles();
          renderResources();
        });
        container.appendChild(tile);
      }
    }

    function updateAnnotateButton(node) {
      // annotationRuntime is only ever created lazily, the first time
      // annotateResource()/openWorkspace()/openSubjectPage() actually
      // runs (see ensureAnnotationRuntime()) — nothing creates it
      // proactively on folder-connect. Gating readiness on it being
      // already non-null left these buttons permanently disabled
      // (silently swallowing clicks, no error) until the user happened
      // to open Workspace or Subjects first. Folder connection is the
      // only real precondition; the runtime creates itself on demand.
      const ready = Boolean(datasetHandle && typeof OntoBDCAnnotations !== "undefined");
      const viewButton = card.querySelector(".view-annotations-btn");
      viewButton.hidden = !node;
      viewButton.disabled = !ready;

      const createButton = card.querySelector(".create-annotation-btn");
      const kind = node ? resourceMimeKind(node) : null;
      const annotatable = kind === "image" || kind === "pdf";
      createButton.hidden = !node || !annotatable;
      createButton.disabled = !ready;

      // Only tear down the annotations panel when it would now be listing
      // a different resource than the newly active tab — opening/switching
      // to a tab that's already the one the panel is showing (e.g. closing
      // an unrelated background tab) must not spuriously close it.
      if (annotationsTile && annotationsTileResourceId !== (node ? node["@id"] : null)) {
        closeAnnotationsTile();
      }
    }

    // Builds one tab's mounted preview content. Called once per resource,
    // the first time its tab opens — the result is cached in `previewPanes`
    // so switching tabs is a pure visibility toggle (updatePreviewVisibility),
    // never a re-fetch/re-render.
    function mountPreviewPane(node) {
      const pane = document.createElement("div");
      pane.className = "preview-pane";
      pane.dataset.resourceId = node["@id"];

      const filePath = literal(node, `${OBDC_NS}filePath`);
      const href = filePath ? `../../../${filePath}` : null;
      const kind = resourceMimeKind(node);

      if (href && kind === "image") {
        const img = document.createElement("img");
        img.src = href;
        img.alt = resourceLabel(node);
        pane.appendChild(img);
        return pane;
      }
      if (href && kind === "pdf") {
        const frame = document.createElement("iframe");
        frame.src = href;
        frame.title = resourceLabel(node);
        pane.appendChild(frame);
        return pane;
      }
      if (href && kind === "csv") {
        pane.classList.add("is-csv");
        const loading = document.createElement("div");
        loading.className = "resource-preview-empty";
        loading.textContent = t("loadingCsv");
        pane.appendChild(loading);
        fetch(href)
          .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.text();
          })
          .then((text) => {
            // The tab may have been closed (and this pane discarded) while
            // the fetch was in flight — only the still-current pane for
            // this resource id may be mutated.
            if (previewPanes.get(node["@id"]) !== pane) return;
            const rows = parseCsv(text);
            pane.innerHTML = "";
            pane.appendChild(rows.length ? renderCsvTable(rows) : renderCsvFallback(href));
          })
          .catch((error) => {
            console.error(error);
            if (previewPanes.get(node["@id"]) !== pane) return;
            pane.innerHTML = "";
            pane.appendChild(renderCsvFallback(href));
          });
        return pane;
      }

      const link = document.createElement("a");
      link.className = "resource-open-link";
      link.href = href || "#";
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = href ? t("openResource", { name: resourceLabel(node) }) : t("noPreviewAvailable");
      pane.appendChild(link);
      return pane;
    }

    function renderPreviewTabStrip() {
      tabStripEl.innerHTML = "";
      for (const resourceId of openTabs) {
        const node = graphNodes.find((item) => item["@id"] === resourceId);
        if (!node) continue;
        const tab = document.createElement("div");
        tab.className = `preview-tab${resourceId === activeTabId ? " is-active" : ""}`;
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", String(resourceId === activeTabId));

        const label = document.createElement("span");
        label.className = "preview-tab-label";
        label.textContent = resourceLabel(node);
        label.title = resourceLabel(node);

        const closeBtn = document.createElement("span");
        closeBtn.className = "preview-tab-close";
        closeBtn.textContent = "×";
        closeBtn.setAttribute("role", "button");
        closeBtn.setAttribute("aria-label", `Close ${resourceLabel(node)}`);
        closeBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          closeTab(resourceId);
        });

        tab.append(label, closeBtn);
        tab.addEventListener("click", () => activateTab(resourceId));
        tabStripEl.appendChild(tab);
      }
    }

    function updatePreviewVisibility() {
      emptyPane.classList.toggle("is-active", activeTabId === null);
      for (const [resourceId, pane] of previewPanes) {
        pane.classList.toggle("is-active", resourceId === activeTabId);
      }
    }

    function activateTab(resourceId) {
      activeTabId = resourceId;
      renderPreviewTabStrip();
      updatePreviewVisibility();
      renderList();
      const node = graphNodes.find((item) => item["@id"] === resourceId) || null;
      updateAnnotateButton(node);
    }

    // Single click both opens (if new) and switches to (always) a resource's
    // tab — there is no double-click distinction here, unlike the main
    // Surface's file tree (single-select / double-activate), since this
    // page has no separate "reveal a pre-existing Tile" step to gate.
    function openResourceTab(node) {
      const resourceId = node["@id"];
      if (!openTabs.includes(resourceId)) {
        openTabs.push(resourceId);
        const pane = mountPreviewPane(node);
        previewPanes.set(resourceId, pane);
        previewEl.appendChild(pane);
      }
      activateTab(resourceId);
    }

    function closeTab(resourceId) {
      const index = openTabs.indexOf(resourceId);
      if (index === -1) return;
      openTabs.splice(index, 1);
      const pane = previewPanes.get(resourceId);
      if (pane) pane.remove();
      previewPanes.delete(resourceId);

      if (activeTabId === resourceId) {
        // Activate the tab that slides into the closed one's slot — the
        // neighbor now at the same index, or the new last tab if the
        // closed tab was rightmost, matching common browser tab-close
        // behavior. `null` when no tabs remain.
        activeTabId = openTabs[Math.min(index, openTabs.length - 1)] ?? null;
      }
      renderPreviewTabStrip();
      updatePreviewVisibility();
      renderList();
      const node = activeTabId ? graphNodes.find((item) => item["@id"] === activeTabId) : null;
      updateAnnotateButton(node || null);
    }

    async function toggleRelation(resourceId, button) {
      if (!datasetHandle) return;
      const isRelated = relatedResourceIds.has(resourceId);
      const action = isRelated ? "unrelate" : "relate";
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = isRelated ? t("unrelating") : t("relating");
      try {
        const result = await runLinksetOperation("related", action, dimensionUri, resourceId);
        relatedResourceIds = new Set(result.entries[dimensionUri] || []);
        renderResources();
      } catch (error) {
        console.error(error);
        button.textContent = t("error");
        setTimeout(() => { button.textContent = originalLabel; }, 2500);
      } finally {
        button.disabled = !datasetHandle;
      }
    }

    async function toggleSuggestion(resourceId, button) {
      if (!datasetHandle) return;
      const isSuggested = suggestedResourceIds.has(resourceId);
      const action = isSuggested ? "unsuggest" : "suggest";
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = isSuggested ? t("unsuggesting") : t("suggesting");
      try {
        const result = await runLinksetOperation("suggested", action, dimensionUri, resourceId);
        suggestedResourceIds = new Set(result.entries[dimensionUri] || []);
        renderResources();
      } catch (error) {
        console.error(error);
        button.textContent = t("error");
        setTimeout(() => { button.textContent = originalLabel; }, 2500);
      } finally {
        button.disabled = !datasetHandle;
      }
    }

    // Same shape/traversal as onto-file-tree-tile.js's #buildTree/#renderNode
    // (the main Surface's file tree) — folders group by filePath segments,
    // sorted directories-first, so a resource's location reads the same way
    // here as it does there. Leaf nodes carry the actual JSON-LD entity.
    function buildResourceTree(nodes) {
      const root = { children: new Map(), isFile: false, path: "" };
      for (const resourceNode of nodes) {
        const filePath = literal(resourceNode, `${OBDC_NS}filePath`);
        if (!filePath) continue;
        const segments = filePath.split("/").filter(Boolean);
        let current = root;
        let builtPath = "";
        segments.forEach((segment, index) => {
          builtPath = builtPath ? `${builtPath}/${segment}` : segment;
          if (!current.children.has(segment)) {
            current.children.set(segment, { children: new Map(), isFile: true, path: builtPath, node: null });
          }
          current = current.children.get(segment);
          const isLeaf = index === segments.length - 1;
          current.isFile = isLeaf;
          if (isLeaf) current.node = resourceNode;
        });
      }
      return root;
    }

    function renderTreeNode(treeNode) {
      const list = document.createElement("ul");
      list.className = "resource-tree-list";
      const entries = [...treeNode.children.entries()].sort((a, b) => {
        if (a[1].isFile !== b[1].isFile) return a[1].isFile ? 1 : -1;
        return a[0].localeCompare(b[0]);
      });

      for (const [name, child] of entries) {
        const item = document.createElement("li");
        const row = document.createElement("div");
        const expanded = expandedPaths.has(child.path);
        row.className = `resource-node ${child.isFile ? "file" : "dir"}`;
        if (child.isFile && child.node && child.node["@id"] === activeTabId) {
          row.classList.add("is-selected");
        }

        const icon = document.createElement("span");
        icon.className = "resource-node-icon";
        icon.textContent = child.isFile ? "\u{1F4C4}" : expanded ? "\u{1F4C2}" : "\u{1F4C1}";
        const nameEl = document.createElement("span");
        nameEl.className = "resource-node-name";
        nameEl.textContent = name;
        nameEl.title = name;
        row.append(icon, nameEl);

        if (child.isFile) {
          const nodeId = child.node["@id"];

          const suggestBtn = document.createElement("button");
          suggestBtn.type = "button";
          suggestBtn.className = "resource-suggest-btn";
          suggestBtn.textContent = suggestedResourceIds.has(nodeId) ? t("unsuggest") : t("suggest");
          suggestBtn.disabled = !datasetHandle;
          suggestBtn.title = datasetHandle ? "" : t("connectFolderFirst");
          suggestBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            toggleSuggestion(nodeId, suggestBtn);
          });
          row.appendChild(suggestBtn);

          const relateBtn = document.createElement("button");
          relateBtn.type = "button";
          relateBtn.className = "resource-relate-btn";
          relateBtn.textContent = relatedResourceIds.has(nodeId) ? t("unrelate") : t("relate");
          relateBtn.disabled = !datasetHandle;
          relateBtn.title = datasetHandle ? "" : t("connectFolderFirst");
          relateBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            toggleRelation(nodeId, relateBtn);
          });
          row.appendChild(relateBtn);

          row.addEventListener("click", () => {
            openResourceTab(child.node);
          });
        } else {
          row.addEventListener("click", () => {
            if (expandedPaths.has(child.path)) expandedPaths.delete(child.path);
            else expandedPaths.add(child.path);
            renderList();
          });
        }

        item.appendChild(row);
        if (!child.isFile && child.children.size && expanded) {
          item.appendChild(renderTreeNode(child));
        }
        list.appendChild(item);
      }

      return list;
    }

    function renderList() {
      const treeEl = card.querySelector(".resource-tree-container");
      if (!treeEl) return;
      treeEl.innerHTML = "";
      const nodes = currentTabNodes();
      if (!nodes.length) return;
      treeEl.appendChild(renderTreeNode(buildResourceTree(nodes)));
    }

    function renderResources() {
      card.querySelectorAll(".resource-tab").forEach((tab) => {
        const isActive = tab.dataset.tab === activeTab;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
      });
      renderCategoryTiles();
      // Neither the Related/Suggested/Found filter nor the category
      // tiles may touch which preview tabs are currently open.
      renderList();
    }

    function closeAnnotationsTile() {
      if (!annotationsTile) return;
      annotationsTile.remove();
      annotationsTile = null;
      annotationsTileResourceId = null;
    }

    function annotationCategoryLabel(annotation) {
      return OntoBDCAnnotationModel.localName(annotation.type).replace("Annotation", "") || t("note");
    }

    function formatTimestamp(iso) {
      if (!iso) return "";
      try {
        return new Date(iso).toLocaleString();
      } catch {
        return iso;
      }
    }

    // The runtime never exposes its internal store.load() directly — only
    // methods that also build UI around it (open/openWorkspace/...). Reuses
    // openWorkspace into a throwaway, never-attached element purely for its
    // store.load() side effect, then reads the same shared store back out
    // via listAnnotations() for this tile's own rendering.
    async function loadResourceAnnotations(node) {
      const runtime = ensureAnnotationRuntime();
      if (!runtime || !datasetHandle || !node) return [];
      const scratch = document.createElement("div");
      await runtime.openWorkspace(scratch, { containerHandle: datasetHandle });
      const context = { logicalSource: node["@id"], representationSource: node["@id"] };
      return runtime.listAnnotations().filter((annotation) => OntoBDCAnnotationModel.matchesContext(annotation, context));
    }

    function buildAnnotationsTile(node, annotations) {
      const tile = document.createElement("section");
      tile.className = "tile annotations-tile";
      tile.innerHTML = `
        <div class="annotations-tile-head">
          <span class="dimension-label">${t("annotations")} · ${resourceLabel(node)}</span>
          <button type="button" class="icon-btn close-annotations-btn" title="${t("closeAnnotations")}" aria-label="${t("closeAnnotations")}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="annotations-tile-list"></div>
      `;
      tile.querySelector(".close-annotations-btn").addEventListener("click", closeAnnotationsTile);

      const listEl = tile.querySelector(".annotations-tile-list");
      if (!annotations.length) {
        const empty = document.createElement("div");
        empty.className = "annotations-tile-empty";
        empty.textContent = t("noAnnotationsYet");
        listEl.appendChild(empty);
      }
      for (const annotation of annotations) {
        const row = document.createElement("div");
        row.className = "annotations-tile-row";

        const summary = document.createElement("div");
        summary.className = "annotations-tile-summary";
        const badge = document.createElement("span");
        badge.className = "annotations-tile-badge";
        badge.textContent = annotationCategoryLabel(annotation);
        const body = document.createElement("span");
        body.className = "annotations-tile-body-preview";
        body.textContent = annotation.body || "(no text)";
        summary.append(badge, body);

        const detail = document.createElement("div");
        detail.className = "annotations-tile-detail";
        detail.hidden = true;
        const bodyFull = document.createElement("div");
        bodyFull.className = "field-value";
        bodyFull.textContent = annotation.body || "(no text)";
        const meta = document.createElement("div");
        meta.className = "annotations-tile-meta";
        meta.textContent = [
          formatTimestamp(annotation.modified || annotation.created),
          annotation.properties && annotation.properties.markerColor ? annotation.properties.markerColor : null,
        ].filter(Boolean).join(" · ");
        detail.append(bodyFull, meta);

        summary.addEventListener("click", () => { detail.hidden = !detail.hidden; });
        row.append(summary, detail);
        listEl.appendChild(row);
      }
      return tile;
    }

    async function toggleAnnotationsTile(node, button) {
      if (annotationsTile) {
        closeAnnotationsTile();
        return;
      }
      const originalLabel = button.innerHTML;
      button.disabled = true;
      try {
        const annotations = await loadResourceAnnotations(node);
        annotationsTile = buildAnnotationsTile(node, annotations);
        annotationsTileResourceId = node["@id"];
        card.insertAdjacentElement("afterend", annotationsTile);
        annotationsTile.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (error) {
        console.error(error);
      } finally {
        button.disabled = !(annotationRuntime && datasetHandle);
        button.innerHTML = originalLabel;
      }
    }

    card.querySelectorAll(".resource-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        activeTab = tab.dataset.tab;
        renderResources();
      });
    });
    card.querySelector(".create-annotation-btn").addEventListener("click", (event) => {
      const node = graphNodes.find((item) => item["@id"] === activeTabId);
      if (node) annotateResource(node, dimensionUri, event.currentTarget);
    });
    card.querySelector(".view-annotations-btn").addEventListener("click", (event) => {
      const node = graphNodes.find((item) => item["@id"] === activeTabId);
      if (node) toggleAnnotationsTile(node, event.currentTarget);
    });

    renderResources();
    updateAnnotateButton(null);

    return {
      element: card,
      async onConnected() {
        connected = true;
        renderResources();
        const [relatedResult, suggestedResult, displayResult] = await Promise.all([
          loadAllLinks("related"),
          loadAllLinks("suggested"),
          loadFileDisplayProfiles(),
        ]);
        relatedResourceIds = new Set(relatedResult.entries[dimensionUri] || []);
        suggestedResourceIds = new Set(suggestedResult.entries[dimensionUri] || []);
        displayProfiles = displayResult.profiles || [];
        if (activeCategory && displayProfiles.every((p) => p.id !== activeCategory)) {
          activeCategory = null;
        }
        renderResources();
      },
    };
  }

  function renderDimensionCards() {
    const container = document.querySelector(".dimension-cards");
    container.innerHTML = "";
    dimensionCards.length = 0;
    for (const dimension of DIMENSIONS) {
      const value = literal(selfNode, dimension.property);
      if (!value) continue;
      const card = createDimensionCard(dimension, value);
      dimensionCards.push(card);
      container.appendChild(card.element);
    }
  }

  // Each setup step below is independent: a resource tree failing to build
  // must not stop Relate/Suggest from wiring up, and vice versa. Before this
  // guard, render() was one unbroken call chain — any single step throwing
  // (sync or via an unguarded promise elsewhere reacting to this render)
  // silently skipped every step after it, so a single unrelated failure
  // could look like "nothing on the page works" instead of what it was.
  //
  // `step` may be async (e.g. tryReconnectSilently touches IndexedDB and
  // the File System Access API). A plain try/catch here only guards the
  // *synchronous* prefix up to `step`'s first `await` -- anything that
  // rejects after that runs outside this try block entirely and becomes an
  // unhandled promise rejection instead of a caught, labeled error. Await
  // the result and catch on it too so async steps get the same isolation
  // sync ones do.
  function runRenderStep(label, step) {
    try {
      const result = step();
      if (result && typeof result.catch === "function") {
        result.catch((error) => {
          console.error(`[work_stream_view] "${label}" step failed:`, error);
        });
      }
    } catch (error) {
      console.error(`[work_stream_view] "${label}" step failed:`, error);
    }
  }

  function render() {
    runRenderStep("applyStaticI18n", applyStaticI18n);

    graphNodes = loadGraph();
    const resourceId = document.querySelector(".onto-page")?.getAttribute("data-ontobdc-resource") || "";
    selfNode = graphNodes.find((node) => node && node["@id"] === resourceId) || null;

    let identifier = "";
    runRenderStep("renderHeader", () => { identifier = renderHeader(); });

    runRenderStep("workStreamContext", () => {
      if (typeof OntoBDCWorkStreamContext !== "undefined" && selfNode) {
        workStreamContext = OntoBDCWorkStreamContext.create({
          workStreamId: identifier || selfNode["@id"],
          workStreamUri: selfNode["@id"],
        });
      }
    });

    runRenderStep("renderDimensionCards", renderDimensionCards);
    runRenderStep("wireAnnotationControls", wireAnnotationControls);

    if (typeof OntoBDCAnnotations !== "undefined") {
      runRenderStep("ensureAnnotationRuntime", ensureAnnotationRuntime);
      runRenderStep("tryReconnectSilently", tryReconnectSilently);
    } else {
      const connectBtn = document.querySelector(".connect-btn");
      if (connectBtn) connectBtn.hidden = true;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }

  // No language tile lives on this standalone Page today, but re-applying
  // static chrome + dimension labels on the event keeps this Page in sync
  // for free if one is ever added, or if `document.documentElement.lang`
  // is changed by anything else.
  document.addEventListener("language-changed", () => {
    applyStaticI18n();
    renderDimensionCards();
  });
})();
