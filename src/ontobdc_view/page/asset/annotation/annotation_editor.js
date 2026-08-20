(function (global) {
  "use strict";

  const renderer = global.OntoBDCAnnotationRenderer;
  const registry = global.OntoBDCAnnotationFormRegistry;
  if (!renderer || !registry) throw new Error("Renderer and form registry are required.");

  function createEditor(context, surface, configuration) {
    const options = Object.assign({
      prefix: "ontobdc", applicationLabel: "OntoBDC Annotation", resourceLabel: "Resource",
      dialogLabel: "Annotate representation", categoryLabel: "Category", closeLabel: "Close",
      newLabel: "New annotation", deleteLabel: "Delete", saveLabel: "Save",
      categoryLabels: {}, toolLabels: {}, fieldLabels: {}, valueLabels: {},
    }, configuration || {});
    const root = document.createElement("section");
    root.className = options.prefix + "-annotation-dialog";
    root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", options.dialogLabel);
    const header = document.createElement("header"); header.className = options.prefix + "-annotation-header";
    const heading = document.createElement("div");
    const eyebrow = document.createElement("span"); eyebrow.textContent = options.applicationLabel;
    const title = document.createElement("strong"); title.textContent = context.resourceName || options.resourceLabel;
    heading.append(eyebrow, title);
    const closeButton = renderer.button(options.closeLabel); header.append(heading, closeButton);

    const workspace = document.createElement("div"); workspace.className = options.prefix + "-annotation-workspace";
    const scroller = document.createElement("div"); scroller.className = options.prefix + "-annotation-stage-scroller";
    const stage = document.createElement("div"); stage.className = options.prefix + "-annotation-stage"; stage.style.aspectRatio = surface.width + " / " + surface.height;
    stage.appendChild(surface.element);
    function svg(className) {
      const value = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      value.classList.add(className); value.setAttribute("viewBox", "0 0 " + surface.width + " " + surface.height); value.setAttribute("preserveAspectRatio", "xMidYMid meet");
      return value;
    }
    const annotationOverlay = svg(options.prefix + "-annotation-overlay");
    const geometryOverlay = svg(options.prefix + "-annotation-geometry-overlay");
    stage.append(annotationOverlay, geometryOverlay); scroller.appendChild(stage);

    const side = document.createElement("aside"); side.className = options.prefix + "-annotation-editor";
    const categoryLabel = document.createElement("label"); categoryLabel.className = options.prefix + "-annotation-category-label"; categoryLabel.textContent = options.categoryLabel;
    const category = document.createElement("select"); category.setAttribute("aria-label", options.categoryLabel);
    registry.categories.forEach(function (name) { category.appendChild(new Option(options.categoryLabels[name] || name.replace("Annotation", ""), name)); });
    categoryLabel.appendChild(category);
    // Category choice is hidden for the first real release: every
    // annotation is created as a plain NoteAnnotation. The <select>
    // and its options above are left intact (not removed) so the full
    // multi-category picker can be restored later — see the tracking
    // issue referenced from annotation_form_registry.js. An inline
    // style (not the `hidden` attribute) is used because
    // annotation_editor.css's `.ontobdc-annotation-category-label`
    // rule sets `display: flex`, which as an author-origin rule wins
    // over the UA `[hidden] { display: none }` default regardless of
    // source order.
    categoryLabel.style.display = "none";
    const toolbar = document.createElement("div"); toolbar.className = options.prefix + "-annotation-geometry-toolbar"; toolbar.setAttribute("role", "toolbar");
    const formHost = document.createElement("div");
    const error = document.createElement("div"); error.className = options.prefix + "-annotation-form-error"; error.hidden = true; error.setAttribute("role", "alert");
    const actions = document.createElement("div"); actions.className = options.prefix + "-annotation-actions";
    const newButton = renderer.button(options.newLabel); const deleteButton = renderer.button(options.deleteLabel); deleteButton.disabled = true;
    const saveButton = renderer.button(options.saveLabel, "is-primary"); actions.append(newButton, deleteButton, saveButton);
    side.append(categoryLabel, toolbar, formHost, error, actions); workspace.append(scroller, side); root.append(header, workspace);

    let form = null;
    function setTools(tools) {
      toolbar.replaceChildren();
      tools.forEach(function (tool) {
        const button = renderer.button(options.toolLabels[tool] || tool);
        button.type = "button"; button.dataset.geometryTool = tool; button.setAttribute("aria-pressed", String(tool === "select"));
        toolbar.appendChild(button);
      });
    }
    function setCategory(name) {
      category.value = name;
      form = registry.createForm(name, { fields: options.fieldLabels, values: options.valueLabels });
      formHost.replaceChildren(form.root); setTools(form.tools);
      return form;
    }
    function showError(message) { error.textContent = message || ""; error.hidden = !message; }
    function lockCategory(value) { category.disabled = Boolean(value); }
    category.addEventListener("change", function () { setCategory(category.value); root.dispatchEvent(new CustomEvent("ontobdc:categorychange", { detail: { category: category.value } })); });
    setCategory(registry.categories[0]);

    return Object.freeze({
      root, closeButton, stage, annotationOverlay, geometryOverlay, category, toolbar,
      newButton, deleteButton, saveButton, getForm: function () { return form; },
      setCategory, lockCategory, showError,
    });
  }

  global.OntoBDCAnnotationEditor = Object.freeze({ createEditor: createEditor });
}(globalThis));
