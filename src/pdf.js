// Extracts CV text in the browser so recruiters can Boolean-search inside CVs.
let libP = null;
async function lib() {
  if (!libP) {
    libP = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.js?url"),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return libP;
}

export async function extractPdfText(file, maxPages = 15, maxChars = 60000) {
  const pdfjs = await lib();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  let out = "";
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    out += tc.items.map((x) => x.str).join(" ") + "\n";
    if (out.length > maxChars) break;
  }
  return out.replace(/[ \t]+/g, " ").slice(0, maxChars);
}
