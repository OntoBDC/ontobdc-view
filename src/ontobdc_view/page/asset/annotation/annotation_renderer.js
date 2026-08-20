(function (global) {
  "use strict";

  if (!global.OntoBDCAnnotationModel) {
    throw new Error(
      "OntoBDCAnnotationModel must be loaded before annotation_renderer.js.",
    );
  }

  const model = global.OntoBDCAnnotationModel;
  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  const ICON_PATHS = Object.freeze({
    camera: [
      "M4 7h3l2-2h6l2 2h3v12H4Z",
      "M12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
    ],
    "video-camera": [
      "M3 6h12v12H3Z",
      "m15 10 6-3v10l-6-3Z",
    ],
    microphone: [
      "M9 4a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0Z",
      "M5 10v1a7 7 0 0 0 14 0v-1M12 18v3M9 21h6",
    ],
    receipt: [
      "M6 3h12v18l-3-2-3 2-3-2-3 2Z",
      "M9 8h6M9 12h6M9 16h4",
    ],
    document: [
      "M6 3h8l4 4v14H6Z",
      "M14 3v5h5M9 12h6M9 16h6",
    ],
    measurement: [
      "M4 17 17 4l3 3L7 20Z",
      "m12 7 2 2m-5 1 2 2m-5 1 2 2",
    ],
    attachment: [
      "m8 12 6.5-6.5a4 4 0 0 1 5.5 5.8l-8 8a6 6 0 0 1-8.5-8.5l8-8",
    ],
    "location-pin": [
      "M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z",
      "M12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
    ],
  });

  function svgElement(name) {
    return document.createElementNS(SVG_NAMESPACE, name);
  }

  function button(label, className) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    if (className) {
      element.className = className;
    }
    return element;
  }

  function markerUnit(width, height, ratio) {
    return Math.max(width, height) * ratio;
  }

  function annotationLabel(annotation, options) {
    const localName = model.localName(annotation.type);
    return options.categoryLabels[localName] || localName;
  }

  function spatialAnnotations(annotations, context, matchesContext) {
    return annotations.filter(function (annotation) {
      return Boolean(
        annotation.selector
        && matchesContext(annotation, context)
      );
    });
  }

  function anchorDescriptors(annotation, surface) {
    const selector = annotation.selector;
    if (selector.type === model.SELECTORS.PointSelector) {
      return selector.points.map(function (point, index) {
        return {
          key: String(index),
          x: point.x * surface.width,
          y: point.y * surface.height,
          normalizedX: point.x,
          normalizedY: point.y,
          box: null,
        };
      });
    }
    const box = {
      x: selector.x * surface.width,
      y: selector.y * surface.height,
      width: selector.width * surface.width,
      height: selector.height * surface.height,
    };
    return [{
      key: "box",
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      normalizedX: selector.x + selector.width / 2,
      normalizedY: selector.y + selector.height / 2,
      box: box,
    }];
  }

  function applyVisualStyle(shape, visual, prefix) {
    shape.classList.add(prefix + "-annotation-marker-shape");
    shape.setAttribute(
      "fill",
      visual.fillStyle === "none" ? "none" : visual.fill,
    );
    shape.setAttribute("fill-opacity", String(visual.fillOpacity));
    shape.setAttribute("stroke", visual.stroke);
    shape.setAttribute("stroke-width", String(visual.strokeWidth));
    shape.setAttribute("vector-effect", "non-scaling-stroke");
    if (visual.strokeDasharray) {
      shape.setAttribute("stroke-dasharray", visual.strokeDasharray);
    }
  }

  function iconElement(iconName, x, y, size, prefix) {
    const paths = ICON_PATHS[iconName];
    if (!paths) {
      return null;
    }
    const icon = svgElement("g");
    icon.classList.add(prefix + "-annotation-marker-icon");
    icon.setAttribute(
      "transform",
      "translate(" + (x - size / 2) + " " + (y - size / 2) + ") "
        + "scale(" + (size / 24) + ")",
    );
    paths.forEach(function (pathData) {
      const path = svgElement("path");
      path.setAttribute("d", pathData);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#ffffff");
      path.setAttribute("stroke-width", "1.8");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("vector-effect", "non-scaling-stroke");
      icon.appendChild(path);
    });
    return icon;
  }

  function pointShape(anchor, visual, unit, prefix) {
    let shape;
    if (visual.shape === "circle") {
      shape = svgElement("circle");
      shape.setAttribute("cx", String(anchor.x));
      shape.setAttribute("cy", String(anchor.y));
      shape.setAttribute("r", String(unit));
    } else if (visual.shape === "pin") {
      shape = svgElement("path");
      shape.setAttribute(
        "d",
        "M " + anchor.x + " " + anchor.y
          + " C " + (anchor.x - unit * 0.9) + " " + (anchor.y - unit)
          + " " + (anchor.x - unit * 1.4) + " " + (anchor.y - unit * 2)
          + " " + (anchor.x - unit * 1.4) + " " + (anchor.y - unit * 2.9)
          + " A " + (unit * 1.4) + " " + (unit * 1.4)
          + " 0 1 1 " + (anchor.x + unit * 1.4) + " "
          + (anchor.y - unit * 2.9)
          + " C " + (anchor.x + unit * 1.4) + " " + (anchor.y - unit * 2)
          + " " + (anchor.x + unit * 0.9) + " " + (anchor.y - unit)
          + " " + anchor.x + " " + anchor.y + " Z",
      );
    } else if (visual.shape === "badge") {
      shape = svgElement("rect");
      shape.setAttribute("x", String(anchor.x - unit * 1.45));
      shape.setAttribute("y", String(anchor.y - unit));
      shape.setAttribute("width", String(unit * 2.9));
      shape.setAttribute("height", String(unit * 2));
      shape.setAttribute("rx", String(unit * 0.55));
    } else {
      shape = svgElement("rect");
      shape.setAttribute("x", String(anchor.x - unit));
      shape.setAttribute("y", String(anchor.y - unit));
      shape.setAttribute("width", String(unit * 2));
      shape.setAttribute("height", String(unit * 2));
      if (visual.shape === "bounding_box") {
        shape.setAttribute("rx", String(unit * 0.12));
      }
    }
    applyVisualStyle(shape, visual, prefix);
    return shape;
  }

  function boundingBoxShape(anchor, visual, unit, prefix) {
    const box = anchor.box || {
      x: anchor.x - unit * 1.5,
      y: anchor.y - unit * 1.5,
      width: unit * 3,
      height: unit * 3,
    };
    const shape = svgElement("rect");
    shape.setAttribute("x", String(box.x));
    shape.setAttribute("y", String(box.y));
    shape.setAttribute("width", String(box.width));
    shape.setAttribute("height", String(box.height));
    shape.setAttribute("rx", String(Math.min(unit * 0.25, 8)));
    applyVisualStyle(shape, visual, prefix);
    return shape;
  }

  function createMarker(
    annotation,
    anchor,
    surface,
    visual,
    options,
    draft,
  ) {
    const unit = markerUnit(
      surface.width,
      surface.height,
      options.markerRatio,
    );
    const marker = svgElement("g");
    marker.classList.add(options.prefix + "-annotation-marker");
    marker.dataset.annotationId = annotation.id;
    marker.dataset.annotationType = model.localName(annotation.type);
    marker.dataset.visualProfile = visual.profileId;
    marker.dataset.visualShape = visual.shape;
    if (draft) {
      marker.classList.add("is-draft");
    }
    if (options.selectedId === annotation.id) {
      marker.classList.add("is-selected");
    }

    const shape = visual.shape === "bounding_box"
      ? boundingBoxShape(anchor, visual, unit, options.prefix)
      : pointShape(anchor, visual, unit, options.prefix);
    marker.appendChild(shape);

    if (visual.icon) {
      let iconY = anchor.y;
      let iconSize = unit * 1.25;
      if (visual.shape === "pin") {
        iconY = anchor.y - unit * 2.9;
        iconSize = unit * 1.45;
      }
      const icon = iconElement(
        visual.icon,
        anchor.x,
        iconY,
        iconSize,
        options.prefix,
      );
      if (icon) {
        marker.appendChild(icon);
      }
    }

    if (!draft) {
      marker.setAttribute("tabindex", "0");
      marker.setAttribute("role", "button");
      marker.setAttribute("aria-expanded", "false");
      marker.setAttribute(
        "aria-label",
        options.showAnnotationLabel
          + annotationLabel(annotation, options)
          + ": "
          + (annotation.body || options.emptyAnnotationLabel),
      );
      const title = svgElement("title");
      title.textContent = (
        annotationLabel(annotation, options)
        + ": "
        + (annotation.body || options.emptyAnnotationLabel)
      );
      marker.appendChild(title);
    }
    return marker;
  }

  function draftAnnotation(session, point, options) {
    return model.createNote({
      id: "urn:ontobdc:annotation:draft",
      body: "",
      logicalSource: session.context.logicalSource || "urn:ontobdc:draft",
      representationSource: (
        session.context.representationSource || "urn:ontobdc:draft"
      ),
      selector: {
        type: model.SELECTORS.PointSelector,
        sourceWidth: session.width,
        sourceHeight: session.height,
        points: [point],
      },
      properties: {
        markerColor: session.color.value || options.fallbackColor,
      },
      created: "2000-01-01T00:00:00.000Z",
    });
  }

  function bindSelection(marker, annotation, anchor, options) {
    const select = function (event) {
      event.stopPropagation();
      options.onSelect(annotation, anchor, marker);
    };
    marker.addEventListener("click", select);
    marker.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select(event);
      }
    });
  }

  function renderEditorMarkers(session, annotations, configuration) {
    const options = Object.assign({
      prefix: "ontobdc",
      markerRatio: 0.008,
      fallbackColor: "#67e8f9",
      showAnnotationLabel: "Show annotation: ",
      emptyAnnotationLabel: "Annotation without text.",
      categoryLabels: {},
      matchesContext: function () { return true; },
      onSelect: function () {},
      visualResolver: null,
      selectedId: session.selectedId,
    }, configuration || {});
    if (!options.visualResolver) {
      throw new TypeError("A visual resolver is required to render annotations.");
    }
    session.overlay.replaceChildren();
    spatialAnnotations(
      annotations,
      session.context,
      options.matchesContext,
    ).forEach(function (annotation) {
      const visual = options.visualResolver.resolve(annotation);
      anchorDescriptors(annotation, session).forEach(function (anchor) {
        const marker = createMarker(
          annotation,
          anchor,
          session,
          visual,
          options,
          false,
        );
        bindSelection(marker, annotation, anchor, options);
        session.overlay.appendChild(marker);
      });
    });

    if (!session.selectedId) {
      session.points.forEach(function (point) {
        const annotation = draftAnnotation(session, point, options);
        const visual = options.visualResolver.resolve(annotation);
        const anchor = anchorDescriptors(annotation, session)[0];
        session.overlay.appendChild(
          createMarker(
            annotation,
            anchor,
            session,
            visual,
            options,
            true,
          ),
        );
      });
    }
  }

  function renderPreview(context, annotations, surface, configuration) {
    const options = Object.assign({
      prefix: "ontobdc",
      markerRatio: 0.008,
      annotationLabel: "Annotation",
      emptyAnnotationLabel: "Annotation without text.",
      showAnnotationLabel: "Show annotation: ",
      closeLabel: "Close annotation",
      categoryLabels: {},
      matchesContext: function () { return true; },
      visualResolver: null,
      onSelect: function () {},
    }, configuration || {});
    if (!options.visualResolver) {
      throw new TypeError("A visual resolver is required to render annotations.");
    }
    const related = spatialAnnotations(
      annotations,
      context,
      options.matchesContext,
    );
    const stage = document.createElement("div");
    stage.className = options.prefix + "-annotation-preview-stage";
    stage.style.aspectRatio = surface.width + " / " + surface.height;
    surface.element.classList.add(options.prefix + "-annotation-preview-base");
    stage.appendChild(surface.element);

    const overlay = svgElement("svg");
    overlay.classList.add(options.prefix + "-annotation-preview-overlay");
    overlay.setAttribute(
      "viewBox",
      "0 0 " + surface.width + " " + surface.height,
    );
    overlay.setAttribute("preserveAspectRatio", "xMidYMid meet");

    let openMarker = null;
    const popover = document.createElement("aside");
    popover.className = options.prefix + "-annotation-popover";
    popover.hidden = true;
    popover.setAttribute("role", "status");
    const colorElement = document.createElement("span");
    colorElement.className = options.prefix + "-annotation-popover-color";
    colorElement.setAttribute("aria-hidden", "true");
    const copy = document.createElement("div");
    copy.className = options.prefix + "-annotation-popover-copy";
    const category = document.createElement("strong");
    const text = document.createElement("p");
    copy.append(category, text);
    const close = button("×", options.prefix + "-annotation-popover-close");
    close.setAttribute("aria-label", options.closeLabel);
    popover.append(colorElement, copy, close);

    function hidePopover() {
      popover.hidden = true;
      if (openMarker) {
        openMarker.classList.remove("is-selected");
        openMarker.setAttribute("aria-expanded", "false");
        openMarker = null;
      }
    }

    function showPopover(annotation, anchor, marker, visual) {
      if (openMarker === marker) {
        hidePopover();
        return;
      }
      hidePopover();
      openMarker = marker;
      marker.classList.add("is-selected");
      marker.setAttribute("aria-expanded", "true");
      category.textContent = annotationLabel(annotation, options);
      text.textContent = annotation.body || options.emptyAnnotationLabel;
      colorElement.style.backgroundColor = visual.color;
      popover.style.left = (anchor.normalizedX * 100) + "%";
      popover.style.top = (anchor.normalizedY * 100) + "%";
      popover.classList.toggle("opens-left", anchor.normalizedX > 0.62);
      popover.classList.toggle("opens-above", anchor.normalizedY > 0.62);
      popover.hidden = false;
    }

    related.forEach(function (annotation) {
      const visual = options.visualResolver.resolve(annotation);
      anchorDescriptors(annotation, surface).forEach(function (anchor) {
        const marker = createMarker(
          annotation,
          anchor,
          surface,
          visual,
          options,
          false,
        );
        bindSelection(marker, annotation, anchor, {
          onSelect: function () {
            showPopover(annotation, anchor, marker, visual);
            options.onSelect(annotation);
          },
        });
        overlay.appendChild(marker);
      });
    });

    popover.addEventListener("click", function (event) {
      event.stopPropagation();
    });
    close.addEventListener("click", hidePopover);
    stage.addEventListener("click", hidePopover);
    stage.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        hidePopover();
      }
    });
    stage.append(overlay, popover);
    return { element: stage, count: related.length };
  }

  global.OntoBDCAnnotationRenderer = Object.freeze({
    button: button,
    renderEditorMarkers: renderEditorMarkers,
    renderPreview: renderPreview,
  });
}(globalThis));
