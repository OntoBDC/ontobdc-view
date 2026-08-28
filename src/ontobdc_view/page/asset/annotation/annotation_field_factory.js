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

  // A multi-select combobox over the known thread catalogue, with an
  // inline "new thread" panel (name + description). getValue()/setValue()
  // speak arrays of thread ids so it drops straight into the form's
  // existing threads plumbing.
  function threadSelect(configuration) {
    const options = Object.assign({
      name: "threads",
      label: "Threads",
      threads: [],
      onCreate: null,
      labels: {},
    }, configuration || {});
    const root = document.createElement("label");
    root.className = "ontobdc-annotation-field ontobdc-annotation-thread-field";
    root.dataset.field = options.name;
    const label = document.createElement("span");
    label.className = "ontobdc-annotation-field-label";
    label.textContent = options.label;

    const input = document.createElement("select");
    input.multiple = true;
    input.size = 4;
    input.name = options.name;
    input.className = "ontobdc-annotation-thread-select";

    function optionFor(thread) {
      const item = new Option(
        thread.label || thread.id,
        thread.id,
        false,
        false,
      );
      if (thread.description) item.title = thread.description;
      return item;
    }
    (options.threads || []).forEach(function (thread) {
      input.appendChild(optionFor(thread));
    });

    const newButton = document.createElement("button");
    newButton.type = "button";
    newButton.className = "ontobdc-annotation-thread-new";
    newButton.textContent = options.labels.newThread || "New thread";

    const panel = document.createElement("div");
    panel.className = "ontobdc-annotation-thread-create";
    panel.hidden = true;
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = options.labels.threadName || "Name";
    nameInput.className = "ontobdc-annotation-thread-create-name";
    const descriptionInput = document.createElement("input");
    descriptionInput.type = "text";
    descriptionInput.placeholder = options.labels.threadDescription
      || "Description";
    descriptionInput.className = "ontobdc-annotation-thread-create-description";
    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "ontobdc-annotation-thread-create-confirm";
    confirmButton.textContent = options.labels.createThread || "Create";
    panel.append(nameInput, descriptionInput, confirmButton);

    const error = document.createElement("small");
    error.className = "ontobdc-annotation-field-error";
    error.hidden = true;
    root.append(label, input, newButton, panel, error);

    function setError(message) {
      error.textContent = message || "";
      error.hidden = !message;
      input.setAttribute("aria-invalid", message ? "true" : "false");
    }

    newButton.addEventListener("click", function () {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) nameInput.focus();
    });

    confirmButton.addEventListener("click", async function () {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      if (typeof options.onCreate !== "function") return;
      confirmButton.disabled = true;
      try {
        const thread = await options.onCreate(name, descriptionInput.value.trim());
        if (thread && thread.id) {
          let existing = Array.prototype.find.call(input.options, function (item) {
            return item.value === thread.id;
          });
          if (!existing) {
            existing = optionFor(thread);
            input.appendChild(existing);
          }
          existing.selected = true;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        nameInput.value = "";
        descriptionInput.value = "";
        panel.hidden = true;
        setError("");
      } catch (creationError) {
        setError((creationError && creationError.message) || String(creationError));
      } finally {
        confirmButton.disabled = false;
      }
    });

    function getValue() {
      return Array.prototype.filter.call(input.options, function (item) {
        return item.selected;
      }).map(function (item) { return item.value; });
    }
    function setValue(value) {
      const wanted = Array.isArray(value)
        ? value
        : value == null || value === "" ? [] : [value];
      wanted.forEach(function (id) {
        const found = Array.prototype.find.call(input.options, function (item) {
          return item.value === id;
        });
        if (!found) input.appendChild(new Option(id, id, false, false));
      });
      Array.prototype.forEach.call(input.options, function (item) {
        item.selected = wanted.indexOf(item.value) >= 0;
      });
    }
    function validate() { setError(""); return true; }

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
    text, textarea, select, uri, datetime, number, color, threadSelect,
    entityReference, optional, conditionalGroup,
  });
}(globalThis));
