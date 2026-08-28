(function (global) {
  "use strict";

  function required(name) {
    if (!global[name]) {
      throw new Error(name + " must be loaded before annotation_store.js.");
    }
    return global[name];
  }

  const model = required("OntoBDCAnnotationModel");

  function iri(value) {
    const source = String(value == null ? "" : value).trim();
    if (!source) {
      throw new TypeError("RDF IRI must not be empty.");
    }
    return "<" + encodeURI(source).replaceAll(">", "%3E") + ">";
  }

  function anyUriLiteral(value) {
    return model.literal(value) + "^^xsd:anyURI";
  }

  function dateTimeLiteral(value) {
    return model.literal(value) + "^^xsd:dateTime";
  }

  function decimalLiteral(value) {
    return model.literal(String(Number(value))) + "^^xsd:decimal";
  }

  function integerLiteral(value) {
    return model.literal(String(Number(value))) + "^^xsd:positiveInteger";
  }

  function motivationFor(type) {
    const types = model.TYPES;
    if (type === types.NoteAnnotation) {
      return "oa:commenting";
    }
    if (type === types.IssueAnnotation) {
      return "ea:raisingIssue";
    }
    if (type === types.ClassificationAnnotation) {
      return "oa:classifying";
    }
    if (type === types.LocationAnnotation) {
      return "ea:locating";
    }
    return "ea:recording";
  }

  function pointTarget(annotation, selector, point) {
    return [
      "[",
      "        a oa:SpecificResource ;",
      "        oa:hasSource "
        + anyUriLiteral(annotation.representationSource)
        + " ;",
      "        oa:hasSelector [",
      "            a ea:PointSelector ;",
      "            ea:sourceWidth "
        + integerLiteral(selector.sourceWidth)
        + " ;",
      "            ea:sourceHeight "
        + integerLiteral(selector.sourceHeight)
        + " ;",
      "            ea:normalizedX " + decimalLiteral(point.x) + " ;",
      "            ea:normalizedY " + decimalLiteral(point.y),
      "        ]",
      "    ]",
    ].join("\n");
  }

  function boundingBoxTarget(annotation, selector) {
    return [
      "[",
      "        a oa:SpecificResource ;",
      "        oa:hasSource "
        + anyUriLiteral(annotation.representationSource)
        + " ;",
      "        oa:hasSelector [",
      "            a ea:BoundingBoxSelector ;",
      "            ea:sourceWidth "
        + integerLiteral(selector.sourceWidth)
        + " ;",
      "            ea:sourceHeight "
        + integerLiteral(selector.sourceHeight)
        + " ;",
      "            ea:normalizedX " + decimalLiteral(selector.x) + " ;",
      "            ea:normalizedY " + decimalLiteral(selector.y) + " ;",
      "            ea:normalizedWidth "
        + decimalLiteral(selector.width)
        + " ;",
      "            ea:normalizedHeight "
        + decimalLiteral(selector.height),
      "        ]",
      "    ]",
    ].join("\n");
  }

  function targetObjects(annotation) {
    const selector = annotation.selector;
    if (!selector) {
      return [];
    }
    if (selector.type === model.SELECTORS.PointSelector) {
      return selector.points.map(function (point) {
        return pointTarget(annotation, selector, point);
      });
    }
    return [boundingBoxTarget(annotation, selector)];
  }

  function categoryPredicates(annotation) {
    const properties = annotation.properties;
    const predicates = [];

    if (annotation.type === model.TYPES.NoteAnnotation) {
      predicates.push(
        "ea:markerColor " + model.literal(properties.markerColor),
      );
      return predicates;
    }

    if (annotation.type === model.TYPES.IssueAnnotation) {
      predicates.push("ea:issueStatus " + iri(properties.issueStatus));
      predicates.push("ea:issueKind " + iri(properties.issueKind));
      if (properties.resolution) {
        predicates.push(
          "ea:resolution " + model.literal(properties.resolution),
        );
      }
      if (properties.resolvedAt) {
        predicates.push(
          "ea:resolvedAt " + dateTimeLiteral(properties.resolvedAt),
        );
      }
      return predicates;
    }

    if (annotation.type === model.TYPES.ClassificationAnnotation) {
      predicates.push("ea:classifiedAs " + iri(properties.classifiedAs));
      if (properties.classificationLabel) {
        predicates.push(
          "ea:classificationLabel "
            + model.literal(properties.classificationLabel),
        );
      }
      return predicates;
    }

    if (annotation.type === model.TYPES.LocationAnnotation) {
      predicates.push("ea:locationKind " + iri(properties.locationKind));
      if (properties.latitude != null) {
        predicates.push(
          "ea:latitude " + decimalLiteral(properties.latitude),
        );
      }
      if (properties.longitude != null) {
        predicates.push(
          "ea:longitude " + decimalLiteral(properties.longitude),
        );
      }
      if (properties.altitude != null) {
        predicates.push(
          "ea:altitude " + decimalLiteral(properties.altitude),
        );
      }
      if (properties.coordinateReferenceSystem) {
        predicates.push(
          "ea:coordinateReferenceSystem "
            + anyUriLiteral(properties.coordinateReferenceSystem),
        );
      }
      if (properties.relativeTo) {
        predicates.push("ea:relativeTo " + iri(properties.relativeTo));
      }
      if (properties.spatialRelation) {
        predicates.push(
          "ea:spatialRelation " + iri(properties.spatialRelation),
        );
      }
      return predicates;
    }

    predicates.push("ea:recordResource " + iri(properties.recordResource));
    predicates.push("ea:recordKind " + iri(properties.recordKind));
    if (properties.recordedAt) {
      predicates.push(
        "ea:recordedAt " + dateTimeLiteral(properties.recordedAt),
      );
    }
    if (properties.recordedBy) {
      predicates.push("ea:recordedBy " + iri(properties.recordedBy));
    }
    if (properties.evidenceFor) {
      predicates.push("ea:evidenceFor " + iri(properties.evidenceFor));
    }
    return predicates;
  }

  function serializeAnnotation(value) {
    const annotation = model.normalizeAnnotation(value);
    const predicates = [
      "a ea:" + model.localName(annotation.type),
      "oa:motivatedBy " + motivationFor(annotation.type),
      "ea:logicalSource " + anyUriLiteral(annotation.logicalSource),
      "dcterms:created " + dateTimeLiteral(annotation.created),
    ];

    if (annotation.annotatedBy) predicates.push("oa:annotatedBy " + iri(annotation.annotatedBy));
    predicates.push("oa:annotatedAt " + dateTimeLiteral(annotation.annotatedAt));
    if (annotation.modified) predicates.push("dcterms:modified " + dateTimeLiteral(annotation.modified));
    if (annotation.modifiedBy) predicates.push("ea:modifiedBy " + iri(annotation.modifiedBy));
    (annotation.assignedTo || []).forEach(function (person) {
      predicates.push("ea:assignedTo " + iri(person));
    });
    if (annotation.resolvedBy) predicates.push("ea:resolvedBy " + iri(annotation.resolvedBy));
    (annotation.threads || []).forEach(function (thread) {
      predicates.push("ea:thread " + iri(thread));
    });

    if (annotation.body) {
      predicates.push([
        "oa:hasBody [",
        "        a oa:TextualBody ;",
        "        rdf:value " + model.literal(annotation.body),
        "    ]",
      ].join("\n"));
    }
    if (annotation.representationSource) {
      predicates.push(
        "ea:representationSource "
          + anyUriLiteral(annotation.representationSource),
      );
    }
    if (annotation.representationHash) {
      predicates.push(
        "ea:representationHash "
          + model.literal(annotation.representationHash),
      );
    }
    if (annotation.relatedDimension) {
      predicates.push(
        "ea:relatedDimension "
          + anyUriLiteral(annotation.relatedDimension),
      );
    }

    targetObjects(annotation).forEach(function (target) {
      predicates.push("oa:hasTarget " + target);
    });
    predicates.push.apply(predicates, categoryPredicates(annotation));
    predicates.push(
      "ea:payload " + model.literal(JSON.stringify(annotation)),
    );

    return (
      iri(annotation.id)
      + " "
      + predicates.join(" ;\n    ")
      + " .\n"
    );
  }

  function parseAnnotations(source) {
    const text = String(source == null ? "" : source).trim();
    if (!text) {
      return [];
    }

    const payloads = [];
    const pattern = /ea:payload\s+("(?:\\.|[^"\\])*")/g;
    let match = pattern.exec(text);
    while (match) {
      const payload = JSON.parse(JSON.parse(match[1]));
      payloads.push(model.normalizeAnnotation(payload));
      match = pattern.exec(text);
    }

    if (payloads.length === 0) {
      throw new Error(
        "The annotation dataset does not contain supported schema payloads.",
      );
    }
    return payloads;
  }

  // Threads are named discussion topics an annotation can be filed under
  // (historically "subjects"). Their catalogue — id, label, description —
  // is persisted in the same .ttl as one JSON blob on a fixed subject, so
  // it round-trips the exact same way ea:payload does for annotations.
  const THREAD_CATALOG_SUBJECT = "urn:ontobdc:thread-catalog";
  const THREAD_CATALOG_PATTERN = /ea:threadCatalog\s+("(?:\\.|[^"\\])*")/;

  function normalizeThread(value) {
    const source = value && typeof value === "object" ? value : {};
    const id = String(source.id == null ? "" : source.id).trim();
    if (!id) {
      throw new TypeError("A thread must have an id.");
    }
    return {
      id: id,
      label: String(source.label == null ? "" : source.label).trim(),
      description: String(
        source.description == null ? "" : source.description,
      ).trim(),
      created: source.created || new Date().toISOString(),
    };
  }

  function parseThreads(source) {
    const text = String(source == null ? "" : source);
    const match = THREAD_CATALOG_PATTERN.exec(text);
    if (!match) {
      return [];
    }
    let parsed = [];
    try {
      parsed = JSON.parse(JSON.parse(match[1]));
    } catch (error) {
      return [];
    }
    if (!Array.isArray(parsed)) {
      return [];
    }
    const seen = new Set();
    const threads = [];
    parsed.forEach(function (entry) {
      const thread = normalizeThread(entry);
      if (seen.has(thread.id)) {
        return;
      }
      seen.add(thread.id);
      threads.push(thread);
    });
    return threads;
  }

  function serializeThreadCatalog(threads) {
    if (!threads || threads.length === 0) {
      return "";
    }
    return (
      iri(THREAD_CATALOG_SUBJECT)
      + " a ea:ThreadCatalog ;\n    ea:threadCatalog "
      + model.literal(JSON.stringify(threads.map(normalizeThread)))
      + " .\n"
    );
  }

  function createFileSystemStore(configuration) {
    const options = Object.assign({
      metadataDirectory: ".__ontobdc__",
      datasetDirectory: "dataset",
      datasetFileName: "EnrichmentAnnotation.ttl",
      ontologyNamespace: model.NAMESPACE,
      normalize: model.normalizeAnnotation,
      serializeAnnotation: serializeAnnotation,
    }, configuration || {});

    let annotations = [];
    let threads = [];
    let loadedContainer = null;
    let loadedRevision = null;

    async function revision(source) {
      const bytes = new TextEncoder().encode(source);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest), function (byte) {
        return byte.toString(16).padStart(2, "0");
      }).join("");
    }

    async function walkDirectory(rootHandle, path) {
      let directory = rootHandle;
      for (const segment of String(path).split("/").filter(Boolean)) {
        directory = await directory.getDirectoryHandle(segment, { create: true });
      }
      return directory;
    }

    async function datasetFileHandle(containerHandle) {
      const metadata = await walkDirectory(containerHandle, options.metadataDirectory);
      const dataset = await walkDirectory(metadata, options.datasetDirectory);
      return dataset.getFileHandle(options.datasetFileName, { create: true });
    }

    async function load(containerHandle, force) {
      if (!force && loadedContainer === containerHandle) {
        return annotations.slice();
      }
      const handle = await datasetFileHandle(containerHandle);
      const source = await (await handle.getFile()).text();
      annotations = /ea:payload\s+"/.test(source) ? parseAnnotations(source) : [];
      threads = parseThreads(source);
      loadedRevision = await revision(source);
      loadedContainer = containerHandle;
      return annotations.slice();
    }

    function serialize() {
      if (annotations.length === 0 && threads.length === 0) {
        return "";
      }
      const lines = [
        "@prefix ea: <" + options.ontologyNamespace + "> .",
        "@prefix oa: <http://www.w3.org/ns/oa#> .",
        "@prefix dcterms: <http://purl.org/dc/terms/> .",
        "@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .",
        "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .",
        "",
      ];
      const catalog = serializeThreadCatalog(threads);
      if (catalog) {
        lines.push(catalog);
      }
      annotations.forEach(function (annotation) {
        lines.push(options.serializeAnnotation(annotation));
      });
      return lines.join("\n") + "\n";
    }

    async function persist(containerHandle) {
      const handle = await datasetFileHandle(containerHandle);
      const previous = await (await handle.getFile()).text();
      const currentRevision = await revision(previous);
      if (loadedRevision && currentRevision !== loadedRevision) {
        throw new Error("The annotation dataset changed outside this page. Reload before saving.");
      }
      const next = serialize();
      if (annotations.length) parseAnnotations(next);
      let writable = null;
      try {
        writable = await handle.createWritable();
        await writable.write(next);
        await writable.close();
      } catch (error) {
        if (writable && typeof writable.abort === "function") {
          try { await writable.abort(); } catch (ignored) {}
        }
        throw error;
      }
      const verified = await (await handle.getFile()).text();
      if (verified !== next) {
        throw new Error("The annotation dataset could not be verified after writing.");
      }
      loadedRevision = await revision(verified);
      loadedContainer = containerHandle;
    }

    function list() {
      return annotations.slice();
    }

    function listThreads() {
      return threads.map(function (thread) {
        return Object.assign({}, thread);
      });
    }

    function upsertThread(value) {
      const thread = normalizeThread(value);
      const index = threads.findIndex(function (candidate) {
        return candidate.id === thread.id;
      });
      if (index >= 0) {
        threads[index] = thread;
      } else {
        threads.push(thread);
      }
      return Object.assign({}, thread);
    }

    function removeThread(threadId) {
      const size = threads.length;
      threads = threads.filter(function (thread) {
        return thread.id !== threadId;
      });
      return threads.length !== size;
    }

    function replace(values) {
      annotations = (Array.isArray(values) ? values : []).map(
        options.normalize,
      );
      return list();
    }

    function upsert(value) {
      const annotation = options.normalize(value);
      const index = annotations.findIndex(function (candidate) {
        return candidate.id === annotation.id;
      });
      if (index >= 0) {
        annotations[index] = annotation;
      } else {
        annotations.push(annotation);
      }
      return annotation;
    }

    function remove(annotationId) {
      const size = annotations.length;
      annotations = annotations.filter(function (annotation) {
        return annotation.id !== annotationId;
      });
      return annotations.length !== size;
    }

    return Object.freeze({
      load: load,
      list: list,
      listThreads: listThreads,
      persist: persist,
      remove: remove,
      removeThread: removeThread,
      replace: replace,
      serialize: serialize,
      upsert: upsert,
      upsertThread: upsertThread,
    });
  }

  global.OntoBDCAnnotationStore = Object.freeze({
    createFileSystemStore: createFileSystemStore,
    parseAnnotations: parseAnnotations,
    parseThreads: parseThreads,
    serializeAnnotation: serializeAnnotation,
  });
}(globalThis));
