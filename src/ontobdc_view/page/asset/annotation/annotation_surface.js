(function (global) {
  "use strict";

  async function imageSurface(file, context, options) {
    const url = URL.createObjectURL(file);
    const image = document.createElement("img");
    image.className = options.surfaceClass;
    image.alt = context.representationName || options.imageAlt;
    image.src = url;
    await new Promise(function (resolve, reject) {
      image.onload = resolve;
      image.onerror = function () {
        reject(new Error(options.imageLoadError));
      };
    });
    return {
      element: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: function () {
        URL.revokeObjectURL(url);
      },
    };
  }

  // Chrome refuses to construct a Worker from a URL that involves a
  // cross-origin redirect ("Refused to cross-origin redirects of the
  // top-level worker script") — which is exactly what pdf.js's CDN worker
  // URL does. Fetching the script as plain text (not subject to that
  // Worker-specific restriction) and handing pdf.js a local blob: URL
  // sidesteps it entirely: the Worker is then constructed from a same-
  // origin URL no matter where the bytes actually came from.
  let cachedWorkerBlobUrl = null;
  let cachedWorkerSourceUrl = null;

  async function blobWorkerUrl(sourceUrl) {
    if (cachedWorkerBlobUrl && cachedWorkerSourceUrl === sourceUrl) {
      return cachedWorkerBlobUrl;
    }
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Could not fetch the PDF worker script (${response.status}).`);
    }
    const code = await response.text();
    cachedWorkerBlobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    cachedWorkerSourceUrl = sourceUrl;
    return cachedWorkerBlobUrl;
  }

  async function pdfSurface(file, options) {
    const pdfjs = await import(options.pdfModuleUrl);
    pdfjs.GlobalWorkerOptions.workerSrc = await blobWorkerUrl(options.pdfWorkerUrl);
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    });
    const pdf = await task.promise;
    const page = await pdf.getPage(options.pdfPageNumber);
    const viewport = page.getViewport({ scale: options.pdfScale });
    const canvas = document.createElement("canvas");
    canvas.className = options.surfaceClass;
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport: viewport,
    }).promise;
    return {
      element: canvas,
      width: canvas.width,
      height: canvas.height,
      release: function () {
        pdf.destroy();
      },
    };
  }

  async function createSurface(context, configuration) {
    const options = Object.assign({
      surfaceClass: "ontobdc-annotation-image",
      imageAlt: "Annotatable representation",
      imageLoadError: "The image representation could not be loaded.",
      unsupportedError: "This format does not have an annotatable representation.",
      pdfModuleUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs",
      pdfWorkerUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs",
      pdfPageNumber: 1,
      pdfScale: 2,
    }, configuration || {});
    const mediaType = context.mediaType || (context.file && context.file.type) || "";
    const representationSource = context.representationSource || "";
    if (
      mediaType.startsWith("image/")
      || /\.(png|jpe?g|webp|gif|bmp)$/i.test(representationSource)
    ) {
      return imageSurface(context.file, context, options);
    }
    if (
      mediaType === "application/pdf"
      || /\.pdf$/i.test(representationSource)
    ) {
      return pdfSurface(context.file, options);
    }
    throw new Error(options.unsupportedError);
  }

  global.OntoBDCAnnotationSurface = Object.freeze({
    createSurface: createSurface,
  });
}(globalThis));
