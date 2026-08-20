(function (global) {
  "use strict";

  const SCHEMA_VERSION = 3;
  const NAMESPACE = (
    "http://datacenter.app.br/ontology/productivity/entity/"
    + "enrichment_annotation/type.ttl#"
  );

  const TYPES = Object.freeze({
    NoteAnnotation: NAMESPACE + "NoteAnnotation",
    IssueAnnotation: NAMESPACE + "IssueAnnotation",
    ClassificationAnnotation: NAMESPACE + "ClassificationAnnotation",
    LocationAnnotation: NAMESPACE + "LocationAnnotation",
    RecordAnnotation: NAMESPACE + "RecordAnnotation",
  });

  const SELECTORS = Object.freeze({
    PointSelector: NAMESPACE + "PointSelector",
    BoundingBoxSelector: NAMESPACE + "BoundingBoxSelector",
  });

  const ISSUE_STATUSES = Object.freeze({
    Open: NAMESPACE + "Open",
    InProgress: NAMESPACE + "InProgress",
    Resolved: NAMESPACE + "Resolved",
    Closed: NAMESPACE + "Closed",
  });

  const ISSUE_KINDS = Object.freeze({
    Problem: NAMESPACE + "Problem",
    Question: NAMESPACE + "Question",
  });

  const LOCATION_KINDS = Object.freeze({
    GeospatialLocation: NAMESPACE + "GeospatialLocation",
    PositionalLocation: NAMESPACE + "PositionalLocation",
    RelativeLocation: NAMESPACE + "RelativeLocation",
    RepresentationLocation: NAMESPACE + "RepresentationLocation",
  });

  const SPATIAL_RELATIONS = Object.freeze({
    Inside: NAMESPACE + "Inside",
    Above: NAMESPACE + "Above",
    Below: NAMESPACE + "Below",
    Near: NAMESPACE + "Near",
    AdjacentTo: NAMESPACE + "AdjacentTo",
    Between: NAMESPACE + "Between",
  });

  const RECORD_KINDS = Object.freeze({
    PhotoRecord: NAMESPACE + "PhotoRecord",
    VideoRecord: NAMESPACE + "VideoRecord",
    AudioRecord: NAMESPACE + "AudioRecord",
    InvoiceRecord: NAMESPACE + "InvoiceRecord",
    DocumentRecord: NAMESPACE + "DocumentRecord",
    MeasurementRecord: NAMESPACE + "MeasurementRecord",
    GenericRecord: NAMESPACE + "GenericRecord",
  });

  function literal(value) {
    return JSON.stringify(String(value == null ? "" : value));
  }

  function makeUuid() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    if (global.crypto && typeof global.crypto.getRandomValues === "function") {
      global.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const value = Array.from(bytes, function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
    return [
      value.slice(0, 8),
      value.slice(8, 12),
      value.slice(12, 16),
      value.slice(16, 20),
      value.slice(20),
    ].join("-");
  }

  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  function sha256Fallback(bytes) {
    const maxWord = Math.pow(2, 32);
    const words = [];
    const hash = [];
    const constants = [];
    let primeCounter = 0;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate += 1) {
      if (!isComposite[candidate]) {
        for (
          let multiple = candidate * candidate;
          multiple < 312;
          multiple += candidate
        ) {
          isComposite[multiple] = true;
        }
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        constants[primeCounter] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
        primeCounter += 1;
      }
    }

    const data = Array.from(bytes);
    const bitLength = data.length * 8;
    data.push(0x80);
    while ((data.length % 64) !== 56) {
      data.push(0);
    }
    for (let shift = 56; shift >= 0; shift -= 8) {
      data.push(Math.floor(bitLength / Math.pow(2, shift)) & 0xff);
    }

    for (let offset = 0; offset < data.length; offset += 64) {
      for (let index = 0; index < 16; index += 1) {
        words[index] = (
          (data[offset + index * 4] << 24)
          | (data[offset + index * 4 + 1] << 16)
          | (data[offset + index * 4 + 2] << 8)
          | data[offset + index * 4 + 3]
        );
      }
      for (let index = 16; index < 64; index += 1) {
        const value15 = words[index - 15];
        const value2 = words[index - 2];
        const sigma0 = (
          rightRotate(value15, 7)
          ^ rightRotate(value15, 18)
          ^ (value15 >>> 3)
        );
        const sigma1 = (
          rightRotate(value2, 17)
          ^ rightRotate(value2, 19)
          ^ (value2 >>> 10)
        );
        words[index] = (
          words[index - 16]
          + sigma0
          + words[index - 7]
          + sigma1
        ) | 0;
      }

      const working = hash.slice(0, 8);
      for (let index = 0; index < 64; index += 1) {
        const e = working[4];
        const a = working[0];
        const sum1 = (
          rightRotate(e, 6)
          ^ rightRotate(e, 11)
          ^ rightRotate(e, 25)
        );
        const choice = (e & working[5]) ^ (~e & working[6]);
        const temporary1 = (
          working[7]
          + sum1
          + choice
          + constants[index]
          + words[index]
        ) | 0;
        const sum0 = (
          rightRotate(a, 2)
          ^ rightRotate(a, 13)
          ^ rightRotate(a, 22)
        );
        const majority = (
          (a & working[1])
          ^ (a & working[2])
          ^ (working[1] & working[2])
        );
        const temporary2 = (sum0 + majority) | 0;
        working.pop();
        working.unshift((temporary1 + temporary2) | 0);
        working[4] = (working[4] + temporary1) | 0;
      }
      for (let index = 0; index < 8; index += 1) {
        hash[index] = (hash[index] + working[index]) | 0;
      }
    }

    return hash.map(function (value) {
      return (value >>> 0).toString(16).padStart(8, "0");
    }).join("");
  }

  async function digest(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (
      global.crypto
      && global.crypto.subtle
      && typeof global.crypto.subtle.digest === "function"
    ) {
      const value = await global.crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(value), function (byte) {
        return byte.toString(16).padStart(2, "0");
      }).join("");
    }
    return sha256Fallback(bytes);
  }

  function requiredString(value, fieldName) {
    const normalized = String(value == null ? "" : value).trim();
    if (!normalized) {
      throw new TypeError(fieldName + " must not be empty.");
    }
    return normalized;
  }

  function optionalString(value) {
    const normalized = String(value == null ? "" : value).trim();
    return normalized || null;
  }

  function requiredDateTime(value, fieldName) {
    const source = requiredString(value, fieldName);
    const date = new Date(source);
    if (Number.isNaN(date.getTime())) {
      throw new TypeError(fieldName + " must be a valid date-time.");
    }
    return date.toISOString();
  }

  function optionalDateTime(value, fieldName) {
    const source = optionalString(value);
    return source ? requiredDateTime(source, fieldName) : null;
  }

  function expandTerm(value, values, fieldName) {
    const source = requiredString(value, fieldName);
    if (Object.prototype.hasOwnProperty.call(values, source)) {
      return values[source];
    }
    if (Object.values(values).includes(source)) {
      return source;
    }
    throw new TypeError(fieldName + " has an unsupported value: " + source);
  }

  function localName(value) {
    const source = requiredString(value, "IRI");
    const hashIndex = source.lastIndexOf("#");
    const slashIndex = source.lastIndexOf("/");
    return source.slice(Math.max(hashIndex, slashIndex) + 1);
  }

  function finiteNumber(value, fieldName) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
      throw new TypeError(fieldName + " must be a finite number.");
    }
    return normalized;
  }

  function normalizedNumber(value, fieldName) {
    const normalized = finiteNumber(value, fieldName);
    if (normalized < 0 || normalized > 1) {
      throw new RangeError(fieldName + " must be between zero and one.");
    }
    return normalized;
  }

  function sourceDimension(value, fieldName) {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized <= 0) {
      throw new RangeError(fieldName + " must be a positive integer.");
    }
    return normalized;
  }

  function normalizePoint(value, index) {
    if (!value || typeof value !== "object") {
      throw new TypeError("selector.points[" + index + "] must be an object.");
    }
    return {
      x: normalizedNumber(value.x, "selector.points[" + index + "].x"),
      y: normalizedNumber(value.y, "selector.points[" + index + "].y"),
    };
  }

  function normalizeSelector(value) {
    if (value == null) {
      return null;
    }
    if (typeof value !== "object") {
      throw new TypeError("selector must be an object or null.");
    }
    const type = expandTerm(value.type, SELECTORS, "selector.type");
    const sourceWidth = sourceDimension(
      value.sourceWidth,
      "selector.sourceWidth",
    );
    const sourceHeight = sourceDimension(
      value.sourceHeight,
      "selector.sourceHeight",
    );

    if (type === SELECTORS.PointSelector) {
      if (!Array.isArray(value.points) || value.points.length === 0) {
        throw new TypeError(
          "PointSelector requires at least one normalized point.",
        );
      }
      return {
        type: type,
        sourceWidth: sourceWidth,
        sourceHeight: sourceHeight,
        points: value.points.map(normalizePoint),
      };
    }

    const x = normalizedNumber(value.x, "selector.x");
    const y = normalizedNumber(value.y, "selector.y");
    const width = normalizedNumber(value.width, "selector.width");
    const height = normalizedNumber(value.height, "selector.height");
    if (width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
      throw new RangeError(
        "BoundingBoxSelector must define a positive box inside the source.",
      );
    }
    return {
      type: type,
      sourceWidth: sourceWidth,
      sourceHeight: sourceHeight,
      x: x,
      y: y,
      width: width,
      height: height,
    };
  }

  function normalizeProperties(type, value) {
    const properties = value && typeof value === "object" ? value : {};

    if (type === TYPES.NoteAnnotation) {
      return {
        markerColor: requiredString(
          properties.markerColor,
          "properties.markerColor",
        ),
      };
    }

    if (type === TYPES.IssueAnnotation) {
      return {
        issueStatus: expandTerm(
          properties.issueStatus,
          ISSUE_STATUSES,
          "properties.issueStatus",
        ),
        issueKind: expandTerm(
          properties.issueKind,
          ISSUE_KINDS,
          "properties.issueKind",
        ),
        resolution: optionalString(properties.resolution),
        resolvedAt: optionalDateTime(
          properties.resolvedAt,
          "properties.resolvedAt",
        ),
      };
    }

    if (type === TYPES.ClassificationAnnotation) {
      return {
        classifiedAs: requiredString(
          properties.classifiedAs,
          "properties.classifiedAs",
        ),
        classificationLabel: optionalString(
          properties.classificationLabel,
        ),
      };
    }

    if (type === TYPES.LocationAnnotation) {
      const latitude = properties.latitude == null
        ? null
        : finiteNumber(properties.latitude, "properties.latitude");
      const longitude = properties.longitude == null
        ? null
        : finiteNumber(properties.longitude, "properties.longitude");
      const altitude = properties.altitude == null
        ? null
        : finiteNumber(properties.altitude, "properties.altitude");
      if (latitude != null && (latitude < -90 || latitude > 90)) {
        throw new RangeError("properties.latitude must be between -90 and 90.");
      }
      if (longitude != null && (longitude < -180 || longitude > 180)) {
        throw new RangeError(
          "properties.longitude must be between -180 and 180.",
        );
      }
      return {
        locationKind: expandTerm(
          properties.locationKind,
          LOCATION_KINDS,
          "properties.locationKind",
        ),
        latitude: latitude,
        longitude: longitude,
        altitude: altitude,
        coordinateReferenceSystem: optionalString(
          properties.coordinateReferenceSystem,
        ),
        relativeTo: optionalString(properties.relativeTo),
        spatialRelation: properties.spatialRelation == null
          ? null
          : expandTerm(
            properties.spatialRelation,
            SPATIAL_RELATIONS,
            "properties.spatialRelation",
          ),
      };
    }

    return {
      recordResource: requiredString(
        properties.recordResource,
        "properties.recordResource",
      ),
      recordKind: expandTerm(
        properties.recordKind,
        RECORD_KINDS,
        "properties.recordKind",
      ),
      recordedAt: optionalDateTime(
        properties.recordedAt,
        "properties.recordedAt",
      ),
      recordedBy: optionalString(properties.recordedBy),
      evidenceFor: optionalString(properties.evidenceFor),
    };
  }

  function normalizeAnnotation(value) {
    if (!value || typeof value !== "object") {
      throw new TypeError("annotation must be an object.");
    }
    const sourceVersion = Number(value.schemaVersion);
    if (![2, SCHEMA_VERSION].includes(sourceVersion)) {
      throw new TypeError(
        "annotation.schemaVersion must be 2 or " + SCHEMA_VERSION + ".",
      );
    }
    const type = expandTerm(value.type, TYPES, "annotation.type");
    const selector = normalizeSelector(value.selector);
    const representationSource = optionalString(value.representationSource);
    if (selector && !representationSource) {
      throw new TypeError(
        "annotation.representationSource is required for visual selectors.",
      );
    }
    const threadValues = sourceVersion === 2
      ? (value.threads || value.subjects || [])
      : (value.threads || []);
    return {
      schemaVersion: SCHEMA_VERSION,
      id: requiredString(value.id, "annotation.id"),
      type: type,
      body: String(value.body == null ? "" : value.body),
      logicalSource: requiredString(
        value.logicalSource,
        "annotation.logicalSource",
      ),
      representationSource: representationSource,
      representationHash: optionalString(value.representationHash),
      relatedDimension: optionalString(value.relatedDimension),
      selector: selector,
      properties: normalizeProperties(type, value.properties),
      created: requiredDateTime(value.created, "annotation.created"),
      annotatedBy: optionalString(value.annotatedBy),
      annotatedAt: requiredDateTime(value.annotatedAt || value.created, "annotation.annotatedAt"),
      modified: optionalDateTime(value.modified, "annotation.modified"),
      modifiedBy: optionalString(value.modifiedBy),
      assignedTo: Array.from(new Set((value.assignedTo || []).map(function (item) {
        return requiredString(item, "annotation.assignedTo");
      }))),
      resolvedBy: optionalString(value.resolvedBy),
      threads: Array.from(new Set(threadValues.map(function (item) {
        return requiredString(item, "annotation.threads");
      }))),
    };
  }

  function createAnnotation(type, value) {
    const source = value && typeof value === "object" ? value : {};
    return normalizeAnnotation(Object.assign({}, source, {
      schemaVersion: SCHEMA_VERSION,
      id: source.id || "urn:ontobdc:annotation:" + makeUuid(),
      type: type,
      created: source.created || new Date().toISOString(),
      annotatedAt: source.annotatedAt || source.created || new Date().toISOString(),
    }));
  }

  function createNote(value) {
    return createAnnotation(TYPES.NoteAnnotation, value);
  }

  function isType(annotation, type) {
    if (!annotation || !annotation.type) {
      return false;
    }
    return annotation.type === expandTerm(type, TYPES, "annotation type");
  }

  function pointSelector(annotation) {
    if (
      !annotation
      || !annotation.selector
      || annotation.selector.type !== SELECTORS.PointSelector
    ) {
      return null;
    }
    return annotation.selector;
  }

  function matchesContext(annotation, context) {
    return Boolean(
      annotation
      && context
      && annotation.logicalSource === context.logicalSource
      && annotation.representationSource === context.representationSource
    );
  }

  global.OntoBDCAnnotationModel = Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION,
    NAMESPACE: NAMESPACE,
    TYPES: TYPES,
    SELECTORS: SELECTORS,
    ISSUE_STATUSES: ISSUE_STATUSES,
    ISSUE_KINDS: ISSUE_KINDS,
    LOCATION_KINDS: LOCATION_KINDS,
    SPATIAL_RELATIONS: SPATIAL_RELATIONS,
    RECORD_KINDS: RECORD_KINDS,
    createAnnotation: createAnnotation,
    createNote: createNote,
    digest: digest,
    isType: isType,
    literal: literal,
    localName: localName,
    makeUuid: makeUuid,
    matchesContext: matchesContext,
    normalizeAnnotation: normalizeAnnotation,
    pointSelector: pointSelector,
  });
}(globalThis));