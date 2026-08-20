(function (global) {
  "use strict";

  const EA = (
    "http://datacenter.app.br/ontology/productivity/entity/"
    + "enrichment_annotation/type.ttl#"
  );

  global.OntoBDCAnnotationVisualContract = Object.freeze({
    schemaVersion: 1,
    profiles: Object.freeze({
      [EA + "NoteAnnotation"]: Object.freeze({
        id: "note_visual_representation",
        shape: "square",
        borderStyle: "solid",
        borderTone: "theme",
        fillStyle: "solid",
        colorAuthority: "user",
        recommendedColorRole: null,
        issueStatusColors: Object.freeze({}),
        iconAuthority: "none",
        fixedIconName: null,
        recordKindIcons: Object.freeze({}),
      }),
      [EA + "IssueAnnotation"]: Object.freeze({
        id: "issue_visual_representation",
        shape: "circle",
        borderStyle: "solid",
        borderTone: "theme",
        fillStyle: "solid",
        colorAuthority: "issue_status",
        recommendedColorRole: null,
        issueStatusColors: Object.freeze({
          [EA + "Open"]: "danger",
          [EA + "InProgress"]: "warning",
          [EA + "Resolved"]: "success",
          [EA + "Closed"]: "neutral",
        }),
        iconAuthority: "none",
        fixedIconName: null,
        recordKindIcons: Object.freeze({}),
      }),
      [EA + "ClassificationAnnotation"]: Object.freeze({
        id: "classification_visual_representation",
        shape: "bounding_box",
        borderStyle: "dashed",
        borderTone: "light",
        fillStyle: "transparent",
        colorAuthority: "fixed",
        recommendedColorRole: "neutral",
        issueStatusColors: Object.freeze({}),
        iconAuthority: "none",
        fixedIconName: null,
        recordKindIcons: Object.freeze({}),
      }),
      [EA + "LocationAnnotation"]: Object.freeze({
        id: "location_visual_representation",
        shape: "pin",
        borderStyle: "none",
        borderTone: "theme",
        fillStyle: "solid",
        colorAuthority: "annotation_category",
        recommendedColorRole: "location",
        issueStatusColors: Object.freeze({}),
        iconAuthority: "fixed",
        fixedIconName: "location-pin",
        recordKindIcons: Object.freeze({}),
      }),
      [EA + "RecordAnnotation"]: Object.freeze({
        id: "record_visual_representation",
        shape: "badge",
        borderStyle: "solid",
        borderTone: "theme",
        fillStyle: "solid",
        colorAuthority: "annotation_category",
        recommendedColorRole: "neutral",
        issueStatusColors: Object.freeze({}),
        iconAuthority: "record_kind",
        fixedIconName: null,
        recordKindIcons: Object.freeze({
          [EA + "PhotoRecord"]: "camera",
          [EA + "VideoRecord"]: "video-camera",
          [EA + "AudioRecord"]: "microphone",
          [EA + "InvoiceRecord"]: "receipt",
          [EA + "DocumentRecord"]: "document",
          [EA + "MeasurementRecord"]: "measurement",
          [EA + "GenericRecord"]: "attachment",
        }),
      }),
    }),
  });
}(globalThis));
