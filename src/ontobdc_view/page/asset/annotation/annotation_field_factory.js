(function (global) {
  "use strict";

  function createField(kind, configuration) {
    const options = Object.assign({
      name: "field",
      label: "Field",
      required: false,
      options: [],
      placeholder: "",
      step: "any",
    }, configuration || {});
    const root = document.createElement("label");
    root.className = "ontobdc-annotation-field";
    root.dataset.field = options.name;
    const label = document.createElement("span");
    label.className = "ontobdc-annotation-field-label";
    label.textContent = options.label;
    const input = kind === "textarea"
      ? document.createElement("textarea")
      : kind === "select"
        ? document.createElement("select")
        : document.createElement("input");
    if (kind !== "textarea" && kind !== "select") {
      input.type = kind;
    }
    input.name = options.name;
    input.required = Boolean(options.required);
    input.placeholder = options.placeholder;
    if (kind === "number") {
      input.step = options.step;
      if (options.min != null) input.min = String(options.min);
      if (options.max != null) input.max = String(options.max);
    }
    if (kind === "select") {
      if (!options.required) {
        input.appendChild(new Option(options.emptyLabel || "", ""));
      }
      options.options.forEach(function (item) {
        input.appendChild(new Option(item.label, item.value));
      });
    }
    const error = document.createElement("small");
    error.className = "ontobdc-annotation-field-error";
    error.hidden = true;
    root.append(label, input, error);

    function getValue() {
      if (kind === "number") {
        return input.value === "" ? null : Number(input.value);
      }
      return input.value.trim();
    }
    function setValue(value) {
      input.value = value == null ? "" : String(value);
    }
    function setError(message) {
      error.textContent = message || "";
      error.hidden = !message;
      input.setAttribute("aria-invalid", message ? "true" : "false");
    }
    function validate() {
      setError("");
      const value = getValue();
      if (options.required && (value === "" || value == null)) {
        setError(options.requiredMessage || options.label + " is required.");
        return false;
      }
      if (kind === "url" && value) {
        try { new URL(value); } catch (errorValue) {
          setError(options.uriMessage || options.label + " must be a valid URI.");
          return false;
        }
      }
      if (kind === "number" && value != null) {
        if (options.min != null && value < options.min) {
          setError(options.label + " must be at least " + options.min + ".");
          return false;
        }
        if (options.max != null && value > options.max) {
          setError(options.label + " must be at most " + options.max + ".");
          return false;
        }
      }
      return true;
    }
    return Object.freeze({ root, input, getValue, setValue, setError, validate });
  }

  function text(options) { return createField("text", options); }
  function textarea(options) { return createField("textarea", options); }
  function select(options) { return createField("select", options); }
  function uri(options) { return createField("url", options); }
  function datetime(options) { return createField("datetime-local", options); }
  function number(options) { return createField("number", options); }
  function color(options) { return createField("color", options); }
  function entityReference(options) { return uri(options); }

  function optional(field) {
    field.root.dataset.optional = "true";
    return field;
  }

  function conditionalGroup(configuration) {
    const options = Object.assign({ fields: [], visibleWhen: function () { return true; } }, configuration || {});
    const root = document.createElement("div");
    root.className = "ontobdc-annotation-conditional-group";
    options.fields.forEach(function (field) { root.appendChild(field.root); });
    function refresh(context) { root.hidden = !options.visibleWhen(context || {}); }
    return Object.freeze({ root, fields: options.fields, refresh });
  }

  global.OntoBDCAnnotationFieldFactory = Object.freeze({
    text, textarea, select, uri, datetime, number, color,
    entityReference, optional, conditionalGroup,
  });
}(globalThis));
