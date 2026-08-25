    ro_crate_text = ro_crate_path.read_text(encoding="utf-8").strip()
    ro_crate = json.loads(ro_crate_text) if ro_crate_text else {"@graph": []}
except FileNotFoundError:
    ro_crate = {"@graph": []}

catalog_resources = []
resources = []
for item in ro_crate.get("@graph", []):
    resource_id = item.get("@id")
    types = set(text_values(item, "@type"))
    if not resource_id or resource_id in (".", "./"):
        continue
    if not types.intersection({
        "File", "MediaObject", "DigitalDocument",
        "CreativeWork", "Message", "EmailMessage",
    }):
        continue
    names = text_values(item, "name")
    formats = text_values(item, "encodingFormat")
    category = category_for(item, resource_id)
    display_parts = [
        unquote(part)
        for part in resource_id.split("/")
        if part
    ]
    catalog_resource = {
        "id": resource_id,
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
if resource_linkset_path.exists():
    resource_linkset = Graph()
    resource_linkset.parse(resource_linkset_path, format="turtle")
    resource_ids = {item["id"] for item in resources}

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
            (value for value in endpoint_strings if value in resource_ids),
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
`);
      const result = JSON.parse(String(resultProxy));
      if (resultProxy && typeof resultProxy.destroy === "function") {
        resultProxy.destroy();
      }
      renderWorkStream(result.record);
      resourceModel = {
        resources: result.resources || [],
        catalogResources: result.catalogResources || [],
        relationships: result.relationships || {},
      };
      document.querySelectorAll(".five-w-two-h-row").forEach((row) => {
        if (row.dataset.activeResource) {
          renderResourceTree(row);
        }
      });
      setStatus(
        `Projeto aberto: ${containerHandle.name}. Dados carregados.`,
        "is-ready",
      );
      openButton.textContent = "Reabrir projeto";
      updateButton.disabled = false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(
        message.includes("datapackage.json")
          ? "O projeto selecionado não possui um datapackage.json acessível."
          : message,
        "is-error",
      );
    } finally {
      openButton.disabled = false;
    }
  }

  async function updateProject() {
    updateButton.disabled = true;
    openButton.disabled = true;
    setStatus("Atualizando os arquivos do projeto...", "");
    try {
      const fileCount = await synchronizeProjectManifest();
      setStatus(
        `${fileCount} arquivo(s) catalogado(s). Recarregando o projeto...`,
        "",
      );
      await openContainer();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message, "is-error");
    } finally {
      openButton.disabled = false;
      updateButton.disabled = !activeContainerHandle;
    }
  }

  document.addEventListener("fullscreenchange", () => {
    document.querySelectorAll(".five-w-two-h-row").forEach(
      updateFullscreenAction,
    );
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    document.querySelectorAll(
      ".workstream-resource-preview.is-fullscreen-fallback",
    ).forEach((previewPane) => {
      const row = previewPane.closest(".five-w-two-h-row");
      if (row) {
        exitPreviewFullscreen(row);
      }
    });
  });

  openButton.addEventListener("click", openContainer);
  updateButton.addEventListener("click", updateProject);
  configureResourcePanels();
}());