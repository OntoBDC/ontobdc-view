(function (global) {
  "use strict";

  function text(value) { return String(value == null ? "" : value).trim(); }
  function uri(value, field) {
    const result = text(value);
    if (!result) return null;
    try { new URL(result); } catch (error) {
      if (!result.startsWith("urn:")) throw new TypeError(field + " must be a valid URI.");
    }
    return result;
  }
  function unique(values, field) {
    return Array.from(new Set((values || []).map(function (value) {
      return uri(value, field);
    }).filter(Boolean)));
  }
  function apply(annotation, context, previous) {
    const now = new Date().toISOString();
    const actor = context && context.actorContext ? context.actorContext : {};
    const result = Object.assign({}, annotation);
    result.annotatedBy = previous ? previous.annotatedBy : uri(actor.actorUri, "actorContext.actorUri");
    result.annotatedAt = previous ? previous.annotatedAt : (annotation.annotatedAt || annotation.created || now);
    result.modified = previous ? now : (annotation.modified || null);
    result.modifiedBy = previous ? uri(actor.actorUri, "actorContext.actorUri") : (annotation.modifiedBy || null);
    result.threads = unique(annotation.threads, "thread");
    result.assignedTo = unique(annotation.assignedTo, "assignedTo");
    result.resolvedBy = uri(annotation.resolvedBy, "resolvedBy");
    return result;
  }
  function events(annotation) {
    const result = [{ type: "created", at: annotation.annotatedAt || annotation.created, actor: annotation.annotatedBy }];
    if (annotation.modified) result.push({ type: "modified", at: annotation.modified, actor: annotation.modifiedBy });
    if (annotation.properties && annotation.properties.recordedAt) result.push({ type: "recorded", at: annotation.properties.recordedAt, actor: annotation.properties.recordedBy });
    if (annotation.properties && annotation.properties.resolvedAt) result.push({ type: "resolved", at: annotation.properties.resolvedAt, actor: annotation.resolvedBy });
    return result.filter(function (event) { return event.at; });
  }
  global.OntoBDCAnnotationLifecycle = Object.freeze({
    apply: apply,
    events: events,
    uniqueUris: function (values) { return unique(values, "URI"); },
  });
}(globalThis));
