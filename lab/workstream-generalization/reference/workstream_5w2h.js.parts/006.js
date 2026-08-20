        toggle.addEventListener("click", () => {
          const resourceKey = toggle.dataset.resourceToggle;
          const isOpen = (
            toggle.classList.contains("is-active")
            && !panel.hidden
          );

          toggles.forEach((candidate) => {
            candidate.classList.remove("is-active");
            candidate.setAttribute("aria-expanded", "false");
          });

          if (isOpen) {
            panel.hidden = true;
            delete row.dataset.activeResource;
            panel.removeAttribute("data-active-resource");
            clearPreview(row);
            return;
          }

          toggle.classList.add("is-active");
          toggle.setAttribute("aria-expanded", "true");
          panel.dataset.activeResource = resourceKey;
          row.dataset.activeResource = resourceKey;
          row.dataset.activeView ||= "related";
          title.textContent = resourceLabels[resourceKey] || "Recursos";
          panel.hidden = false;
          clearPreview(row);
          renderResourceTree(row);
        });
      });

      tabs.forEach((tab, tabIndex) => {
        tab.addEventListener("click", () => {
          tabs.forEach((candidate) => {
            candidate.classList.remove("is-active");
            candidate.setAttribute("aria-selected", "false");
            candidate.tabIndex = -1;
          });
          tab.classList.add("is-active");
          tab.setAttribute("aria-selected", "true");
          tab.tabIndex = 0;
          row.dataset.activeView = tab.dataset.resourceView;
          row.querySelector("[data-file-tree]").setAttribute(
            "aria-labelledby",
            tab.id,
          );
          clearPreview(row);
          renderResourceTree(row);
        });
        tab.addEventListener("keydown", (event) => {
          if (!["ArrowLeft", "ArrowRight"].includes(event.key)) {
            return;
          }
          event.preventDefault();
          const offset = event.key === "ArrowRight" ? 1 : -1;
          tabs[(tabIndex + offset + tabs.length) % tabs.length].focus();
        });
      });

      relationAction.addEventListener("click", async () => {
        const resource = resourceModel.resources.find(
          (candidate) => candidate.id === row.dataset.selectedResource,
        );
        const action = relationAction.dataset.action;
        if (!resource || !["add", "remove"].includes(action)) {
          return;
        }

        relationAction.disabled = true;
        try {
          await updateRelationship(row, resource, action);
          if (action === "remove") {
            clearPreview(row);
          } else {
            configureRelationAction(row, resource);
            configurePropagateAction(row, resource);
            if (annotationAction) {
              annotationAction.disabled = (
                !annotationCapable(row.infoBimAnnotationContext)
                || !resourceIsRelatedToRow(row, resource)
              );
              annotationAction.title = annotationAction.disabled
                ? "Relacione o arquivo a esta dimensão antes de anotar."
                : "Anotar arquivo";
            }
          }
          renderResourceTree(row);
          relationAction.title = action === "add"
            ? "Arquivo relacionado"
            : "Relação removida";
        } catch (error) {
          relationAction.disabled = false;
          relationAction.title = `Falha ao gravar relação: ${error.message}`;
          relationAction.setAttribute("aria-label", relationAction.title);
        }
      });
    });
  }

  async function openContainer() {
    openButton.disabled = true;
    setStatus("Solicitando acesso ao projeto...", "");

    try {
      if (typeof window.showDirectoryPicker !== "function") {
        throw new Error(
          "Este navegador não oferece a File System Access API. Use Microsoft Edge ou Google Chrome.",
        );
      }
      if (typeof loadPyodide !== "function") {
        throw new Error("O carregador do Pyodide não está disponível.");
      }

      const containerHandle = await acquireContainerHandle();
      activeContainerHandle = containerHandle;
      document.dispatchEvent(new CustomEvent("infobim:project-opened", {
        detail: { containerHandle: containerHandle },
      }));
      document.getElementById("project-title").textContent =
        containerHandle.name || payload.projectName || "";
      setStatus(`Carregando o projeto “${containerHandle.name}”...`, "");
      const pyodide = await loadPyodide();
      activePyodide = pyodide;
      const mountPath = `/container_${Date.now()}`;
      const metadataHandle = await containerHandle.getDirectoryHandle(
        ".__ontobdc__",
      );
      const payloadHandle = await containerHandle.getDirectoryHandle("payload");
      pyodide.FS.mkdirTree(mountPath);
      await pyodide.mountNativeFS(
        `${mountPath}/.__ontobdc__`,
        metadataHandle,
      );
      await pyodide.mountNativeFS(`${mountPath}/payload`, payloadHandle);
      await pyodide.loadPackage("micropip");
      await pyodide.runPythonAsync(`
import micropip
await micropip.install(["openpyxl", "rdflib"])
`);
      pyodide.globals.set("view_payload_json", JSON.stringify(payload));
      pyodide.globals.set("container_mount_path", mountPath);
      const resultProxy = await pyodide.runPythonAsync(`
import json
from pathlib import Path
from urllib.parse import unquote

from openpyxl import load_workbook
from rdflib import Graph, Literal, Namespace, URIRef
from rdflib.namespace import RDF

payload = json.loads(view_payload_json)
container = Path(container_mount_path)
datapackage_path = container / payload["datapackagePath"]
linkset_path = container / payload["linksetPath"]
resource_linkset_path = container / payload["resourceLinksetPath"]
ro_crate_path = container / payload["roCratePath"]
file_display_ontology_path = container / payload["fileDisplayOntologyPath"]

datapackage = json.loads(datapackage_path.read_text(encoding="utf-8"))
resource = next(
    item
    for item in datapackage.get("resources", [])
    if item.get("name") == "work_stream"
)
workbook_path = (datapackage_path.parent / resource["path"]).resolve()
worksheet_name = (
    resource.get("dialect", {})
    .get("excel", {})
    .get("sheet", "WorkStream")
)

LS = Namespace("https://standards.iso.org/iso/21597/-1/ed-1/en/Linkset#")
linkset = Graph()
linkset.parse(linkset_path, format="turtle")
mappings = {}
for link in linkset.subjects(RDF.type, LS.DirectedBinaryLink):
    from_element = linkset.value(link, LS.hasFromLinkElement)
    to_element = linkset.value(link, LS.hasToLinkElement)
    from_identifier = linkset.value(from_element, LS.hasIdentifier)
    to_identifier = linkset.value(to_element, LS.hasIdentifier)
    column = linkset.value(from_identifier, LS.identifier)
    facade_field = linkset.value(to_identifier, LS.uri)
    if isinstance(column, Literal) and facade_field is not None:
        mappings[str(column)] = str(facade_field)

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
if any(field not in mappings for field in headers):
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

try: