(function (global) {
  "use strict";

  const model = global.OntoBDCAnnotationModel;
  const fields = global.OntoBDCAnnotationFieldFactory;
  if (!model || !fields) throw new Error("Annotation model and field factory are required.");

  const DEFINITIONS = Object.freeze({
    NoteAnnotation: {
      // Scoped down for the first real release: only single-point
      // placement. Select/Multiple points/Clear geometry (and every
      // other category) go back in once multi-shape/multi-category
      // annotation editing is revisited — see the tracking issue.
      tools: [
        "point",
        // "select",
        // "multiple-points",
        // "clear",
      ],
      fields: [
        { kind: "textarea", name: "body", label: "Body", required: true },
        { kind: "color", name: "markerColor", label: "Marker color", required: true, defaultValue: "#67e8f9" },
      ],
    },
    IssueAnnotation: {
      tools: ["select", "point", "bounding-box", "clear"],
      fields: [
        { kind: "textarea", name: "body", label: "Body", required: true },
        { kind: "select", name: "issueKind", label: "Issue kind", required: true, values: model.ISSUE_KINDS },
        { kind: "select", name: "issueStatus", label: "Issue status", required: true, values: model.ISSUE_STATUSES },
        { kind: "textarea", name: "resolution", label: "Resolution", conditional: "resolved" },
        { kind: "datetime", name: "resolvedAt", label: "Resolved at", conditional: "resolved" },
      ],
    },
    ClassificationAnnotation: {
      tools: ["select", "bounding-box", "clear"],
      fields: [
        { kind: "textarea", name: "body", label: "Body" },
        { kind: "uri", name: "classifiedAs", label: "Classified as", required: true },
        { kind: "text", name: "classificationLabel", label: "Classification label" },
      ],
    },
    LocationAnnotation: {
      tools: ["select", "point", "bounding-box", "clear"],
      fields: [
        { kind: "textarea", name: "body", label: "Body" },
        { kind: "select", name: "locationKind", label: "Location kind", required: true, values: model.LOCATION_KINDS },
        { kind: "number", name: "latitude", label: "Latitude", min: -90, max: 90, conditional: "geospatial" },
        { kind: "number", name: "longitude", label: "Longitude", min: -180, max: 180, conditional: "geospatial" },
        { kind: "number", name: "altitude", label: "Altitude", conditional: "geospatial" },
        { kind: "uri", name: "coordinateReferenceSystem", label: "Coordinate reference system", conditional: "geospatial" },
        { kind: "uri", name: "relativeTo", label: "Relative to", conditional: "relative" },
        { kind: "select", name: "spatialRelation", label: "Spatial relation", values: model.SPATIAL_RELATIONS, conditional: "relative" },
      ],
    },
    RecordAnnotation: {
      tools: ["select", "point", "bounding-box", "clear"],
      fields: [
        { kind: "textarea", name: "body", label: "Body" },
        { kind: "uri", name: "recordResource", label: "Record resource", required: true },
        { kind: "select", name: "recordKind", label: "Record kind", required: true, values: model.RECORD_KINDS },
        { kind: "datetime", name: "recordedAt", label: "Recorded at" },
        { kind: "uri", name: "recordedBy", label: "Recorded by" },
        { kind: "uri", name: "evidenceFor", label: "Evidence for" },
      ],
    },
  });

  function choices(values, labels) {
    return Object.keys(values).map(function (key) {
      return { value: values[key], label: (labels && labels[key]) || key };
    });
  }

  function factoryFor(field, labels) {
    const options = Object.assign({}, field, {
      label: (labels.fields && labels.fields[field.name]) || field.label,
      options: field.values ? choices(field.values, labels.values) : undefined,
    });
    if (field.kind === "textarea") return fields.textarea(options);
    if (field.kind === "select") return fields.select(options);
    if (field.kind === "uri") return fields.uri(options);
    if (field.kind === "datetime") return fields.datetime(options);
    if (field.kind === "number") return fields.number(options);
    if (field.kind === "color") return fields.color(options);
    return fields.text(options);
  }

  function createForm(category, configuration) {
    const options = Object.assign({ fields: {}, values: {} }, configuration || {});
    const definition = DEFINITIONS[category];
    if (!definition) throw new TypeError("Unsupported annotation category: " + category);
    const root = document.createElement("div");
    root.className = "ontobdc-annotation-form";
    const controls = {};
    const commonFields = [
      { kind: "text", name: "threads", label: "Threads" },
    ];
    const roleFields = category === "IssueAnnotation" ? [
      { kind: "text", name: "assignedTo", label: "Assigned to" },
      { kind: "uri", name: "resolvedBy", label: "Resolved by", conditional: "resolved" },
    ] : [];
    definition.fields.concat(roleFields, commonFields).forEach(function (field) {
      const control = factoryFor(field, options);
      controls[field.name] = control;
      if (field.defaultValue != null) control.setValue(field.defaultValue);
      root.appendChild(control.root);
    });

    function refresh() {
      function termName(control) {
        const value = control && control.getValue();
        return value ? model.localName(value) : "";
      }
      const status = termName(controls.issueStatus);
      const location = termName(controls.locationKind);
      definition.fields.concat(roleFields, commonFields).forEach(function (field) {
        if (!field.conditional) return;
        controls[field.name].root.hidden = !(
          (field.conditional === "resolved" && ["Resolved", "Closed"].includes(status))
          || (field.conditional === "geospatial" && location === "GeospatialLocation")
          || (field.conditional === "relative" && location === "RelativeLocation")
        );
      });
    }
    Object.values(controls).forEach(function (control) { control.input.addEventListener("change", refresh); });

    function read() {
      let valid = true;
      const values = {};
      definition.fields.concat(roleFields, commonFields).forEach(function (field) {
        const control = controls[field.name];
        if (!control.root.hidden && !control.validate()) valid = false;
        if (!control.root.hidden) values[field.name] = control.getValue();
      });
      if (!valid) throw new TypeError("The annotation form contains invalid fields.");
      const body = values.body || "";
      delete values.body;
      Object.keys(values).forEach(function (key) {
        if (values[key] === "" || values[key] == null) delete values[key];
      });
      const result = { body: body, properties: values };
      if (result.properties.threads) {
        result.threads = result.properties.threads.split(",").map(function (item) { return item.trim(); }).filter(Boolean);
        delete result.properties.threads;
      }
      if (result.properties.assignedTo) {
        result.assignedTo = result.properties.assignedTo.split(",").map(function (item) { return item.trim(); }).filter(Boolean);
        delete result.properties.assignedTo;
      }
      if (result.properties.resolvedBy) {
        result.resolvedBy = result.properties.resolvedBy;
        delete result.properties.resolvedBy;
      }
      return result;
    }

    function load(annotation) {
      controls.body.setValue(annotation.body || "");
      Object.keys(annotation.properties || {}).forEach(function (key) {
        if (controls[key]) controls[key].setValue(annotation.properties[key]);
      });
      if (controls.threads) controls.threads.setValue((annotation.threads || []).join(", "));
      if (controls.assignedTo) controls.assignedTo.setValue((annotation.assignedTo || []).join(", "));
      if (controls.resolvedBy) controls.resolvedBy.setValue(annotation.resolvedBy || "");
      refresh();
    }
    refresh();
    return Object.freeze({ root, controls, tools: definition.tools.slice(), read, load, refresh });
  }

  global.OntoBDCAnnotationFormRegistry = Object.freeze({
    categories: Object.keys(DEFINITIONS),
    definition: function (category) { return DEFINITIONS[category]; },
    createForm: createForm,
  });
}(globalThis));
