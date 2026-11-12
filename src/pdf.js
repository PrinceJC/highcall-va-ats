// Reads CV text in the browser: used for Boolean search and to detect a candidate's name and email.
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

// Group text pieces into visual lines (same baseline), keeping each line's font size and position.
function toLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const [a, b, c, d, x, y] = it.transform;
    const size = Math.round(Math.hypot(c, d) * 10) / 10 || Math.abs(d) || 10;
    let row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2, size * 0.35));
    if (!row) { row = { y, size, parts: [] }; rows.push(row); }
    row.size = Math.max(row.size, size);
    row.parts.push({ x, str: it.str, w: it.width || 0 });
  }
  rows.sort((p, q) => q.y - p.y);
  return rows.map((r) => {
    r.parts.sort((p, q) => p.x - q.x);
    let text = "", end = null;
    for (const p of r.parts) {
      const gap = end === null ? 0 : p.x - end;
      text += (text && !/\s$/.test(text) && !/^\s/.test(p.str) && gap > r.size * 0.15 ? " " : "") + p.str;
      end = p.x + p.w;
    }
    return { text: text.replace(/\s+/g, " ").trim(), size: r.size, y: r.y };
  }).filter((l) => l.text);
}

/** Returns { text, lines (first page), pages } */
export async function extractPdf(file, maxPages = 15, maxChars = 60000) {
  if (file._cvParsed) return file._cvParsed; // reuse a result already read for this file
  const pdfjs = await lib();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  let text = "", first = [];
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    const lines = toLines(tc.items);
    if (i === 1) first = lines;
    text += lines.map((l) => l.text).join("\n") + "\n";
    if (text.length > maxChars) break;
  }
  const out = { text: text.slice(0, maxChars), lines: first, pages: doc.numPages };
  try { Object.defineProperty(file, "_cvParsed", { value: out, configurable: true }); } catch {}
  return out;
}

export async function extractPdfText(file, maxPages, maxChars) {
  return (await extractPdf(file, maxPages, maxChars)).text;
}
