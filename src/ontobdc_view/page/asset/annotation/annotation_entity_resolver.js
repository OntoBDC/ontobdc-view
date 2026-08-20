(function (global) {
  "use strict";

  function create(configuration) {
    const options = Object.assign({ search: null, resolve: null }, configuration || {});
    if (typeof options.search !== "function" || typeof options.resolve !== "function") {
      throw new TypeError("entityResolver requires search(query, context) and resolve(uri, context).");
    }
    async function search(query, context) {
      const result = await options.search(String(query || ""), Object.assign({}, context || {}));
      if (!Array.isArray(result)) throw new TypeError("entityResolver.search must return an array.");
      return result.map(normalize);
    }
    async function resolve(uri, context) {
      const result = await options.resolve(String(uri || ""), Object.assign({}, context || {}));
      return result ? normalize(result) : null;
    }
    return Object.freeze({ search: search, resolve: resolve });
  }

  function normalize(entity) {
    if (!entity || typeof entity.uri !== "string" || !entity.uri.trim()) {
      throw new TypeError("Resolved entities require a URI.");
    }
    return Object.freeze({
      uri: entity.uri.trim(),
      label: String(entity.label || entity.uri),
      description: entity.description == null ? null : String(entity.description),
      type: entity.type == null ? null : String(entity.type),
      metadata: Object.assign({}, entity.metadata || {})
    });
  }

  global.OntoBDCEntityResolver = Object.freeze({ create: create, normalize: normalize });
}(globalThis));
