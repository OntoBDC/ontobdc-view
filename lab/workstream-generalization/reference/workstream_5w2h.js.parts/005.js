graph.serialize(format="turtle")
`);
    const turtle = String(resultProxy);
    if (resultProxy && typeof resultProxy.destroy === "function") {
      resultProxy.destroy();
    }
    return { fileHandle, turtle };
  }

  async function updateRelationship(row, resource, action) {
    if (!activeContainerHandle || !activePyodide) {
      throw new Error("Abra o projeto antes de alterar relações.");
    }
    const dimensionUri = `${payload.dimensionBaseUri}/${row.dataset.dimension}`;
    const previous = [...(resourceModel.relationships[dimensionUri] || [])];
    const related = new Set(previous);
    if (action === "add") {
      related.add(resource.id);
    } else {
      related.delete(resource.id);
    }
    resourceModel.relationships[dimensionUri] = [...related];

    try {
      const { fileHandle, turtle } = await serializeRelationship(
        action,
        dimensionUri,
        resource.id,
      );
      const writable = await fileHandle.createWritable();
      await writable.write(turtle);
      await writable.close();
    } catch (error) {
      resourceModel.relationships[dimensionUri] = previous;
      throw error;
    }
  }

  function nextDimensionRow(row) {
    const rows = [...document.querySelectorAll(".five-w-two-h-row")];
    const index = rows.indexOf(row);
    return index >= 0 ? rows[index + 1] || null : null;
  }

  function dimensionDisplayName(row) {
    return String(row && row.dataset.dimension || "")
      .replace("-", " ")
      .toUpperCase();
  }

  function configurePropagateAction(row, resource) {
    const action = row.querySelector("[data-propagate-action]");
    if (!action) {
      return;
    }
    const nextRow = nextDimensionRow(row);
    if (!resource) {
      action.disabled = true;
      action.title = "Selecione um arquivo.";
      return;
    }
    if (!resourceIsRelatedToRow(row, resource)) {
      action.disabled = true;
      action.title =
        "Relacione o arquivo a esta dimensão antes de enviá-lo à próxima.";
      return;
    }
    if (!nextRow) {
      action.disabled = true;
      action.title = "Esta é a última dimensão.";
      return;
    }
    const dimensionUri =
      `${payload.dimensionBaseUri}/${nextRow.dataset.dimension}`;
    const alreadyRelated = (
      resourceModel.relationships[dimensionUri] || []
    ).includes(resource.id);
    action.disabled = false;
    action.title = alreadyRelated
      ? `O arquivo já está relacionado à dimensão ${dimensionDisplayName(nextRow)}.`
      : `Relacionar também à dimensão ${dimensionDisplayName(nextRow)}.`;
  }

  function configureResourcePanels() {
    const resourceLabels = {
      drawings: "Pranchas",
      documents: "Documentos",
      messages: "Comunicação",
      photos: "Fotos",
    };

    document.querySelectorAll(".five-w-two-h-row").forEach((row) => {
      const panel = row.querySelector("[data-resource-panel]");
      const title = row.querySelector("[data-resource-title]");
      const toggles = row.querySelectorAll("[data-resource-toggle]");
      const tabs = row.querySelectorAll("[data-resource-view]");
      const relationAction = row.querySelector("[data-relation-action]");
      const fullscreenAction = row.querySelector("[data-fullscreen-action]");
      const documentModeAction = row.querySelector(
        "[data-document-mode-action]",
      );
      const annotationsModeAction = row.querySelector(
        "[data-annotations-mode-action]",
      );
      const annotationAction = row.querySelector("[data-annotation-action]");
      const propagateAction = row.querySelector("[data-propagate-action]");
      const treeActions = row.querySelectorAll("[data-tree-action]");
      if (!panel || !title || toggles.length === 0) {
        return;
      }

      treeActions.forEach((button) => {
        button.addEventListener("click", () => {
          setTreeExpansion(row, button.dataset.treeAction === "expand");
        });
      });

      if (documentModeAction) {
        documentModeAction.addEventListener("click", async () => {
          if (row.dataset.previewMode === "document") {
            return;
          }
          const resource = resourceModel.catalogResources.find(
            (candidate) => candidate.id === row.dataset.selectedResource,
          );
          if (!resource) {
            return;
          }
          documentModeAction.disabled = true;
          try {
            await previewResource(row, resource);
            setStatus("Projeto aberto e pronto para uso.", "is-ready");
          } finally {
            documentModeAction.disabled = false;
          }
        });
      }

      if (annotationsModeAction) {
        annotationsModeAction.addEventListener("click", async () => {
          if (
            row.dataset.previewMode === "annotations"
            || row.dataset.previewSwitching === "true"
          ) {
            return;
          }
          const context = row.infoBimAnnotationContext;
          if (!annotationCapable(context)) {
            return;
          }
          row.dataset.previewSwitching = "true";
          const originalLabel = annotationsModeAction.textContent;
          annotationsModeAction.disabled = true;
          annotationsModeAction.classList.add("is-loading");
          annotationsModeAction.textContent = "Abrindo…";
          try {
            await showAnnotationsMode(row, context);
            setStatus("Projeto aberto e pronto para uso.", "is-ready");
          } catch (error) {
            const message = error instanceof Error
              ? error.message
              : String(error);
            annotationsModeAction.title = message;
            setStatus(
              `Não foi possível exibir as anotações: ${message}`,
              "is-error",
            );
            console.error(error);
          } finally {
            delete row.dataset.previewSwitching;
            annotationsModeAction.disabled = false;
            annotationsModeAction.classList.remove("is-loading");
            annotationsModeAction.textContent = originalLabel;
          }
        });
      }

      if (fullscreenAction) {
        fullscreenAction.addEventListener("click", () => {
          togglePreviewFullscreen(row);
        });
      }

      if (annotationAction) {
        annotationAction.addEventListener("click", async () => {
          if (row.dataset.annotationOpening === "true") {
            return;
          }
          const context = row.infoBimAnnotationContext;
          if (!annotationCapable(context)) {
            setStatus(
              "A anotação ainda não está disponível para este arquivo.",
              "is-error",
            );
            return;
          }

          row.dataset.annotationOpening = "true";
          const timeoutMilliseconds = 20000;
          const originalLabel = annotationAction.textContent;
          let timeoutId = null;
          annotationAction.disabled = true;
          annotationAction.classList.add("is-loading");
          annotationAction.textContent = "Abrindo…";
          setStatus("Preparando a anotação…", "");

          try {
            const spatialAnnotations = await ensureSpatialAnnotations();
            await exitPreviewFullscreen(row);
            context.onClose = async function () {
              if (row.dataset.selectedResource !== context.resource.id) {
                return;
              }
              try {
                await showAnnotationsMode(row, context);
                setStatus(
                  "Projeto aberto e pronto para uso.",
                  "is-ready",
                );
              } catch (error) {
                const message = error instanceof Error
                  ? error.message
                  : String(error);
                setStatus(
                  `Não foi possível exibir as anotações: ${message}`,
                  "is-error",
                );
              }
            };
            const timeout = new Promise(function (_resolve, reject) {
              timeoutId = window.setTimeout(function () {
                spatialAnnotations.cancelOpen();
                reject(new Error(
                  "A anotação não abriu dentro de 20 segundos.",
                ));
              }, timeoutMilliseconds);
            });
            await Promise.race([
              spatialAnnotations.open(context),
              timeout,
            ]);
            setStatus("Projeto aberto e pronto para uso.", "is-ready");
          } catch (error) {
            const message = error instanceof Error
              ? error.message
              : String(error);
            annotationAction.title = message;
            setStatus(
              `Não foi possível abrir a anotação: ${message}`,
              "is-error",
            );
            console.error(error);
          } finally {
            if (timeoutId !== null) {
              window.clearTimeout(timeoutId);
            }
            delete row.dataset.annotationOpening;
            annotationAction.disabled = false;
            annotationAction.classList.remove("is-loading");
            annotationAction.textContent = originalLabel;
          }
        });
      }

      if (propagateAction) {
        propagateAction.addEventListener("click", async () => {
          const resource = resourceModel.resources.find(
            (candidate) => candidate.id === row.dataset.selectedResource,
          );
          const nextRow = nextDimensionRow(row);
          if (
            !resource
            || !nextRow
            || !resourceIsRelatedToRow(row, resource)
          ) {
            configurePropagateAction(row, resource || null);
            return;
          }

          propagateAction.disabled = true;
          try {
            await updateRelationship(nextRow, resource, "add");
            configurePropagateAction(row, resource);
            if (nextRow.dataset.activeView === "related") {
              renderResourceTree(nextRow);
            }
            setStatus(
              `Arquivo relacionado também à dimensão ${dimensionDisplayName(nextRow)}.`,
              "is-ready",
            );
          } catch (error) {
            propagateAction.disabled = false;
            propagateAction.title =
              `Falha ao gravar relação: ${error.message}`;
            setStatus(propagateAction.title, "is-error");
          }
        });
      }

      toggles.forEach((toggle) => {