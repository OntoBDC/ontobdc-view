
  async function synchronizeProjectManifest() {
    if (!activeContainerHandle) {
      throw new Error("Abra o projeto antes de atualizar seus arquivos.");
    }
    const filePaths = await collectProjectFiles(activeContainerHandle);
    const metadataDirectory = await activeContainerHandle.getDirectoryHandle(
      ".__ontobdc__",
    );
    const manifestHandle = await metadataDirectory.getFileHandle(
      "ro-crate-metadata.json",
      { create: true },
    );
    const writable = await manifestHandle.createWritable();
    await writable.write(
      `${JSON.stringify(makeRoCrate(filePaths), null, 2)}\n`,
    );
    await writable.close();
    return filePaths.length;
  }

  async function previewResource(row, resource) {
    const title = row.querySelector("[data-resource-preview-title]");
    const preview = row.querySelector("[data-file-preview]");
    row.dataset.selectedResource = resource.id;
    renderResourceTree(row);
    configureRelationAction(row, resource);
    configurePropagateAction(row, resource);
    title.textContent = resource.name;
    if (window.OntoBDCWorkStreamAnnotations) {
      window.OntoBDCWorkStreamAnnotations.clearPreview({
        previewElement: preview,
      });
    }
    preview.replaceChildren();
    try {
      const representation = previewRepresentation(resource);
      const file = await fileFromCatalogId(representation.id);
      const mediaType = representation.encodingFormat || file.type || "";
      row.dataset.selectedRepresentation = representation.id;
      row.dataset.selectedMediaType = mediaType;
      window.infoBimAnnotationContext = {
        containerHandle: activeContainerHandle,
        resource,
        representation,
        file,
        mediaType,
        dimensionUri:
          `${payload.dimensionBaseUri}/${row.dataset.dimension}`,
      };
      row.infoBimAnnotationContext = window.infoBimAnnotationContext;
      const annotationAction = row.querySelector("[data-annotation-action]");
      const annotationsModeAction = row.querySelector(
        "[data-annotations-mode-action]",
      );
      const documentModeAction = row.querySelector(
        "[data-document-mode-action]",
      );
      const annotatable = annotationCapable(
        window.infoBimAnnotationContext,
      );
      if (annotationAction) {
        annotationAction.disabled = (
          !annotatable
          || !resourceIsRelatedToRow(row, resource)
        );
        annotationAction.title = annotationAction.disabled
          ? "Relacione o arquivo a esta dimensão antes de anotar."
          : "Anotar arquivo";
      }
      if (annotationsModeAction) {
        annotationsModeAction.disabled = !annotatable;
      }
      if (documentModeAction) {
        documentModeAction.disabled = false;
      }
      setPreviewMode(row, "document");
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
      }
      if (mediaType.startsWith("image/")) {
        previewObjectUrl = URL.createObjectURL(file);
        const image = document.createElement("img");
        image.src = previewObjectUrl;
        image.alt = resource.name;
        preview.appendChild(image);
      } else if (mediaType === "application/pdf") {
        previewObjectUrl = URL.createObjectURL(file);
        const frame = document.createElement("iframe");
        frame.src = previewObjectUrl;
        frame.title = representation.name;
        preview.appendChild(frame);
      } else if (/\.(msg|eml)$/i.test(resource.id)) {
        renderEmail(preview, await parseEmail(file, resource.id));
      } else if (
        mediaType.startsWith("text/")
        || /\.(txt|md|csv|json|ttl|xml)$/i.test(resource.id)
      ) {
        const text = document.createElement("pre");
        text.textContent = await file.text();
        preview.appendChild(text);
      } else {
        const metadata = document.createElement("dl");
        metadata.className = "workstream-resource-metadata";
        [["Arquivo", resource.name], ["Caminho", resource.id],
          ["Tipo", mediaType || "não informado"]].forEach(([key, value]) => {
          const term = document.createElement("dt");
          term.textContent = key;
          const description = document.createElement("dd");
          description.textContent = value;
          metadata.append(term, description);
        });
        preview.appendChild(metadata);
      }
      const previewToolbar = row.querySelector("[data-preview-toolbar]");
      if (previewToolbar) {
        previewToolbar.hidden = false;
        updateFullscreenAction(row);
      }
      if (window.infoBimAnnotationContext) {
        window.infoBimAnnotationContext.previewElement = preview;
        document.dispatchEvent(new CustomEvent(
          "infobim:preview-ready",
          { detail: window.infoBimAnnotationContext },
        ));
      }
    } catch (error) {
      clearPreview(row, `Não foi possível abrir o arquivo: ${error.message}`);
    }
  }

  function relationActionIcon(action) {
    if (action === "remove") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9.5 14.5 14.5 9.5"></path>
          <path d="m7 17-1.2 1.2a3.5 3.5 0 0 1-5-5L5 9a3.5 3.5 0 0 1 5 0"></path>
          <path d="m17 7 1.2-1.2a3.5 3.5 0 0 1 5 5L19 15a3.5 3.5 0 0 1-5 0"></path>
        </svg>`;
    }
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m10 13 4-4"></path>
        <path d="m7 17-1.2 1.2a3.5 3.5 0 0 1-5-5L5 9a3.5 3.5 0 0 1 5 0l1 1"></path>
        <path d="m17 7 1.2-1.2a3.5 3.5 0 0 1 5 5L19 15a3.5 3.5 0 0 1-5 0l-1-1"></path>
      </svg>`;
  }

  function configureRelationAction(row, resource) {
    const button = row.querySelector("[data-relation-action]");
    const details = relationActionDetails(row, resource);
    if (!details) {
      button.hidden = true;
      delete button.dataset.action;
      return;
    }

    button.hidden = false;
    button.disabled = false;
    button.dataset.action = details.action;
    button.classList.toggle("is-remove", details.action === "remove");
    button.setAttribute("aria-label", details.label);
    button.title = details.label;
    button.innerHTML = relationActionIcon(details.action);
  }

  function relationActionDetails(row, resource) {
    if (!resource) {
      return null;
    }
    const view = row.dataset.activeView || "related";
    const dimensionUri = `${payload.dimensionBaseUri}/${row.dataset.dimension}`;
    const related = new Set(resourceModel.relationships[dimensionUri] || []);
    if (view === "found" && related.has(resource.id)) {
      return null;
    }
    const action = view === "related" ? "remove" : "add";
    return {
      action,
      label: action === "add"
        ? "Relacionar arquivo"
        : "Remover relação",
    };
  }

  async function resourceLinksetHandle() {
    const metadata = await activeContainerHandle.getDirectoryHandle(
      ".__ontobdc__",
    );
    const linkset = await metadata.getDirectoryHandle("linkset", {
      create: true,
    });
    return linkset.getFileHandle("WorkStreamResource.ttl", { create: true });
  }

  async function serializeRelationship(action, dimensionUri, resourceId) {
    const fileHandle = await resourceLinksetHandle();
    const currentFile = await fileHandle.getFile();
    activePyodide.globals.set(
      "relationship_request_json",
      JSON.stringify({
        action,
        dimensionUri,
        resourceId,
        turtle: await currentFile.text(),
      }),
    );
    const resultProxy = await activePyodide.runPythonAsync(`
import hashlib
import json

from rdflib import Graph, Namespace, URIRef, Literal
from rdflib.namespace import RDF, XSD

request = json.loads(relationship_request_json)
LS = Namespace("https://standards.iso.org/iso/21597/-1/ed-1/en/Linkset#")
graph = Graph()
if request["turtle"].strip():
    graph.parse(data=request["turtle"], format="turtle")

def endpoint_value(element):
    identifier = graph.value(element, LS.hasIdentifier)
    return (
        graph.value(identifier, LS.uri)
        or graph.value(identifier, LS.identifier)
    )

matches = []
for link in graph.subjects(RDF.type, LS.DirectedBinaryLink):
    from_element = graph.value(link, LS.hasFromLinkElement)
    to_element = graph.value(link, LS.hasToLinkElement)
    values = {
        str(value)
        for value in (
            endpoint_value(from_element),
            endpoint_value(to_element),
        )
        if value is not None
    }
    if {
        request["dimensionUri"],
        request["resourceId"],
    }.issubset(values):
        matches.append((link, from_element, to_element))

if request["action"] == "add" and not matches:
    digest = hashlib.sha256(
        (request["dimensionUri"] + "|" + request["resourceId"]).encode()
    ).hexdigest()[:24]
    base = f"urn:infobim:linkset:workstream-resource:{digest}"
    link = URIRef(base)
    dimension_element = URIRef(base + ":dimension")
    resource_element = URIRef(base + ":resource")
    dimension_identifier = URIRef(base + ":dimension-identifier")
    resource_identifier = URIRef(base + ":resource-identifier")

    graph.add((link, RDF.type, LS.DirectedBinaryLink))
    graph.add((link, LS.hasFromLinkElement, dimension_element))
    graph.add((link, LS.hasToLinkElement, resource_element))
    graph.add((dimension_element, RDF.type, LS.LinkElement))
    graph.add((dimension_element, LS.hasIdentifier, dimension_identifier))
    graph.add((dimension_identifier, RDF.type, LS.URIBasedIdentifier))
    graph.add((
        dimension_identifier,
        LS.uri,
        Literal(request["dimensionUri"], datatype=XSD.anyURI),
    ))
    graph.add((resource_element, RDF.type, LS.LinkElement))
    graph.add((resource_element, LS.hasIdentifier, resource_identifier))
    graph.add((resource_identifier, RDF.type, LS.StringBasedIdentifier))
    graph.add((
        resource_identifier,
        LS.identifier,
        Literal(request["resourceId"]),
    ))

if request["action"] == "remove":
    for link, from_element, to_element in matches:
        graph.remove((link, None, None))
        graph.remove((None, None, link))
        for element in (from_element, to_element):
            still_used = any(
                graph.subjects(LS.hasFromLinkElement, element)
            ) or any(
                graph.subjects(LS.hasToLinkElement, element)
            )
            if still_used:
                continue
            identifier = graph.value(element, LS.hasIdentifier)
            if element is not None:
                graph.remove((element, None, None))
                graph.remove((None, None, element))
            if (
                identifier is not None
                and not any(graph.subjects(LS.hasIdentifier, identifier))
            ):
                graph.remove((identifier, None, None))
                graph.remove((None, None, identifier))

graph.bind("ls", LS)