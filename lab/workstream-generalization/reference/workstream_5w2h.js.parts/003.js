    let directory = activeContainerHandle;
    for (const part of cleanPath.slice(0, -1)) {
      directory = await directory.getDirectoryHandle(part);
    }
    return directory.getFileHandle(cleanPath.at(-1)).then((handle) =>
      handle.getFile()
    );
  }

  function decodedCatalogPath(resourceId) {
    return resourceId
      .replace(/^\.?\//, "")
      .split("/")
      .map(decodeCatalogComponent)
      .join("/");
  }

  function previewRepresentation(resource) {
    if (!/\.dwg$/i.test(decodedCatalogPath(resource.id))) {
      return resource;
    }

    const sourcePath = decodedCatalogPath(resource.id);
    for (const extension of [".png", ".pdf"]) {
      const expectedPath = sourcePath
        .replace(/\.dwg$/i, extension)
        .toLocaleLowerCase();
      const representation = resourceModel.catalogResources.find(
        (candidate) =>
          decodedCatalogPath(candidate.id).toLocaleLowerCase()
          === expectedPath,
      );
      if (representation) {
        return representation;
      }
    }
    return resource;
  }

  function emailAddress(value) {
    if (!value) {
      return "";
    }
    if (typeof value === "string") {
      return value;
    }
    const address = value.address || value.email || "";
    const name = value.name || "";
    return name && address ? `${name} <${address}>` : name || address;
  }

  function emailAddressList(values) {
    if (!values) {
      return "";
    }
    const entries = Array.isArray(values) ? values : [values];
    return entries.map(emailAddress).filter(Boolean).join("; ");
  }

  function msgRecipients(message, type) {
    return emailAddressList(
      (message.recipients || []).filter(
        (recipient) => recipient.recipType === type,
      ),
    );
  }

  function safeEmailDocument(html) {
    const parser = new DOMParser();
    const documentValue = parser.parseFromString(
      html || "<p>Este e-mail não possui corpo.</p>",
      "text/html",
    );
    documentValue.querySelectorAll(
      "script, object, embed, iframe, form, input, button",
    ).forEach((element) => element.remove());
    documentValue.querySelectorAll("*").forEach((element) => {
      [...element.attributes].forEach((attribute) => {
        if (
          attribute.name.toLowerCase().startsWith("on")
          || (
            ["href", "src", "action"].includes(attribute.name.toLowerCase())
            && /^\s*(javascript|data:text\/html)/i.test(attribute.value)
          )
        ) {
          element.removeAttribute(attribute.name);
        }
      });
    });
    const content = documentValue.body.innerHTML;
    return `<!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <meta
            http-equiv="Content-Security-Policy"
            content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'"
          >
          <style>
            :root { color-scheme: light; }
            body {
              margin: 0;
              padding: 20px;
              color: #172033;
              background: #fff;
              font: 15px/1.55 Inter, Arial, sans-serif;
              overflow-wrap: anywhere;
            }
            img { max-width: 100%; height: auto; }
            pre { white-space: pre-wrap; }
            table { max-width: 100%; }
          </style>
        </head>
        <body>${content}</body>
      </html>`;
  }

  function appendEmailField(container, label, value) {
    if (!value) {
      return;
    }
    const item = document.createElement("div");
    item.className = "workstream-email-field";
    const term = document.createElement("strong");
    term.textContent = label;
    const description = document.createElement("span");
    description.textContent = value;
    item.append(term, description);
    container.appendChild(item);
  }

  function renderEmail(preview, message) {
    const email = document.createElement("article");
    email.className = "workstream-email";
    const header = document.createElement("header");
    header.className = "workstream-email-header";
    const subject = document.createElement("h3");
    subject.textContent = message.subject || "Sem assunto";
    header.appendChild(subject);
    appendEmailField(
      header,
      "De",
      emailAddress(message.from)
        || emailAddress({
          name: message.senderName,
          email: message.senderSmtpAddress || message.senderEmail,
        }),
    );
    appendEmailField(
      header,
      "Para",
      emailAddressList(message.to) || msgRecipients(message, "to"),
    );
    appendEmailField(
      header,
      "Cc",
      emailAddressList(message.cc) || msgRecipients(message, "cc"),
    );
    appendEmailField(
      header,
      "Data",
      message.date
        || message.messageDeliveryTime
        || message.clientSubmitTime
        || message.creationTime,
    );
    email.appendChild(header);

    const frame = document.createElement("iframe");
    frame.className = "workstream-email-body";
    frame.title = `Conteúdo do e-mail: ${message.subject || "Sem assunto"}`;
    frame.setAttribute("sandbox", "");
    const htmlBytes = message.html instanceof Uint8Array
      ? new TextDecoder("utf-8").decode(message.html)
      : "";
    const body = message.html || htmlBytes
      ? message.html && typeof message.html === "string"
        ? message.html
        : htmlBytes
      : `<pre>${String(message.text || message.body || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")}</pre>`;
    frame.srcdoc = safeEmailDocument(body);
    email.appendChild(frame);

    const attachments = message.attachments || [];
    if (attachments.length > 0) {
      const footer = document.createElement("footer");
      footer.className = "workstream-email-attachments";
      const label = document.createElement("strong");
      label.textContent = `Anexos (${attachments.length})`;
      const names = document.createElement("span");
      names.textContent = attachments
        .map((attachment) =>
          attachment.filename
          || attachment.fileName
          || attachment.fileNameShort
          || "Anexo"
        )
        .join(" · ");
      footer.append(label, names);
      email.appendChild(footer);
    }
    preview.appendChild(email);
  }

  async function parseEmail(file, resourceId) {
    if (!window.InfoBIMEmailReader) {
      throw new Error("O leitor de e-mail não foi carregado.");
    }
    const buffer = await file.arrayBuffer();
    if (/\.msg$/i.test(resourceId)) {
      return window.InfoBIMEmailReader.parseMsg(buffer);
    }
    return window.InfoBIMEmailReader.parseEml(buffer);
  }

  async function directoryContainsFile(directory, pathParts) {
    try {
      let current = directory;
      for (const part of pathParts.slice(0, -1)) {
        current = await current.getDirectoryHandle(part);
      }
      await current.getFileHandle(pathParts.at(-1));
      return true;
    } catch (error) {
      if (error && error.name === "NotFoundError") {
        return false;
      }
      throw error;
    }
  }

  async function isDatasetDirectory(directory) {
    return (
      await directoryContainsFile(
        directory,
        [".__ontobdc__", "dataset.ttl"],
      )
      || await directoryContainsFile(
        directory,
        [".__ontobdc__", "nid.ttl"],
      )
      || await directoryContainsFile(
        directory,
        ["linkset", "datapackage.json"],
      )
    );
  }

  async function collectProjectFiles(directory, prefix = "") {
    const paths = [];
    for await (const entry of directory.values()) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === "directory") {
        if (
          entry.name === ".__ontobdc__"
          || entry.name === ".__onmtobdc__"
          || await isDatasetDirectory(entry)
        ) {
          continue;
        }
        paths.push(...await collectProjectFiles(entry, relativePath));
      } else {
        paths.push(relativePath);
      }
    }
    return paths.sort((left, right) => left.localeCompare(right));
  }

  function encodeCatalogPath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function makeRoCrate(filePaths) {
    const fileIds = filePaths.map(encodeCatalogPath);
    return {
      "@context": "https://w3id.org/ro/crate/1.1/context",
      "@graph": [
        {
          "@id": "ro-crate-metadata.json",
          "@type": "CreativeWork",
          about: { "@id": "./" },
          conformsTo: {
            "@id": "https://w3id.org/ro/crate/1.1",
          },
        },
        {
          "@id": "./",
          "@type": "Dataset",
          hasPart: fileIds.map((id) => ({ "@id": id })),
        },
        ...fileIds.map((id) => ({
          "@id": id,
          "@type": "File",
        })),
      ],
    };
  }