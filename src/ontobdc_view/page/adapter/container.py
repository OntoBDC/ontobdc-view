from __future__ import annotations

from typing import Dict

"""Container connection machinery shared by every standalone Page.

Acquiring a container directory handle — the picker, the IndexedDB handle
that survives a reload, the permission prompt, descending into the dataset
folder — has nothing to do with *which* entity a Page shows. It was written
once for the WorkStream Page; a second Page needing it must run this same
code rather than a copy, or the two drift the first time one of them is
fixed.

Only four things differ per Page, and the WorkStream implementation already
treated the third as injectable (`runtime.WORK_STREAM_RESOURCE_NAME || ...`):
the runtime global, the IndexedDB name, the datapackage resource that marks
a folder as this Page's dataset, and the i18n key for "no context on this
page". They are substituted here rather than branched on.
"""


def _render(template: str, options: "PageRuntimeOptions") -> str:
    return (
        template
        .replace("__RUNTIME_GLOBAL__", options.runtime_global)
        .replace("__HANDLE_DB__", options.handle_db_name)
        .replace("__RESOURCE_NAME__", options.resource_name)
        .replace("__NO_CONTEXT_KEY__", options.no_context_key)
        .replace("__CONNECTION_EVENT__", options.connection_event)
        .replace("__PAYLOAD_GLOBAL_NAME__", options.payload_global_name)
    )


class PageRuntimeOptions:
    """What a Page has to declare to reuse the shared container runtime."""

    def __init__(
        self,
        *,
        runtime_global: str,
        handle_db_name: str,
        resource_name: str,
        no_context_key: str,
        connection_event: str,
        payload_global_name: str,
    ) -> None:
        self.runtime_global = runtime_global
        self.handle_db_name = handle_db_name
        self.resource_name = resource_name
        self.no_context_key = no_context_key
        self.connection_event = connection_event
        self.payload_global_name = payload_global_name


WORK_STREAM_RUNTIME = PageRuntimeOptions(
    runtime_global="OntoBDCWorkStreamViewRuntime",
    handle_db_name="ontobdc-workstream-view",
    resource_name="work_stream",
    no_context_key="noWorkStreamContext",
    connection_event="ontobdc:workstream-connection-status",
    payload_global_name="infoBimWorkStreamView",
)

IFC_WORK_SCHEDULE_RUNTIME = PageRuntimeOptions(
    runtime_global="OntoBDCGanttViewRuntime",
    handle_db_name="ontobdc-ifc-work-schedule-view",
    resource_name="ifc_work_schedule",
    no_context_key="noScheduleContext",
    connection_event="ontobdc:ifc-work-schedule-connection-status",
    payload_global_name="infoBimIfcWorkScheduleView",
)


def container_connection_source(options: PageRuntimeOptions) -> str:
    return _render(_CONTAINER_CONNECTION_TEMPLATE, options)


def connection_state_source(options: PageRuntimeOptions) -> str:
    return _render(_CONNECTION_STATE_TEMPLATE, options)


def chrome_controls_source(options: PageRuntimeOptions) -> str:
    return _render(_CHROME_CONTROLS_TEMPLATE, options)


_CONTAINER_CONNECTION_TEMPLATE = r"""(function (window) {
  "use strict";
  var runtime = window.__RUNTIME_GLOBAL__ = window.__RUNTIME_GLOBAL__ || { state: {} };
  console.log("[work-stream-view] state start: container_connection_script_generated");

  runtime.WORKSTREAM_PAYLOAD = runtime.WORKSTREAM_PAYLOAD || window.__PAYLOAD_GLOBAL_NAME__;

  var __ontobdcIdentityT = function __ontobdcIdentityT(key, vars) {
    var text = String(key || "");
    if (vars) {
      try {
        Object.keys(vars).forEach(function (k) {
          text = text.split("{" + k + "}").join(String(vars[k]));
        });
      } catch (e) { /* noop */ }
    }
    return text;
  };
  if (typeof runtime.t !== "function") runtime.t = __ontobdcIdentityT;
  // Resolve runtime.t lazily: on the Gantt Page the loader inserts every
  // runtime script at once, so this IIFE can execute before i18n_apply.js has
  // attached the real translator. A captured reference would freeze to the
  // identity fallback and user-facing strings would show as raw i18n keys.
  var t = function t(key, vars) {
    var fn = (typeof runtime.t === "function") ? runtime.t : __ontobdcIdentityT;
    return fn(key, vars);
  };
  var WORKSTREAM_PAYLOAD = runtime.WORKSTREAM_PAYLOAD;

  const HANDLE_DB_NAME = "__HANDLE_DB__";
  const HANDLE_STORE_NAME = "handles";
  const HANDLE_KEY = "containerHandle";
  const HANDLE_PICKER_ID = "infobim-project-container";

  // Single source of truth for the datapackage.json resource name that
  // marks a folder as a WorkStream dataset — exported on runtime so
  // pyodide_runtime.js can inject it into WORKBOOK_PARSE_SCRIPT's Python
  // globals instead of hardcoding a second copy of the same literal.
  const WORK_STREAM_RESOURCE_NAME = "__RESOURCE_NAME__";
  runtime.WORK_STREAM_RESOURCE_NAME = WORK_STREAM_RESOURCE_NAME;

  async function readDatapackageOrNull(handle, metadataDirName) {
    try {
      const metadataDirectory = await handle.getDirectoryHandle(metadataDirName);
      const datapackageFile = await metadataDirectory.getFileHandle("datapackage.json");
      const datapackageBlob = await datapackageFile.getFile();
      const datapackageText = await datapackageBlob.text();
      try {
        return JSON.parse(datapackageText);
      } catch (jsonError) {
        return null;
      }
    } catch (error) {
      if (error && error.name === "NotFoundError") {
        return null;
      }
      if (error && error.name === "TypeMismatchError") {
        return null;
      }
      if (error && error.name === "NotAllowedError") {
        throw error;
      }
      return null;
    }
  }

  async function datapackageFromHandle(handle) {
    const first = await readDatapackageOrNull(handle, ".__ontobdc__");
    if (first !== null) {
      return first;
    }
    const second = await readDatapackageOrNull(handle, ".__infobim__");
    if (second !== null) {
      return second;
    }
    return null;
  }

  async function isContainerHandle(handle) {
    const datapackage = await datapackageFromHandle(handle);
    if (!datapackage || typeof datapackage !== "object") {
      return false;
    }
    const resources = Array.isArray(datapackage.resources) ? datapackage.resources : [];
    const hasExactNamedResource = resources.some((resource) => {
      const name = resource && resource.name;
      return typeof name === "string" && name === WORK_STREAM_RESOURCE_NAME;
    });
    return hasExactNamedResource;
  }

  // The Page is generated for one dataset and carries that dataset's folder
  // name in its payload, so a container holding several datasets is not
  // actually ambiguous — the name settles it. Read it lazily for the same
  // reason `t` is: the payload global may not be attached yet when this IIFE
  // runs, and a value captured then would freeze to "".
  function pageDatasetFolderName() {
    const payload = runtime.WORKSTREAM_PAYLOAD
      || WORKSTREAM_PAYLOAD
      || window.__PAYLOAD_GLOBAL_NAME__
      || null;
    return payload ? String(payload.datasetFolder || "") : "";
  }

  async function resolveContainerHandle(selectedHandle) {
    if (await isContainerHandle(selectedHandle)) {
      if (runtime.state.datasetHandle !== selectedHandle) {
        runtime.state.datasetRelPath = "";
      }
      return selectedHandle;
    }

    const wantedName = pageDatasetFolderName();
    const queue = [{ handle: selectedHandle, relPath: "" }];
    const visited = new Set();
    const matches = [];
    const maxVisits = 2000;

    // Every dataset under the selection is collected, not just the first
    // three: the Page's own folder may be the tenth one walked, and the
    // message raised when it is genuinely absent names what was found
    // instead — neither is possible from a truncated list.
    while (queue.length > 0 && visited.size < maxVisits) {
      const currentItem = queue.shift();
      const current = currentItem && currentItem.handle;
      const currentRelPath = currentItem ? currentItem.relPath : "";
      if (!current || visited.has(current)) {
        continue;
      }
      visited.add(current);
      try {
        for await (const entry of current.values()) {
          if (visited.size >= maxVisits) {
            break;
          }
          if (!entry || entry.kind !== "directory") {
            continue;
          }
          const name = String(entry.name || "");
          if (name.startsWith(".") && name !== ".__ontobdc__" && name !== ".__infobim__") {
            continue;
          }
          if (await isContainerHandle(entry)) {
            const relPath = [currentRelPath, name].filter(Boolean).join("/");
            // The Page's own dataset ends the walk: nothing found later can
            // be a better answer than the folder the Page was generated for.
            if (wantedName && name === wantedName) {
              runtime.state.datasetRelPath = relPath;
              return entry;
            }
            matches.push({ handle: entry, relPath: relPath });
          } else {
            queue.push({
              handle: entry,
              relPath: [currentRelPath, name].filter(Boolean).join("/"),
            });
          }
        }
      } catch (error) {
        if (error && error.name === "NotAllowedError") {
          throw error;
        }
        continue;
      }
    }

    if (matches.length === 1) {
      runtime.state.datasetRelPath = matches[0].relPath;
      return matches[0].handle;
    }
    if (matches.length > 1) {
      // Naming the datasets that were found turns "pick the right folder"
      // into an instruction the reader can act on without opening the tree.
      throw new Error(
        t("multipleDatasetsSelectedFolderCandidates", {
          folders: matches.slice(0, 8).map(function (match) {
            return match.relPath;
          }).join(", "),
        }),
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

  // Exact 1:1 copy of techcenter-doc/workstream_5w2h.js acquireContainerHandle.
  // Tries the stored handle first: if it still works (permission re-granted
  // via the lightweight "Allow folder access?" prompt and
  // resolveContainerHandle still matches a dataset), return the resolved
  // handle silently, NO directory picker navigation needed. Otherwise it
  // deletes the stale stored handle and falls through to the native
  // showDirectoryPicker() dialog.
  // Returns { rootHandle, datasetHandle }. rootHandle is exactly what the
  // user picked (or the stored handle), unresolved — obdc:filePath triples
  // in the RO-Crate JSON-LD are written relative to that container root
  // (ContainerDataPackageSynchronizer.list_container_file_paths, ontobdc-wip).
  // datasetHandle is rootHandle after resolveContainerHandle()'s BFS descent
  // into the actual work_stream dataset folder (needed to mount+parse the
  // workbook, whose datapackage.json may live one or more levels below
  // rootHandle when the user selects a shared parent folder). The two are
  // the SAME object when rootHandle is itself already a valid dataset
  // folder (resolveContainerHandle returns it unchanged in that case) —
  // callers that only need one root (e.g. resolveFile()) should still try
  // both when resolving a path, since either convention may be in play for
  // a given container.
  async function acquireContainerHandle() {
    let handle = await loadStoredHandle();
    if (handle) {
      if (await requestWritableHandle(handle)) {
        try {
          return { rootHandle: handle, datasetHandle: await resolveContainerHandle(handle) };
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
    const datasetHandle = await resolveContainerHandle(handle);
    await storeHandle(handle);
    return { rootHandle: handle, datasetHandle };
  }

  // 1:1 copy of techcenter-doc/workstream_5w2h.js openContainer(). Atomic
  // single-function flow — no splitting across four half-functions. Every
  // intermediate failure lands in the same catch/finally so the button
  // never ends up disabled with fake state.
  async function openContainer() {
    var setConnected = runtime.setConnected;
    var setConnectError = runtime.setConnectError;
    var setConnectionStatus = runtime.setConnectionStatus;
    var ensurePyodide = runtime.ensurePyodide;
    var WORKBOOK_PARSE_SCRIPT = runtime.WORKBOOK_PARSE_SCRIPT;
    var applyLiveWorkbookResult = runtime.applyLiveWorkbookResult;
    var setConnectButtonLabel = runtime.setConnectButtonLabel;
    var withPyodideLock = runtime.withPyodideLock;
    var hasSheetJS = runtime.hasSheetJS;
    var sheetJsRefreshFromWorkbook = runtime.sheetJsRefreshFromWorkbook;

    const button = document.querySelector(".connect-btn");
    const refreshBtn = document.querySelector(".refresh-btn");
    let caughtConnectError = false;

    try {
      if (setConnectionStatus) setConnectionStatus("connecting");
      if (button) button.disabled = true;
      if (setConnectButtonLabel) setConnectButtonLabel(t("requestingAccess"));

      if (typeof window.showDirectoryPicker !== "function") {
        throw new Error(
          t("browserFileSystemAccessUnavailable")
        );
      }
      if (!WORKSTREAM_PAYLOAD) {
        throw new Error(t("__NO_CONTEXT_KEY__"));
      }

      // Step 1 — Handle acquisition + resolution. rootHandle (what the user
      // actually picked) and datasetHandle (BFS-resolved down to the
      // work_stream dataset folder) can differ when the user selects a
      // shared parent folder — see acquireContainerHandle()'s comment.
      const { rootHandle, datasetHandle: resolvedDatasetHandle } = await acquireContainerHandle();
      runtime.state.rawContainerHandle = rootHandle;
      runtime.state.datasetHandle = resolvedDatasetHandle;
      var datasetHandleForSheetJs = resolvedDatasetHandle;

      // Step 2 — SheetJS native path FIRST (no Pyodide, no fetch, no WASM,
      // works 100% on file:// protocol). Only falls back to Pyodide if
      // SheetJS is unavailable or returns empty nodes.
      var result = null;
      var sheetJSError = null;
      if (typeof hasSheetJS === "function" && hasSheetJS() && typeof sheetJsRefreshFromWorkbook === "function") {
        try {
          var originalResolve = runtime.resolveContainerHandle;
          var tempResolved = false;
          runtime.resolveContainerHandle = async function () {
            if (!tempResolved) {
              tempResolved = true;
              return datasetHandleForSheetJs;
            }
            if (typeof originalResolve === "function") {
              return originalResolve.apply(runtime, arguments);
            }
            throw new Error("No connected container available");
          };
          try {
            result = await sheetJsRefreshFromWorkbook();
          } finally {
            runtime.resolveContainerHandle = originalResolve;
          }
          if (result && result.nodes && result.nodes.length > 0) {
            console.log(
              "[ifc-work-schedule-view] workbook parsed (SheetJS native)",
              result.counts || {}
            );
          } else {
            sheetJSError = new Error("SheetJS returned empty result");
          }
        } catch (err) {
          sheetJSError = err;
          console.warn(
            "SheetJS path failed; falling back to Pyodide if available:",
            err
          );
        }
      }

      // Step 2b — Pyodide fallback. Only runs if SheetJS produced no nodes
      // AND ensurePyodide is available. Silent failure on file:// (CORS) so
      // SheetJS errors are not shadowed by noisy fetch warnings.
      if ((!result || !result.nodes || result.nodes.length === 0) && typeof ensurePyodide === "function") {
        try {
          const pyodide = await ensurePyodide({ withOpenpyxl: true });
          if (runtime.state.activeMountPath) {
            try {
              pyodide.FS.unmount(runtime.state.activeMountPath);
            } catch (e) {
              // skip
            }
            runtime.state.activeMountPath = null;
          }
          const mountPath = `/container_${Date.now()}`;
          pyodide.FS.mkdirTree(mountPath);
          await pyodide.mountNativeFS(mountPath, resolvedDatasetHandle);
          runtime.state.activeMountPath = mountPath;
          try {
            pyodide.registerJsModule("ontobdc_trace", {
              log: (msg) => {
                console.log("[ontobdc-pyodide]", String(msg));
              },
            });
          } catch (e) {
            // module already registered from a prior mount; no-op
          }

          const resultProxy = await withPyodideLock(() => {
            pyodide.globals.set("view_payload_json", JSON.stringify(WORKSTREAM_PAYLOAD));
            pyodide.globals.set("container_mount_path", mountPath);
            pyodide.globals.set(
              "work_stream_resource_name",
              runtime.WORK_STREAM_RESOURCE_NAME || "__RESOURCE_NAME__"
            );
            return pyodide.runPythonAsync(WORKBOOK_PARSE_SCRIPT);
          });
          const pyResult = JSON.parse(String(resultProxy));
          if (resultProxy && typeof resultProxy.destroy === "function") {
            try {
              resultProxy.destroy();
            } catch {
              // no-op
            }
          }
          if (pyResult && pyResult.nodes && pyResult.nodes.length > 0) {
            result = pyResult;
          } else if (!sheetJSError) {
            sheetJSError = new Error("Pyodide fallback returned empty result");
          }
        } catch (pyErr) {
          if (!sheetJSError) {
            sheetJSError = pyErr;
          }
          console.warn("Pyodide fallback failed:", pyErr);
        }
      }

      if (!result || !result.nodes || result.nodes.length === 0) {
        if (sheetJSError) {
          throw sheetJSError;
        }
        throw new Error(t("noDatasetSelectedFolder"));
      }

      // Step 3 — Apply live data + wire UI.
      applyLiveWorkbookResult(result);
      setConnected(rootHandle, resolvedDatasetHandle);

      if (refreshBtn && WORKSTREAM_PAYLOAD) {
        refreshBtn.disabled = false;
        refreshBtn.hidden = false;
      }
    } catch (error) {
      caughtConnectError = true;
      console.error(error);
      var rawMessage = error instanceof Error ? (error.message || "") : String(error || "");
      var messageName = error instanceof Error ? (error.name || "") : "";
      var lower = (rawMessage + " " + messageName).toLowerCase();
      var fallbackLabel = runtime.state.rawContainerHandle
        ? t("reconnectFolder")
        : t("connectFolder");

      var isSilentFailure = (
        lower.indexOf("file picker already active") !== -1 ||
        lower.indexOf("aborterror") !== -1 ||
        lower.indexOf("user cancelled") !== -1 ||
        lower.indexOf("the user aborted a request") !== -1 ||
        lower.indexOf("notallowederror") !== -1 ||
        lower.indexOf("securityerror") !== -1 ||
        lower.indexOf("permission denied") !== -1 ||
        lower.indexOf("canceled") !== -1 ||
        lower.indexOf("cancelled") !== -1
      );
      if (isSilentFailure) {
        if (setConnectButtonLabel) setConnectButtonLabel(fallbackLabel);
        if (setConnectionStatus) setConnectionStatus("idle");
      } else {
        var userLabel;
        if (lower.indexOf("datapackage.json") !== -1) {
          userLabel = t("datapackageJsonNotFound");
        } else if (
          lower.indexOf("__no_context_key__") !== -1 ||
          lower.indexOf("no schedule context") !== -1 ||
          lower.indexOf("no work stream context") !== -1
        ) {
          userLabel = t("__NO_CONTEXT_KEY__");
        } else if (
          lower.indexOf("browser file system access") !== -1 ||
          lower.indexOf("showdirectorypicker") !== -1
        ) {
          userLabel = t("browserFileSystemAccessUnavailable");
        } else {
          userLabel = t("noDatasetSelectedFolder");
        }
        setConnectError(userLabel, fallbackLabel);
      }
    } finally {
      if (button) button.disabled = false;
      if (!caughtConnectError && !runtime.state.rawContainerHandle) {
        if (setConnectButtonLabel) setConnectButtonLabel(t("connectFolder"));
      }
      if (refreshBtn) {
        refreshBtn.disabled = !runtime.state.rawContainerHandle;
      }
    }
  }


  Object.assign(runtime, {
    isContainerHandle: isContainerHandle,
    resolveContainerHandle: resolveContainerHandle,
    openHandleDb: openHandleDb,
    storeHandle: storeHandle,
    loadStoredHandle: loadStoredHandle,
    deleteStoredHandle: deleteStoredHandle,
    requestWritableHandle: requestWritableHandle,
    acquireContainerHandle: acquireContainerHandle,
    openContainer: openContainer
  });
  console.log("[work-stream-view] state end: container_connection_script_generated");
}(window));
"""


_CONNECTION_STATE_TEMPLATE = r"""(function (window) {
  "use strict";
  var runtime = window.__RUNTIME_GLOBAL__ = window.__RUNTIME_GLOBAL__ || { state: {} };
  console.log("[work-stream-view] state start: connection_state_script_generated");

  runtime.WORKSTREAM_PAYLOAD = runtime.WORKSTREAM_PAYLOAD || window.__PAYLOAD_GLOBAL_NAME__;

  var __ontobdcIdentityT = function __ontobdcIdentityT(key, vars) {
    var text = String(key || "");
    if (vars) {
      try {
        Object.keys(vars).forEach(function (k) {
          text = text.split("{" + k + "}").join(String(vars[k]));
        });
      } catch (e) { /* noop */ }
    }
    return text;
  };
  if (typeof runtime.t !== "function") runtime.t = __ontobdcIdentityT;
  // Resolve runtime.t lazily: on the Gantt Page the loader inserts every
  // runtime script at once, so this IIFE can execute before i18n_apply.js has
  // attached the real translator. A captured reference would freeze to the
  // identity fallback and user-facing strings would show as raw i18n keys.
  var t = function t(key, vars) {
    var fn = (typeof runtime.t === "function") ? runtime.t : __ontobdcIdentityT;
    return fn(key, vars);
  };
  var WORKSTREAM_PAYLOAD = runtime.WORKSTREAM_PAYLOAD;
  var loadStoredHandle = runtime.loadStoredHandle;
  var openContainer = runtime.openContainer;

  // tryReconnectSilently() (fired from render(), unattended) and
  // connectFolder() (fired from a user click) can both end up mid-flight on
  // the exact same stored handle's permission APIs at once -- a fast click
  // right as the page finishes loading races render()'s own silent
  // reconnect attempt. Serializing them through this promise avoids two
  // concurrent queryPermission()/requestPermission() calls on one handle.
  let pendingReconnectAttempt = null;

  // Single source of truth for the "am I connected?" signal. Callers never
  // touch the status dot's DOM directly — they call this, it dispatches a
  // CustomEvent on window, and wireConnectionStatusIndicator() (annotation_bridge.js)
  // is the only thing that paints it. Any script can also listen for
  // ONTOBDC_CONNECTION_STATUS_EVENT itself instead of polling runtime.state.
  const ONTOBDC_CONNECTION_STATUS_EVENT = "__CONNECTION_EVENT__";

  function setConnectionStatus(status) {
    window.dispatchEvent(
      new CustomEvent(ONTOBDC_CONNECTION_STATUS_EVENT, { detail: { status } })
    );
  }

  const SURFACE_REGENERATION_REQUEST_FILE = "surface-regeneration.request.json";

  async function requestSurfaceRegeneration(reason) {
    const rootHandle = runtime.state.rawContainerHandle || runtime.state.datasetHandle;
    if (!rootHandle) return false;
    const metadata = await rootHandle.getDirectoryHandle(".__ontobdc__", {
      create: true,
    });
    const requestHandle = await metadata.getFileHandle(
      SURFACE_REGENERATION_REQUEST_FILE,
      { create: true },
    );
    const writable = await requestHandle.createWritable();
    await writable.write(JSON.stringify({
      requestedAt: new Date().toISOString(),
      reason: String(reason || "workbook_changed"),
      nonce: Math.random().toString(36).slice(2),
    }));
    await writable.close();
    return true;
  }

  function scheduleSurfaceRegeneration(reason) {
    Promise.resolve()
      .then(function () { return requestSurfaceRegeneration(reason); })
      .catch(function (error) {
        console.warn("Could not request background Surface regeneration:", error);
      });
  }

  function setProjectActionsDisabled(disabled) {
    runtime.state.projectActionsDisabled = Boolean(disabled);
    var actions = document.querySelectorAll("button:not(.connect-btn)");
    for (var index = 0; index < actions.length; index++) {
      actions[index].disabled = Boolean(disabled);
    }
  }

  function wireProjectActionGate() {
    if (
      runtime.projectActionGateObserver ||
      !document.body
    ) return;
    runtime.projectActionGateObserver = new MutationObserver(function (records) {
      if (!runtime.state.projectActionsDisabled) return;
      for (var recordIndex = 0; recordIndex < records.length; recordIndex++) {
        var nodes = records[recordIndex].addedNodes || [];
        for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
          var node = nodes[nodeIndex];
          if (!node || node.nodeType !== 1) continue;
          if (node.matches && node.matches("button:not(.connect-btn)")) {
            node.disabled = true;
          }
          if (node.querySelectorAll) {
            var nested = node.querySelectorAll("button:not(.connect-btn)");
            for (var nestedIndex = 0; nestedIndex < nested.length; nestedIndex++) {
              nested[nestedIndex].disabled = true;
            }
          }
        }
      }
    });
    runtime.projectActionGateObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
    setProjectActionsDisabled(!runtime.state.rawContainerHandle);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireProjectActionGate, {
      once: true,
    });
  } else {
    wireProjectActionGate();
  }

  function setConnected(rawHandle, resolvedDatasetHandle) {
    var setConnectButtonLabel = runtime.setConnectButtonLabel;
    runtime.state.rawContainerHandle = rawHandle;
    runtime.state.datasetHandle = resolvedDatasetHandle ?? rawHandle;
    setConnectButtonLabel(t("connectedFolder"));
    var connectBtn = document.querySelector(".connect-btn");
    if (connectBtn) connectBtn.disabled = false;
    setProjectActionsDisabled(false);
    const refreshBtn = document.querySelector(".refresh-btn");
    if (refreshBtn && WORKSTREAM_PAYLOAD) {
      refreshBtn.disabled = false;
      refreshBtn.hidden = false;
    }
    // Gantt-only: the "+" new-task button stays disabled until a folder is
    // connected, since createTask() writes straight into that workbook.
    setConnectionStatus("connected");
  }

  function setConnectError(message, fallbackLabel) {
    var setConnectButtonLabel = runtime.setConnectButtonLabel;
    const button = document.querySelector(".connect-btn");
    setConnectButtonLabel(message);
    if (button) button.disabled = false;
    if (!runtime.state.rawContainerHandle) setProjectActionsDisabled(true);
    setConnectionStatus("error");
    setTimeout(() => {
      setConnectButtonLabel(
        runtime.state.rawContainerHandle ? t("connectedFolder") : fallbackLabel
      );
      setConnectionStatus(runtime.state.rawContainerHandle ? "connected" : "idle");
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
    // If ANYTHING fails, the button falls back to the "connectFolder"
    // label — no fake connected state is ever painted.
    const handle = await loadStoredHandle();
    if (!handle) return;
    try {
      const permission = await handle.queryPermission({ mode: "readwrite" });
      if (permission !== "granted") {
        setProjectActionsDisabled(true);
        setConnectButtonLabel(t("allowFolderAccess"));
        setConnectionStatus("idle");
        return;
      }
      await openContainer();
    } catch (error) {
      console.warn("Silent reconnect failed, user will have to click manually:", error);
      // Explicitly NOT fake-setting the button as connected. On any
      // failure the label says "Conectar pasta" and user clicks themselves.
      setConnectButtonLabel(t("connectFolder"));
      setProjectActionsDisabled(true);
      setConnectionStatus("idle");
    }
  }

  // Registers the attempt in pendingReconnectAttempt for its whole
  // duration (including setConnected(), not just the permission check) so
  // concurrent openContainer() clicks can wait it out instead of racing it
  // on the same handle's permission APIs.
  function tryReconnectSilently() {
    const attempt = tryReconnectSilentlyImpl().finally(() => {
      if (runtime.pendingReconnectAttempt === attempt) runtime.pendingReconnectAttempt = null;
    });
    runtime.pendingReconnectAttempt = attempt;
    return attempt;
  }


  Object.assign(runtime, {
    setConnected: setConnected,
    setConnectError: setConnectError,
    setConnectionStatus: setConnectionStatus,
    requestSurfaceRegeneration: requestSurfaceRegeneration,
    scheduleSurfaceRegeneration: scheduleSurfaceRegeneration,
    setProjectActionsDisabled: setProjectActionsDisabled,
    wireProjectActionGate: wireProjectActionGate,
    ONTOBDC_CONNECTION_STATUS_EVENT: ONTOBDC_CONNECTION_STATUS_EVENT,
    tryReconnectSilentlyImpl: tryReconnectSilentlyImpl,
    tryReconnectSilently: tryReconnectSilently
  });
  console.log("[work-stream-view] state end: connection_state_script_generated");
}(window));
"""


_CHROME_CONTROLS_TEMPLATE = r"""(function (window) {
  "use strict";
  var runtime = window.__RUNTIME_GLOBAL__ = window.__RUNTIME_GLOBAL__ || { state: {} };
  console.log("[work-stream-view] state start: chrome_controls_script_generated");

  var __ontobdcIdentityT = function __ontobdcIdentityT(key, vars) {
    var text = String(key || "");
    if (vars) {
      try {
        Object.keys(vars).forEach(function (k) {
          text = text.split("{" + k + "}").join(String(vars[k]));
        });
      } catch (e) { /* noop */ }
    }
    return text;
  };
  if (typeof runtime.t !== "function") runtime.t = __ontobdcIdentityT;
  // Resolve runtime.t lazily: on the Gantt Page the loader inserts every
  // runtime script at once, so this IIFE can execute before i18n_apply.js has
  // attached the real translator. A captured reference would freeze to the
  // identity fallback and user-facing strings would show as raw i18n keys.
  var t = function t(key, vars) {
    var fn = (typeof runtime.t === "function") ? runtime.t : __ontobdcIdentityT;
    return fn(key, vars);
  };
  var openContainer = runtime.openContainer;
  var setConnectButtonLabel = runtime.setConnectButtonLabel;

  var INLINE_EDIT_ICONS = {
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>',
    cancel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m18 6-12 12"/><path d="m6 6 12 12"/></svg>'
  };

  function mountInlineEditor(host, options) {
    if (!host) return null;
    var config = options || {};
    var currentValue = String(config.value == null ? "" : config.value);
    var editing = false;
    var saving = false;

    function label(name, fallback) {
      var value = config[name];
      return typeof value === "function" ? value() : String(value || fallback);
    }

    function iconButton(kind, title, handler) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "onto-inline-edit-btn onto-inline-edit-btn--" + kind;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.innerHTML = INLINE_EDIT_ICONS[kind];
      button.addEventListener("click", handler);
      return button;
    }

    function render() {
      host.innerHTML = "";
      host.classList.add("onto-inline-edit");
      var error = document.createElement("div");
      error.className = "onto-inline-edit-error";

      if (!editing) {
        var value = document.createElement(config.multiline ? "div" : "span");
        value.className = "onto-inline-edit-value";
        value.textContent = currentValue || label("emptyLabel", "—");
        if (!currentValue) value.classList.add("is-empty");
        var actions = document.createElement("span");
        actions.className = "onto-inline-edit-actions";
        actions.appendChild(iconButton("edit", label("editLabel", "Edit"), function () {
          editing = true;
          render();
        }));
        host.append(value, actions, error);
        return;
      }

      var input = document.createElement(config.multiline ? "textarea" : "input");
      if (!config.multiline) input.type = "text";
      input.className = "onto-inline-edit-input";
      input.value = currentValue;
      if (config.rows) input.rows = config.rows;
      var editActions = document.createElement("span");
      editActions.className = "onto-inline-edit-actions";
      var saveButton = iconButton("save", label("saveLabel", "Save"), async function () {
        var nextValue = input.value.trim();
        if (config.required && !nextValue) {
          error.textContent = label("requiredMessage", "This value is required.");
          error.hidden = false;
          input.focus();
          return;
        }
        saving = true;
        input.disabled = true;
        saveButton.disabled = true;
        cancelButton.disabled = true;
        host.classList.add("is-saving");
        try {
          if (typeof config.onSave === "function") await config.onSave(nextValue);
          currentValue = nextValue;
          editing = false;
          render();
        } catch (caught) {
          saving = false;
          input.disabled = false;
          saveButton.disabled = false;
          cancelButton.disabled = false;
          host.classList.remove("is-saving");
          error.textContent = caught && caught.message ? caught.message : String(caught);
          error.hidden = false;
          input.focus();
        }
      });
      var cancelButton = iconButton("cancel", label("cancelLabel", "Cancel"), function () {
        if (saving) return;
        editing = false;
        render();
      });
      editActions.append(saveButton, cancelButton);
      host.append(input, editActions, error);
      error.hidden = true;
      input.addEventListener("keydown", function (event) {
        if (event.key === "Escape") { event.preventDefault(); cancelButton.click(); }
        if ((!config.multiline && event.key === "Enter") ||
            (config.multiline && event.key === "Enter" && (event.ctrlKey || event.metaKey))) {
          event.preventDefault(); saveButton.click();
        }
      });
      window.setTimeout(function () { input.focus(); input.select(); }, 0);
    }

    render();
    return { getValue: function () { return currentValue; } };
  }

  function ensureConnectButtonInnerStatus() {
    var button = document.querySelector(".connect-btn");
    if (!button) return;

    if (!document.getElementById("ontobdc-connect-btn-layout-style")) {
      var style = document.createElement("style");
      style.id = "ontobdc-connect-btn-layout-style";
      style.textContent = `
        .connect-btn {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 8px !important;
          padding-block: 7px !important;
          padding-inline: 14px !important;
          line-height: 1;
        }
        .connect-btn .connection-status {
          inline-size: 9px;
          block-size: 9px;
          flex: none;
        }
        .connect-btn__label {
          display: inline-block;
          flex: none;
          max-inline-size: 32ch;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `;
      document.head.appendChild(style);
    }

    var external = document.querySelector(".header-actions > .connection-status");
    var existingStatus = button.querySelector(":scope > .connection-status");
    var existingLabel = button.querySelector(":scope > .connect-btn__label");
    var previousText = (button.textContent || "").trim();
    var previousStatus = existingStatus ? existingStatus.dataset.status || "idle" : "idle";
    var previousTitle = existingStatus ? existingStatus.title || "" : "";
    var previousAria = existingStatus ? existingStatus.getAttribute("aria-label") || "" : "";
    var previousLabelText = existingLabel ? existingLabel.textContent : previousText;

    var status = existingStatus || external;
    if (status && external === status) {
      external.parentNode.removeChild(external);
    }
    if (!status) {
      status = document.createElement("span");
      status.className = "connection-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-hidden", "true");
    }
    if (!status.dataset.status) status.dataset.status = previousStatus || "idle";
    if (previousTitle && !status.title) status.title = previousTitle;
    if (previousAria && !status.getAttribute("aria-label")) status.setAttribute("aria-label", previousAria);

    var label = existingLabel;
    if (!label) {
      label = document.createElement("span");
      label.className = "connect-btn__label";
    }
    if (previousLabelText && !label.textContent) {
      label.textContent = previousLabelText;
    }

    var wasEmptyLabel = !label.textContent;

    while (button.firstChild) {
      button.removeChild(button.firstChild);
    }
    button.appendChild(status);
    button.appendChild(label);

    if (wasEmptyLabel && existingStatus) {
      label.textContent = "";
    }
  }

  function setConnectButtonLabelLocal(labelText) {
    var button = document.querySelector(".connect-btn");
    if (!button) return;
    ensureConnectButtonInnerStatus();
    var label = button.querySelector(":scope > .connect-btn__label");
    if (label) label.textContent = labelText;
  }
  runtime.setConnectButtonLabel = setConnectButtonLabelLocal;
  setConnectButtonLabel = setConnectButtonLabelLocal;

  function wireConnectionStatusIndicator() {
    var dot = document.querySelector(".connect-btn .connection-status") || document.querySelector(".connection-status");
    if (!dot) return;
    var labelKeyByStatus = {
      idle: "connectionIdle",
      connecting: "connecting",
      connected: "folderConnected",
      error: "connectionFailed",
    };
    window.addEventListener(runtime.ONTOBDC_CONNECTION_STATUS_EVENT, function (event) {
      var status = (event.detail && event.detail.status) || "idle";
      dot.dataset.status = status;
      var labelKey = labelKeyByStatus[status] || labelKeyByStatus.idle;
      dot.setAttribute("aria-label", t(labelKey));
      dot.title = t(labelKey);
    });
  }

  function wireChromeControls() {
    // Idempotent: this runs on DOMContentLoaded (below) AND is re-exported
    // as runtime.wireAnnotationControls, which the WorkStream render
    // pipeline invokes again as a render step. Without this guard every
    // chrome button (connect, refresh, subjects, workbook) ends up with
    // two identical click listeners — the visible symptom being the
    // Subjects/Threads dialog opening twice on a single click.
    if (wireChromeControls._wired) return;
    wireChromeControls._wired = true;
    wireConnectionStatusIndicator();
    var connectBtn = document.querySelector(".connect-btn");
    if (connectBtn) {
      connectBtn.addEventListener(
        "click",
        async function connectFolderClickHandler() {
          if (
            runtime.pendingReconnectAttempt &&
            typeof runtime.pendingReconnectAttempt.then === "function"
          ) {
            try {
              await runtime.pendingReconnectAttempt;
            } catch (e) {
            }
          }
          try {
            if (typeof openContainer === "function") await openContainer();
          } catch (error) {
            console.error(error);
          }
        }
      );
    }

    var workspaceBtn = document.querySelector(".workspace-btn");
    if (workspaceBtn) {
      workspaceBtn.addEventListener("click", function workspaceBtnClickHandler() {
        if (typeof runtime.openWorkspace === "function") {
          runtime.openWorkspace();
        }
      });
    }

    var subjectsBtn = document.querySelector(".subjects-btn");
    if (subjectsBtn) {
      subjectsBtn.addEventListener("click", function subjectsBtnClickHandler() {
        if (typeof runtime.openSubjectPage === "function") {
          runtime.openSubjectPage();
        }
      });
    }

    var refreshBtn = document.querySelector(".refresh-btn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", async function refreshBtnClickHandler() {
        if (typeof runtime.refreshFromWorkbook === "function") {
          try {
            refreshBtn.disabled = true;
            await runtime.refreshFromWorkbook();
          } catch (error) {
            console.error(error);
          } finally {
            refreshBtn.disabled = !runtime.state.rawContainerHandle;
          }
        }
      });
      if (!runtime.state.rawContainerHandle) {
        refreshBtn.disabled = true;
      }
    }

    var printBtn = document.querySelector(".gantt-print-btn");
    if (printBtn) {
      printBtn.addEventListener("click", function printGanttClickHandler() {
        window.print();
      });
    }

    // Opens the connected page workbook (.xlsx) in Excel. When the view is
    // opened from disk (file://) the workbook resolves to a real file:// URL,
    // so the Office URI scheme ("ms-excel:ofe|u|<url>" = Open For Editing by
    // URL) hands Excel the *exact* file — edits land back in the connected
    // folder, not in a downloaded copy. Over http(s) there is no local file to
    // point at, so it falls back to opening the served copy in a new tab.
    // The workbook path is only known once a folder is connected. It is
    // relative to the resolved dataset, while this generated Page is served
    // from the selected container root, so prepend the dataset path discovered
    // by resolveContainerHandle().
    var openWorkbookBtn = document.querySelector(
      ".gantt-open-workbook-btn, .workstream-open-workbook-btn"
    );
    if (openWorkbookBtn) {
      openWorkbookBtn.addEventListener("click", function openWorkbookClickHandler() {
        var state = runtime.state || {};
        var workbookRelPath = state.workbookRelPath || state.workbookPath || "";
        // The runtime resolves the workbook path relative to the *dataset*
        // folder, but this generated Page is served from the *container* root
        // (<container>/.__ontobdc__/asset/). The dataset folder is a direct
        // child of the container root — its name is in the payload — so
        // prepend it. Both the Gantt and WorkStream Pages need this.
        var payload = runtime.WORKSTREAM_PAYLOAD
          || window.infoBimIfcWorkScheduleView
          || window.infoBimWorkStreamView
          || {};
        var datasetFolder = String(payload.datasetFolder || state.datasetRelPath || "");
        var relPath = [datasetFolder, workbookRelPath].filter(Boolean).join("/");
        if (!relPath) return;
        var assetBase = window.__ONTOBDC_ASSET_BASE_URL__ || "";
        var containerRoot = assetBase.replace(/\.__ontobdc__\/asset\/?$/, "");
        if (!containerRoot) {
          // The page lives at <root>/.__ontobdc__/view/ifc_work_schedule/<id>.html
          try { containerRoot = new URL("../../../", location.href).href; }
          catch (e) { containerRoot = ""; }
        }
        if (containerRoot && containerRoot.charAt(containerRoot.length - 1) !== "/") {
          containerRoot += "/";
        }
        var encoded = String(relPath).split("/").map(function (segment) {
          return encodeURIComponent(segment);
        }).join("/");
        var fileUrl = containerRoot + encoded;

        var opener = document.createElement("a");
        if (fileUrl.indexOf("file:") === 0) {
          opener.href = "ms-excel:ofe|u|" + fileUrl;
        } else {
          opener.href = fileUrl;
          opener.target = "_blank";
          opener.rel = "noopener";
        }
        document.body.appendChild(opener);
        opener.click();
        document.body.removeChild(opener);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      ensureConnectButtonInnerStatus();
      wireChromeControls();
    }, { once: true });
  } else {
    ensureConnectButtonInnerStatus();
    wireChromeControls();
  }

  Object.assign(runtime, {
    ensureConnectButtonInnerStatus: ensureConnectButtonInnerStatus,
    setConnectButtonLabel: setConnectButtonLabelLocal,
    wireConnectionStatusIndicator: wireConnectionStatusIndicator,
    wireChromeControls: wireChromeControls,
    wireAnnotationControls: wireChromeControls,
    mountInlineEditor: mountInlineEditor,
  });
  console.log("[work-stream-view] state end: chrome_controls_script_generated");
}(window));
"""
