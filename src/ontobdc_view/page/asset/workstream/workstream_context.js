(function (global) {
  "use strict";

  const defaultNamespace = "urn:ontobdc:workstream";

  function requiredValue(value, name) {
    const normalized = String(value == null ? "" : value).trim();
    if (!normalized) {
      throw new Error(name + " must not be empty.");
    }
    return normalized;
  }

  function encodedId(value) {
    return encodeURIComponent(requiredValue(value, "workStreamId"));
  }

  function buildWorkStreamUri(workStreamId, namespace) {
    return String(namespace || defaultNamespace).replace(/\/$/, "")
      + "/" + encodedId(workStreamId);
  }

  function buildDimensionBaseUri(workStreamId, namespace) {
    return buildWorkStreamUri(workStreamId, namespace) + "/dimension";
  }

  function normalizeDimension(value) {
    return requiredValue(value, "dimension")
      .toLowerCase()
      .replaceAll("_", "-");
  }

  function create(payload) {
    const source = payload && typeof payload === "object" ? payload : {};
    const workStreamId = requiredValue(
      source.workStreamId || source.elementId,
      "workStreamId",
    );
    const workStreamUri = String(
      source.workStreamUri
      || buildWorkStreamUri(workStreamId, defaultNamespace),
    );
    const dimensionBaseUri = String(
      source.dimensionBaseUri || workStreamUri + "/dimension",
    );

    function dimensionUri(dimension) {
      return dimensionBaseUri + "/"
        + encodeURIComponent(normalizeDimension(dimension));
    }

    function createAnnotationContext(context) {
      const value = context && typeof context === "object" ? context : {};
      const resource = value.resource && typeof value.resource === "object"
        ? value.resource
        : {};
      const representation = (
        value.representation
        && typeof value.representation === "object"
      ) ? value.representation : {};
      const dimension = value.dimensionUri
        || (value.dimension ? dimensionUri(value.dimension) : "");

      return {
        containerHandle: value.containerHandle,
        file: value.file,
        mediaType: value.mediaType,
        logicalSource: String(resource.id || value.logicalSource || ""),
        representationSource: String(
          representation.id || value.representationSource || "",
        ),
        dimension: String(dimension || ""),
        resourceName: String(
          resource.name || value.resourceName || "Resource",
        ),
        representationName: String(
          representation.name
          || value.representationName
          || resource.name
          || value.resourceName
          || "",
        ),
        previewElement: value.previewElement,
        onClose: value.onClose,
      };
    }

    return Object.freeze({
      workStreamId: workStreamId,
      workStreamUri: workStreamUri,
      dimensionBaseUri: dimensionBaseUri,
      resourceRelationshipNamespace: String(
        source.resourceRelationshipNamespace
        || "urn:ontobdc:linkset:workstream-resource",
      ),
      dimensionUri: dimensionUri,
      createAnnotationContext: createAnnotationContext,
    });
  }

  global.OntoBDCWorkStreamContext = Object.freeze({
    create: create,
    buildWorkStreamUri: buildWorkStreamUri,
    buildDimensionBaseUri: buildDimensionBaseUri,
  });
}(globalThis));
