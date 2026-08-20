(function (global) {
  "use strict";

  if (!global.OntoBDCAnnotations) {
    throw new Error(
      "OntoBDCAnnotations must be loaded before workstream_annotations.js.",
    );
  }
  if (!global.OntoBDCWorkStreamContext) {
    throw new Error(
      "OntoBDCWorkStreamContext must be loaded before workstream_annotations.js.",
    );
  }
  if (!global.OntoBDCAnnotationVisualContract) {
    throw new Error(
      "OntoBDCAnnotationVisualContract must be loaded before workstream_annotations.js.",
    );
  }

  const payload = global.ontoBDCWorkStreamView || {};
  const options = payload.annotationRuntime
    && typeof payload.annotationRuntime === "object"
    ? payload.annotationRuntime
    : {};
  const visualOptions = options.visual
    && typeof options.visual === "object"
    ? options.visual
    : {};
  const workStreamContext = global.OntoBDCWorkStreamContext.create(payload);

  global.OntoBDCWorkStreamAnnotations = global.OntoBDCAnnotations.createRuntime({
    prefix: String(options.prefix || "workstream"),
    bodyOpenClass: String(options.bodyOpenClass || "has-annotation-dialog"),
    normalizeContext: workStreamContext.createAnnotationContext,
    store: Object.assign({
      datasetFileName: "EnrichmentAnnotation.ttl",
      defaultColor: "#67e8f9",
    }, options.store || {}),
    surface: Object.assign({
      imageAlt: "Annotatable representation",
      imageLoadError: "The image representation could not be loaded.",
      unsupportedError: (
        "This format does not have an annotatable representation."
      ),
    }, options.surface || {}),
    visual: {
      contract: (
        visualOptions.contract || global.OntoBDCAnnotationVisualContract
      ),
      theme: Object.assign({}, visualOptions.theme || {}),
    },
    labels: Object.assign({
      annotation: "Annotation",
      emptyAnnotation: "Annotation without text.",
      showAnnotation: "Show annotation: ",
      closeAnnotation: "Close annotation",
      categoryLabels: {
        NoteAnnotation: "Note",
        IssueAnnotation: "Issue",
        ClassificationAnnotation: "Classification",
        LocationAnnotation: "Location",
        RecordAnnotation: "Record",
      },
      note: "Note",
      previewUnavailable: "The preview area is not available.",
      openCancelled: "Opening the annotation was cancelled.",
      application: "OntoBDC Annotation",
      resource: "Resource",
      dialog: "Annotate resource",
      close: "Close",
      instructions: (
        "Click the representation to place one or more points "
        + "for the same note."
      ),
      placeholder: "Write the note...",
      text: "Note text",
      color: "Color",
      newNote: "New note",
      delete: "Delete",
      save: "Save",
    }, options.labels || {}),
  });
}(globalThis));
