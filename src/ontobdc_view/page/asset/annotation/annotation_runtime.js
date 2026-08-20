(function (global) {
  "use strict";

  function required(name) {
    if (!global[name]) throw new Error(name + " must be loaded before annotation_runtime.js.");
    return global[name];
  }
  const model = required("OntoBDCAnnotationModel");
  const stores = required("OntoBDCAnnotationStore");
  const surfaces = required("OntoBDCAnnotationSurface");
  const visualResolvers = required("OntoBDCAnnotationVisualResolver");
  const renderer = required("OntoBDCAnnotationRenderer");
  const editorFactory = required("OntoBDCAnnotationEditor");
  const geometryFactory = required("OntoBDCAnnotationGeometryController");
  const lifecycle = required("OntoBDCAnnotationLifecycle");
  const workspaceFactory = required("OntoBDCAnnotationWorkspace");
  const subjectPageFactory = required("OntoBDCSubjectPage");

  // Generated from ontobdc/i18n/locale/*.yaml ("annotation" namespace) —
  // keep in sync by hand; there is no browser-side YAML fetch/build step
  // in this package, so the YAML files are the canonical authored source
  // and this table is their compiled runtime copy.
  const LABELS_BY_LOCALE = {"en":{"annotation":"Annotation","emptyAnnotation":"Annotation without text.","showAnnotation":"Show annotation: ","closeAnnotation":"Close annotation","previewUnavailable":"The preview area is not available.","openCancelled":"Opening the annotation was cancelled.","application":"OntoBDC Annotation","resource":"Resource","dialog":"Annotate representation","close":"Close","category":"Category","newAnnotation":"New annotation","delete":"Delete","save":"Save","saved":"Saved","invalidGeometry":"The selected geometry is not valid for this annotation category.","saveError":"The annotation could not be saved.","field":"Field","legend":"Legend","total":"Total","openIssues":"Open issues","inProgressIssues":"In progress","resolvedIssues":"Resolved","withoutGeometry":"Without geometry","withoutThread":"Without Thread","open":"Open","unassigned":"Unassigned subjects","unlabeled":"Unlabeled subject","subjects":"Subjects","subject":"Subject","annotationsStat":"Annotations","categoriesStat":"Categories","peopleStat":"People","resourcesStat":"Resources","rangeStat":"Range","views":"Subject views","space":"Space","timeline":"Timeline","people":"People","withoutPosition":"Without spatial position","spatialGroup":"Spatial group","empty":"No annotations.","author":"Author","modifier":"Modifier","resolver":"Resolver","recorder":"Recorder","assignee":"Assignee","categoryLabels":{"NoteAnnotation":"Note","IssueAnnotation":"Issue","ClassificationAnnotation":"Classification","LocationAnnotation":"Location","RecordAnnotation":"Record"},"toolLabels":{"select":"Select","point":"Point","multiple-points":"Multiple points","bounding-box":"Bounding box","clear":"Clear geometry"}},"pt-BR":{"annotation":"Anotação","emptyAnnotation":"Anotação sem texto.","showAnnotation":"Mostrar anotação: ","closeAnnotation":"Fechar anotação","previewUnavailable":"A área de pré-visualização não está disponível.","openCancelled":"A abertura da anotação foi cancelada.","application":"Anotação OntoBDC","resource":"Recurso","dialog":"Anotar representação","close":"Fechar","category":"Categoria","newAnnotation":"Nova anotação","delete":"Excluir","save":"Salvar","saved":"Salvo","invalidGeometry":"A geometria selecionada não é válida para esta categoria de anotação.","saveError":"Não foi possível salvar a anotação.","field":"Campo","legend":"Legenda","total":"Total","openIssues":"Problemas abertos","inProgressIssues":"Em andamento","resolvedIssues":"Resolvidos","withoutGeometry":"Sem geometria","withoutThread":"Sem tópico","open":"Abrir","unassigned":"Assuntos não atribuídos","unlabeled":"Assunto sem rótulo","subjects":"Assuntos","subject":"Assunto","annotationsStat":"Anotações","categoriesStat":"Categorias","peopleStat":"Pessoas","resourcesStat":"Recursos","rangeStat":"Período","views":"Visões do assunto","space":"Espaço","timeline":"Linha do tempo","people":"Pessoas","withoutPosition":"Sem posição espacial","spatialGroup":"Grupo espacial","empty":"Nenhuma anotação.","author":"Autor","modifier":"Modificador","resolver":"Resolvedor","recorder":"Registrador","assignee":"Responsável","categoryLabels":{"NoteAnnotation":"Nota","IssueAnnotation":"Problema","ClassificationAnnotation":"Classificação","LocationAnnotation":"Localização","RecordAnnotation":"Registro"},"toolLabels":{"select":"Selecionar","point":"Ponto","multiple-points":"Múltiplos pontos","bounding-box":"Caixa delimitadora","clear":"Limpar geometria"}},"pt-PT":{"annotation":"Anotação","emptyAnnotation":"Anotação sem texto.","showAnnotation":"Mostrar anotação: ","closeAnnotation":"Fechar anotação","previewUnavailable":"A área de pré-visualização não está disponível.","openCancelled":"A abertura da anotação foi cancelada.","application":"Anotação OntoBDC","resource":"Recurso","dialog":"Anotar representação","close":"Fechar","category":"Categoria","newAnnotation":"Nova anotação","delete":"Eliminar","save":"Guardar","saved":"Guardado","invalidGeometry":"A geometria selecionada não é válida para esta categoria de anotação.","saveError":"Não foi possível guardar a anotação.","field":"Campo","legend":"Legenda","total":"Total","openIssues":"Problemas em aberto","inProgressIssues":"Em curso","resolvedIssues":"Resolvidos","withoutGeometry":"Sem geometria","withoutThread":"Sem tópico","open":"Abrir","unassigned":"Assuntos não atribuídos","unlabeled":"Assunto sem etiqueta","subjects":"Assuntos","subject":"Assunto","annotationsStat":"Anotações","categoriesStat":"Categorias","peopleStat":"Pessoas","resourcesStat":"Recursos","rangeStat":"Período","views":"Vistas do assunto","space":"Espaço","timeline":"Linha temporal","people":"Pessoas","withoutPosition":"Sem posição espacial","spatialGroup":"Grupo espacial","empty":"Sem anotações.","author":"Autor","modifier":"Modificador","resolver":"Resolvedor","recorder":"Registador","assignee":"Responsável","categoryLabels":{"NoteAnnotation":"Nota","IssueAnnotation":"Problema","ClassificationAnnotation":"Classificação","LocationAnnotation":"Localização","RecordAnnotation":"Registo"},"toolLabels":{"select":"Selecionar","point":"Ponto","multiple-points":"Múltiplos pontos","bounding-box":"Caixa delimitadora","clear":"Limpar geometria"}},"es":{"annotation":"Anotación","emptyAnnotation":"Anotación sin texto.","showAnnotation":"Mostrar anotación: ","closeAnnotation":"Cerrar anotación","previewUnavailable":"El área de vista previa no está disponible.","openCancelled":"Se canceló la apertura de la anotación.","application":"Anotación OntoBDC","resource":"Recurso","dialog":"Anotar representación","close":"Cerrar","category":"Categoría","newAnnotation":"Nueva anotación","delete":"Eliminar","save":"Guardar","saved":"Guardado","invalidGeometry":"La geometría seleccionada no es válida para esta categoría de anotación.","saveError":"No se pudo guardar la anotación.","field":"Campo","legend":"Leyenda","total":"Total","openIssues":"Problemas abiertos","inProgressIssues":"En progreso","resolvedIssues":"Resueltos","withoutGeometry":"Sin geometría","withoutThread":"Sin hilo","open":"Abrir","unassigned":"Asuntos no asignados","unlabeled":"Asunto sin etiqueta","subjects":"Asuntos","subject":"Asunto","annotationsStat":"Anotaciones","categoriesStat":"Categorías","peopleStat":"Personas","resourcesStat":"Recursos","rangeStat":"Rango","views":"Vistas del asunto","space":"Espacio","timeline":"Línea de tiempo","people":"Personas","withoutPosition":"Sin posición espacial","spatialGroup":"Grupo espacial","empty":"Sin anotaciones.","author":"Autor","modifier":"Modificador","resolver":"Resolutor","recorder":"Registrador","assignee":"Responsable","categoryLabels":{"NoteAnnotation":"Nota","IssueAnnotation":"Problema","ClassificationAnnotation":"Clasificación","LocationAnnotation":"Ubicación","RecordAnnotation":"Registro"},"toolLabels":{"select":"Seleccionar","point":"Punto","multiple-points":"Múltiples puntos","bounding-box":"Cuadro delimitador","clear":"Limpiar geometría"}}};

  function localeLabels() {
    const lang = document.documentElement.lang || document.documentElement.dataset.language || "en";
    return LABELS_BY_LOCALE[lang] || LABELS_BY_LOCALE.en;
  }

  function createRuntime(configuration) {
    const options = Object.assign({ prefix: "ontobdc", bodyOpenClass: "has-annotation-dialog", normalizeContext: function (v) { return v; }, store: {}, surface: {}, visual: {}, labels: {} }, configuration || {});
    options.labels = Object.assign(
      { fieldLabels: {}, valueLabels: {} },
      localeLabels(),
      options.labels || {},
    );
    const store = stores.createFileSystemStore(options.store);
    const visualResolver = visualResolvers.createResolver(options.visual);
    const previewSurfaces = new WeakMap();
    let dialog = null; let dialogRelease = null; let dialogOnClose = null; let openGeneration = 0;

    function normalizeContext(raw) {
      const value = options.normalizeContext(raw || {});
      if (!value || !value.containerHandle) throw new Error("An annotation context with a container handle is required.");
      return value;
    }
    function ensureOpenIsActive(generation, surface) {
      if (generation === openGeneration) return;
      if (surface && surface.release) surface.release();
      throw new DOMException(options.labels.openCancelled, "AbortError");
    }
    function cancelOpen() { openGeneration += 1; }
    function close() {
      const onClose = dialogOnClose; dialogOnClose = null;
      if (dialogRelease) { dialogRelease(); dialogRelease = null; }
      if (dialog) { dialog.remove(); dialog = null; }
      document.body.classList.remove(options.bodyOpenClass);
      if (onClose) Promise.resolve(onClose()).catch(console.error);
    }
    function clearPreview(raw) {
      const context = raw && options.normalizeContext(raw); const preview = context && context.previewElement;
      if (!preview) return;
      const release = previewSurfaces.get(preview); if (release) { release(); previewSurfaces.delete(preview); }
    }
    function matchesContext(annotation, context) { return model.matchesContext(annotation, context); }

    async function showPreview(raw) {
      const context = normalizeContext(raw); const preview = context.previewElement;
      if (!preview) throw new Error(options.labels.previewUnavailable);
      clearPreview(raw); await store.load(context.containerHandle);
      const surface = await surfaces.createSurface(context, Object.assign({ surfaceClass: options.prefix + "-annotation-image" }, options.surface));
      const result = renderer.renderPreview(context, store.list(), surface, {
        prefix: options.prefix, annotationLabel: options.labels.annotation, emptyAnnotationLabel: options.labels.emptyAnnotation,
        showAnnotationLabel: options.labels.showAnnotation, closeLabel: options.labels.closeAnnotation,
        categoryLabels: options.labels.categoryLabels, matchesContext: matchesContext, visualResolver: visualResolver,
      });
      preview.replaceChildren(result.element); previewSurfaces.set(preview, surface.release); return result.count;
    }

    function validateGeometry(category, selector, hasRepresentation, properties) {
      const type = selector && model.localName(selector.type);
      if (category === "NoteAnnotation" && hasRepresentation && type !== "PointSelector") return false;
      if (category === "ClassificationAnnotation" && hasRepresentation && type !== "BoundingBoxSelector") return false;
      if (category === "LocationAnnotation") {
        const locationKind = model.localName(properties.locationKind);
        if (locationKind === "RepresentationLocation" && type !== "PointSelector") return false;
        if (locationKind === "GeospatialLocation" && (properties.latitude == null || properties.longitude == null)) return false;
        if (locationKind === "RelativeLocation" && (!properties.relativeTo || !properties.spatialRelation)) return false;
      }
      if (category === "LocationAnnotation" && selector && !["PointSelector", "BoundingBoxSelector"].includes(type)) return false;
      if (category === "RecordAnnotation" && selector && !["PointSelector", "BoundingBoxSelector"].includes(type)) return false;
      if (category === "IssueAnnotation" && selector && !["PointSelector", "BoundingBoxSelector"].includes(type)) return false;
      return true;
    }

    async function open(raw) {
      const context = normalizeContext(raw); const generation = ++openGeneration;
      await store.load(context.containerHandle); ensureOpenIsActive(generation);
      const surface = await surfaces.createSurface(context, Object.assign({ surfaceClass: options.prefix + "-annotation-image" }, options.surface));
      ensureOpenIsActive(generation, surface);
      const representationHash = await model.digest(context.file); ensureOpenIsActive(generation, surface); close();
      const editor = editorFactory.createEditor(context, surface, {
        prefix: options.prefix, applicationLabel: options.labels.application, resourceLabel: options.labels.resource,
        dialogLabel: options.labels.dialog, categoryLabel: options.labels.category, closeLabel: options.labels.close,
        newLabel: options.labels.newAnnotation, deleteLabel: options.labels.delete, saveLabel: options.labels.save,
        categoryLabels: options.labels.categoryLabels, toolLabels: options.labels.toolLabels,
        fieldLabels: options.labels.fieldLabels, valueLabels: options.labels.valueLabels,
      });
      document.body.appendChild(editor.root); document.body.classList.add(options.bodyOpenClass);
      dialog = editor.root; dialogRelease = surface.release; dialogOnClose = typeof context.onClose === "function" ? context.onClose : null;
      const session = { context: context, width: surface.width, height: surface.height, overlay: editor.annotationOverlay, selectedId: null, points: [], color: { value: options.store.defaultColor || "#67e8f9" } };
      const geometry = geometryFactory.createController(editor.stage, editor.geometryOverlay, { sourceWidth: surface.width, sourceHeight: surface.height });

      function renderAnnotations() {
        renderer.renderEditorMarkers(session, store.list(), {
          prefix: options.prefix, categoryLabels: options.labels.categoryLabels, matchesContext: matchesContext,
          visualResolver: visualResolver, showAnnotationLabel: options.labels.showAnnotation, emptyAnnotationLabel: options.labels.emptyAnnotation,
          onSelect: selectAnnotation,
        });
      }
      // setTools() (inside editor.setCategory()) always marks "select" as
      // the pressed tool in the toolbar, but geometry's own internal mode
      // is never touched by category changes — it just keeps whatever a
      // previous toolbar click last set it to (e.g. "point", from creating
      // the last annotation). That mismatch — toolbar visually showing
      // "Select" active while the controller is still actually in "point"
      // mode — is why dragging an existing marker's handle (which only
      // works when mode is really "select") silently stopped doing
      // anything after switching tools once.
      function syncToolbarMode(tool) {
        const button = editor.toolbar.querySelector('[data-geometry-tool="' + tool + '"]');
        if (!button) return;
        editor.toolbar.querySelectorAll("[data-geometry-tool]").forEach(function (item) { item.setAttribute("aria-pressed", String(item === button)); });
        geometry.setMode(tool);
      }
      let saveToastTimer = null;
      function showSavedToast() {
        let toast = editor.root.querySelector("." + options.prefix + "-annotation-toast");
        if (!toast) {
          toast = document.createElement("div");
          toast.className = options.prefix + "-annotation-toast";
          toast.setAttribute("role", "status");
          editor.root.appendChild(toast);
        }
        toast.textContent = options.labels.saved || "Saved";
        toast.classList.remove("is-visible");
        void toast.offsetWidth; // restart the transition if a toast is already showing
        toast.classList.add("is-visible");
        if (saveToastTimer) clearTimeout(saveToastTimer);
        saveToastTimer = setTimeout(function () { toast.classList.remove("is-visible"); }, 2200);
      }
      function reset() {
        session.selectedId = null; editor.lockCategory(false); editor.setCategory("NoteAnnotation"); editor.deleteButton.disabled = true; editor.showError(""); geometry.clear(); renderAnnotations();
        syncToolbarMode("point");
      }
      function selectAnnotation(annotation) {
        session.selectedId = annotation.id; const category = model.localName(annotation.type);
        const form = editor.setCategory(category); form.load(annotation); editor.lockCategory(true); editor.deleteButton.disabled = false;
        geometry.setSelector(annotation.selector); renderAnnotations();
        syncToolbarMode("select");
      }
      editor.root.addEventListener("ontobdc:categorychange", function () { geometry.clear(); editor.showError(""); });
      editor.toolbar.addEventListener("click", function (event) {
        const button = event.target.closest("[data-geometry-tool]"); if (!button) return;
        const tool = button.dataset.geometryTool;
        if (tool === "clear") geometry.clear(); else geometry.setMode(tool);
        editor.toolbar.querySelectorAll("[data-geometry-tool]").forEach(function (item) { item.setAttribute("aria-pressed", String(item === button)); });
      });
      editor.closeButton.addEventListener("click", close); editor.newButton.addEventListener("click", reset);
      editor.saveButton.addEventListener("click", async function () {
        editor.showError("");
        try {
          const category = editor.category.value; const values = editor.getForm().read(); const selector = geometry.getSelector();
          if (!validateGeometry(category, selector, Boolean(context.representationSource), values.properties)) throw new TypeError(options.labels.invalidGeometry);
          const existing = store.list().find(function (item) { return item.id === session.selectedId; });
          let annotation = model.createAnnotation(model.TYPES[category], {
            id: existing && existing.id, created: existing && existing.created, body: values.body,
            logicalSource: context.logicalSource, representationSource: context.representationSource || null,
            representationHash: context.representationSource ? representationHash : null,
            relatedDimension: context.dimension || null, selector: selector, properties: values.properties,
            subjects: values.subjects || (existing && existing.subjects) || [],
            assignedTo: values.assignedTo || (existing && existing.assignedTo) || [],
            resolvedBy: values.resolvedBy || (existing && existing.resolvedBy) || null,
            annotatedBy: existing && existing.annotatedBy,
            annotatedAt: existing && existing.annotatedAt,
            modified: existing && existing.modified,
            modifiedBy: existing && existing.modifiedBy,
          });
          annotation = model.normalizeAnnotation(lifecycle.apply(annotation, context, existing));
          store.upsert(annotation); await store.persist(context.containerHandle); selectAnnotation(annotation);
          showSavedToast();
        } catch (error) { editor.showError((error && error.message) || options.labels.saveError); }
      });
      editor.deleteButton.addEventListener("click", async function () {
        if (!session.selectedId) return; store.remove(session.selectedId); await store.persist(context.containerHandle); reset();
      });
      // geometry's internal mode defaults to "select" (see
      // annotation_geometry_controller.js), which used to match the
      // toolbar's own default pressed state when "select" was a real,
      // visible tool. Now that "select" is commented out of every
      // category's tool list, nothing ever switches mode away from it
      // on a fresh open, so clicking the stage silently did nothing.
      // reset() (via syncToolbarMode) puts both the toolbar and the
      // controller in "point" mode from the start.
      reset();
    }

    async function openWorkspace(element, raw, configuration) {
      const context = normalizeContext(raw);
      await store.load(context.containerHandle);
      const workspace = workspaceFactory.create(Object.assign({
        annotations: store.list(),
        visualResolver: visualResolver,
        labels: options.labels,
        onOpen: function (annotation) {
          if (context.openAnnotation) context.openAnnotation(annotation);
        },
      }, configuration || {}));
      element.replaceChildren(workspace.root);
      return workspace;
    }
    async function openSubjectPage(element, raw, subjectUri, configuration) {
      const context = normalizeContext(raw);
      await store.load(context.containerHandle);
      const page = subjectPageFactory.create(Object.assign({
        annotations: store.list(),
        subjectUri: subjectUri || null,
        labels: options.labels,
        onOpen: function (annotation) {
          if (context.openAnnotation) context.openAnnotation(annotation);
        },
      }, configuration || {}));
      element.replaceChildren(page.root);
      return page;
    }
    document.addEventListener("keydown", function (event) { if (event.key === "Escape" && dialog) close(); });
    return Object.freeze({
      cancelOpen, clearPreview, close, decoratePreview: showPreview, open, showPreview,
      openWorkspace, openSubjectPage, listAnnotations: store.list,
    });
  }

  global.OntoBDCAnnotations = Object.freeze({ createRuntime: createRuntime });
}(globalThis));
