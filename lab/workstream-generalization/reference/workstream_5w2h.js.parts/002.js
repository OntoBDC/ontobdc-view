      .includes(resource.id);
  }

  function decodeCatalogComponent(value) {
    try {
      return decodeURIComponent(value);
    } catch (_error) {
      return value;
    }
  }

  function visibleResources(row) {
    const category = row.dataset.activeResource;
    const view = row.dataset.activeView || "related";
    let resources = resourceModel.resources.filter((resource) =>
      categoryMatches(resource, category)
    );
    if (view === "suggested") {
      return [];
    }
    if (view === "related") {
      const dimensionUri = `${payload.dimensionBaseUri}/${row.dataset.dimension}`;
      const relatedIds = new Set(resourceModel.relationships[dimensionUri] || []);
      resources = resources.filter((resource) => relatedIds.has(resource.id));
    }
    return resources;
  }

  function appendTreeItems(parent, node, row) {
    Object.keys(node.directories).sort().forEach((name) => {
      const item = document.createElement("li");
      const disclosure = document.createElement("details");
      disclosure.className = "workstream-tree-directory";
      disclosure.open = false;
      const label = document.createElement("summary");
      label.className = "workstream-tree-folder";
      label.textContent = name;
      disclosure.appendChild(label);
      const children = document.createElement("ul");
      appendTreeItems(children, node.directories[name], row);
      disclosure.appendChild(children);
      item.appendChild(disclosure);
      parent.appendChild(item);
    });
    node.files
      .sort((left, right) => left.name.localeCompare(right.name))
      .forEach((resource) => {
        const item = document.createElement("li");
        const fileRow = document.createElement("div");
        fileRow.className = "workstream-tree-file-row";
        const button = document.createElement("button");
        button.className = "workstream-tree-file";
        if (row.dataset.selectedResource === resource.id) {
          button.classList.add("is-active");
        }
        button.type = "button";
        button.textContent = resource.name;
        button.addEventListener("click", () => previewResource(row, resource));
        fileRow.appendChild(button);
        if (row.dataset.selectedResource === resource.id) {
          const action = relationActionDetails(row, resource);
          if (action) {
            const relationButton = document.createElement("button");
            relationButton.className = "workstream-tree-relation-action";
            relationButton.classList.toggle(
              "is-remove",
              action.action === "remove",
            );
            relationButton.type = "button";
            relationButton.setAttribute("aria-label", action.label);
            relationButton.title = action.label;
            relationButton.innerHTML = relationActionIcon(action.action);
            relationButton.addEventListener("click", (event) => {
              event.stopPropagation();
              row.querySelector("[data-relation-action]").click();
            });
            fileRow.appendChild(relationButton);
          }
        }
        item.appendChild(fileRow);
        parent.appendChild(item);
      });
  }

  function renderResourceTree(row) {
    const tree = row.querySelector("[data-file-tree]");
    const resources = visibleResources(row);
    tree.replaceChildren();
    if (resources.length === 0) {
      const empty = document.createElement("p");
      empty.className = "workstream-resource-empty";
      empty.textContent = row.dataset.activeView === "suggested"
        ? "Nenhum arquivo sugerido."
        : row.dataset.activeView === "found"
          ? "Nenhum arquivo encontrado."
          : "Nenhum arquivo relacionado.";
      tree.appendChild(empty);
      return;
    }

    const root = { directories: {}, files: [] };
    resources.forEach((resource) => {
      const parts = (
        Array.isArray(resource.displayParts)
          ? [...resource.displayParts]
          : resource.id
            .split("/")
            .filter(Boolean)
            .map(decodeCatalogComponent)
      );
      const filename = parts.pop() || resource.name;
      let node = root;
      parts.forEach((part) => {
        node.directories[part] ||= { directories: {}, files: [] };
        node = node.directories[part];
      });
      node.files.push({ ...resource, name: resource.name || filename });
    });
    const list = document.createElement("ul");
    list.className = "workstream-tree-root";
    appendTreeItems(list, root, row);
    tree.appendChild(list);
  }

  function setTreeExpansion(row, expanded) {
    row.querySelectorAll(
      "[data-file-tree] details.workstream-tree-directory",
    ).forEach((directory) => {
      directory.open = expanded;
    });
  }

  function updateFullscreenAction(row) {
    const previewPane = row.querySelector(".workstream-resource-preview");
    const button = row.querySelector("[data-fullscreen-action]");
    if (!previewPane || !button) {
      return;
    }
    const active = (
      document.fullscreenElement === previewPane
      || previewPane.classList.contains("is-fullscreen-fallback")
    );
    const label = active ? "Sair da tela cheia" : "Abrir em tela cheia";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = active ? "Sair da tela cheia" : "Tela cheia";
    button.classList.toggle("is-active", active);
  }

  async function exitPreviewFullscreen(row) {
    const previewPane = row.querySelector(".workstream-resource-preview");
    if (!previewPane) {
      return;
    }
    if (document.fullscreenElement === previewPane && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch (_error) {
        // The fallback state still needs to be cleaned below.
      }
    }
    previewPane.classList.remove("is-fullscreen-fallback");
    document.body.classList.remove("has-preview-fullscreen");
    updateFullscreenAction(row);
  }

  async function togglePreviewFullscreen(row) {
    const previewPane = row.querySelector(".workstream-resource-preview");
    if (!previewPane) {
      return;
    }
    if (
      document.fullscreenElement === previewPane
      || previewPane.classList.contains("is-fullscreen-fallback")
    ) {
      await exitPreviewFullscreen(row);
      return;
    }
    if (previewPane.requestFullscreen) {
      try {
        await previewPane.requestFullscreen();
        updateFullscreenAction(row);
        return;
      } catch (_error) {
        // The fixed-position fallback keeps the preview usable in restricted browsers.
      }
    }
    previewPane.classList.add("is-fullscreen-fallback");
    document.body.classList.add("has-preview-fullscreen");
    updateFullscreenAction(row);
  }

  function setPreviewMode(row, mode) {
    row.dataset.previewMode = mode;
    const documentAction = row.querySelector(
      "[data-document-mode-action]",
    );
    const annotationsAction = row.querySelector(
      "[data-annotations-mode-action]",
    );
    [
      [documentAction, "document"],
      [annotationsAction, "annotations"],
    ].forEach(function (entry) {
      const action = entry[0];
      if (!action) {
        return;
      }
      const active = entry[1] === mode;
      action.classList.toggle("is-active", active);
      action.setAttribute("aria-pressed", String(active));
    });
  }

  function annotationCapable(context) {
    if (!context) {
      return false;
    }
    return (
      context.mediaType.startsWith("image/")
      || context.mediaType === "application/pdf"
      || /\.(png|jpe?g|webp|gif|bmp|pdf)$/i.test(
        context.representation.id,
      )
    );
  }

  async function showAnnotationsMode(row, context) {
    if (!context) {
      throw new Error(
        "A visualização de anotações não está disponível para este arquivo.",
      );
    }
    const spatialAnnotations = await ensureSpatialAnnotations();
    await spatialAnnotations.showPreview(context);
    setPreviewMode(row, "annotations");
  }

  function clearPreview(row, message = "Selecione um arquivo.") {
    exitPreviewFullscreen(row);
    const previewToolbar = row.querySelector("[data-preview-toolbar]");
    if (previewToolbar) {
      previewToolbar.hidden = true;
    }
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
    row.querySelector("[data-resource-preview-title]").textContent =
      "Selecione um arquivo";
    delete row.dataset.selectedResource;
    delete row.dataset.selectedRepresentation;
    delete row.dataset.selectedMediaType;
    window.infoBimAnnotationContext = null;
    row.infoBimAnnotationContext = null;
    const annotationAction = row.querySelector("[data-annotation-action]");
    const annotationsModeAction = row.querySelector(
      "[data-annotations-mode-action]",
    );
    const documentModeAction = row.querySelector(
      "[data-document-mode-action]",
    );
    const propagateAction = row.querySelector("[data-propagate-action]");
    if (annotationAction) {
      annotationAction.disabled = true;
    }
    if (annotationsModeAction) {
      annotationsModeAction.disabled = true;
    }
    if (documentModeAction) {
      documentModeAction.disabled = true;
    }
    if (propagateAction) {
      propagateAction.disabled = true;
      propagateAction.title = "Selecione um arquivo.";
    }
    configureRelationAction(row, null);
    const preview = row.querySelector("[data-file-preview]");
    if (window.OntoBDCWorkStreamAnnotations) {
      window.OntoBDCWorkStreamAnnotations.clearPreview({
        previewElement: preview,
      });
    }
    delete row.dataset.previewMode;
    preview.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "workstream-resource-empty";
    empty.textContent = message;
    preview.appendChild(empty);
  }

  async function fileFromCatalogId(resourceId) {
    const cleanPath = resourceId
      .replace(/^\.?\//, "")
      .split("/")
      .map((part) => decodeURIComponent(part))
      .filter((part) => part && part !== "." && part !== "..");
    if (cleanPath.length === 0) {
      throw new Error("A referência não aponta para um arquivo.");
    }