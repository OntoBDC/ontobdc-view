(function (global) {
  "use strict";

  if (!global.OntoBDCAnnotationModel) {
    throw new Error(
      "OntoBDCAnnotationModel must be loaded before annotation_visual_resolver.js.",
    );
  }

  const model = global.OntoBDCAnnotationModel;
  const SUPPORTED_SHAPES = new Set([
    "square",
    "circle",
    "bounding_box",
    "pin",
    "badge",
  ]);
  const SUPPORTED_BORDER_STYLES = new Set([
    "solid",
    "dashed",
    "dotted",
    "none",
  ]);
  const SUPPORTED_FILL_STYLES = new Set([
    "solid",
    "transparent",
    "none",
  ]);

  const DEFAULT_THEME = Object.freeze({
    colors: Object.freeze({
      theme: "#67e8f9",
      danger: "#ef4444",
      warning: "#f59e0b",
      success: "#22c55e",
      neutral: "#64748b",
      location: "#0ea5e9",
    }),
    borderTones: Object.freeze({
      light: "rgba(255, 255, 255, 0.78)",
      dark: "#0f172a",
      theme: "#0f172a",
    }),
    fillOpacity: Object.freeze({
      solid: 0.9,
      transparent: 0.12,
      none: 0,
    }),
    strokeWidth: Object.freeze({
      solid: 4,
      dashed: 4,
      dotted: 4,
      none: 0,
    }),
    strokeDasharray: Object.freeze({
      solid: null,
      dashed: "10 7",
      dotted: "2 7",
      none: null,
    }),
  });

  function mergeTheme(theme) {
    const value = theme && typeof theme === "object" ? theme : {};
    return {
      colors: Object.assign({}, DEFAULT_THEME.colors, value.colors || {}),
      borderTones: Object.assign(
        {},
        DEFAULT_THEME.borderTones,
        value.borderTones || {},
      ),
      fillOpacity: Object.assign(
        {},
        DEFAULT_THEME.fillOpacity,
        value.fillOpacity || {},
      ),
      strokeWidth: Object.assign(
        {},
        DEFAULT_THEME.strokeWidth,
        value.strokeWidth || {},
      ),
      strokeDasharray: Object.assign(
        {},
        DEFAULT_THEME.strokeDasharray,
        value.strokeDasharray || {},
      ),
    };
  }

  function requiredString(value, name) {
    const normalized = String(value == null ? "" : value).trim();
    if (!normalized) {
      throw new TypeError(name + " must not be empty.");
    }
    return normalized;
  }

  function normalizeType(value) {
    const source = requiredString(value, "annotation type");
    if (Object.prototype.hasOwnProperty.call(model.TYPES, source)) {
      return model.TYPES[source];
    }
    if (Object.values(model.TYPES).includes(source)) {
      return source;
    }
    throw new TypeError("Unsupported annotation type: " + source + ".");
  }

  function validateProfile(type, value) {
    if (!value || typeof value !== "object") {
      throw new TypeError("Missing visual profile for " + type + ".");
    }
    const profile = Object.assign({}, value);
    profile.id = requiredString(profile.id, "visual profile id");
    profile.shape = requiredString(profile.shape, "visual shape");
    profile.borderStyle = requiredString(
      profile.borderStyle,
      "visual border style",
    );
    profile.borderTone = requiredString(
      profile.borderTone,
      "visual border tone",
    );
    profile.fillStyle = requiredString(profile.fillStyle, "visual fill style");
    profile.colorAuthority = requiredString(
      profile.colorAuthority,
      "visual color authority",
    );
    profile.iconAuthority = requiredString(
      profile.iconAuthority,
      "visual icon authority",
    );
    if (!SUPPORTED_SHAPES.has(profile.shape)) {
      throw new TypeError("Unsupported visual shape: " + profile.shape + ".");
    }
    if (!SUPPORTED_BORDER_STYLES.has(profile.borderStyle)) {
      throw new TypeError(
        "Unsupported visual border style: " + profile.borderStyle + ".",
      );
    }
    if (!SUPPORTED_FILL_STYLES.has(profile.fillStyle)) {
      throw new TypeError(
        "Unsupported visual fill style: " + profile.fillStyle + ".",
      );
    }
    profile.recommendedColorRole = profile.recommendedColorRole == null
      ? null
      : String(profile.recommendedColorRole);
    profile.fixedIconName = profile.fixedIconName == null
      ? null
      : String(profile.fixedIconName);
    profile.issueStatusColors = Object.assign(
      {},
      profile.issueStatusColors || {},
    );
    profile.recordKindIcons = Object.assign(
      {},
      profile.recordKindIcons || {},
    );
    return Object.freeze(profile);
  }

  function validateContract(contract) {
    if (!contract || typeof contract !== "object") {
      throw new TypeError("A visual representation contract is required.");
    }
    if (contract.schemaVersion !== 1) {
      throw new TypeError("visual contract schemaVersion must be 1.");
    }
    const source = contract.profiles;
    if (!source || typeof source !== "object") {
      throw new TypeError("visual contract profiles are required.");
    }
    const profiles = {};
    Object.values(model.TYPES).forEach(function (type) {
      profiles[type] = validateProfile(type, source[type]);
    });
    return Object.freeze(profiles);
  }

  function roleColor(theme, role) {
    const normalized = requiredString(role, "visual color role");
    const color = theme.colors[normalized];
    if (!color) {
      throw new TypeError(
        "The active theme does not define color role " + normalized + ".",
      );
    }
    return String(color);
  }

  function resolveColor(annotation, profile, theme) {
    if (profile.colorAuthority === "user") {
      return {
        role: "user",
        value: requiredString(
          annotation.properties.markerColor,
          "properties.markerColor",
        ),
      };
    }
    if (profile.colorAuthority === "issue_status") {
      const status = annotation.properties.issueStatus;
      const role = profile.issueStatusColors[status];
      if (!role) {
        throw new TypeError(
          "The visual profile has no color rule for issue status "
            + status
            + ".",
        );
      }
      return { role: role, value: roleColor(theme, role) };
    }
    if (
      profile.colorAuthority === "fixed"
      || profile.colorAuthority === "annotation_category"
      || profile.colorAuthority === "record_kind"
      || profile.colorAuthority === "theme"
    ) {
      const role = profile.recommendedColorRole || "theme";
      return { role: role, value: roleColor(theme, role) };
    }
    throw new TypeError(
      "Unsupported visual color authority: " + profile.colorAuthority + ".",
    );
  }

  function resolveIcon(annotation, profile) {
    if (profile.iconAuthority === "none") {
      return null;
    }
    if (profile.iconAuthority === "fixed") {
      return requiredString(profile.fixedIconName, "fixed icon name");
    }
    if (profile.iconAuthority === "record_kind") {
      const recordKind = annotation.properties.recordKind;
      const icon = profile.recordKindIcons[recordKind];
      if (!icon) {
        throw new TypeError(
          "The visual profile has no icon rule for record kind "
            + recordKind
            + ".",
        );
      }
      return String(icon);
    }
    throw new TypeError(
      "Unsupported visual icon authority: " + profile.iconAuthority + ".",
    );
  }

  function createResolver(configuration) {
    const options = configuration && typeof configuration === "object"
      ? configuration
      : {};
    const profiles = validateContract(options.contract);
    const theme = mergeTheme(options.theme);

    function profileFor(type) {
      return profiles[normalizeType(type)];
    }

    function resolve(annotation) {
      const normalized = model.normalizeAnnotation(annotation);
      const profile = profileFor(normalized.type);
      const color = resolveColor(normalized, profile, theme);
      const stroke = profile.borderStyle === "none"
        ? "none"
        : String(theme.borderTones[profile.borderTone] || color.value);
      return Object.freeze({
        profileId: profile.id,
        shape: profile.shape,
        borderStyle: profile.borderStyle,
        borderTone: profile.borderTone,
        fillStyle: profile.fillStyle,
        colorAuthority: profile.colorAuthority,
        colorRole: color.role,
        color: color.value,
        fill: color.value,
        fillOpacity: Number(theme.fillOpacity[profile.fillStyle]),
        stroke: stroke,
        strokeWidth: Number(theme.strokeWidth[profile.borderStyle]),
        strokeDasharray: theme.strokeDasharray[profile.borderStyle] || null,
        iconAuthority: profile.iconAuthority,
        icon: resolveIcon(normalized, profile),
      });
    }

    return Object.freeze({
      profileFor: profileFor,
      resolve: resolve,
    });
  }

  global.OntoBDCAnnotationVisualResolver = Object.freeze({
    DEFAULT_THEME: DEFAULT_THEME,
    createResolver: createResolver,
  });
}(globalThis));
