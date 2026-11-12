// Finds a candidate's name and email in CV text. Pure functions so they can be tested on their own.
const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/g;
// Words that appear in headings, job titles and contact labels, never in a person's name line.
const NOT_NAME = new Set(("resume curriculum vitae cv profile summary objective career contact contacts email e-mail phone mobile tel " +
  "address location linkedin portfolio website skills skill experience education employment work history references reference " +
  "certifications certification languages page personal information details about me professional " +
  "virtual assistant assistants executive administrative admin specialist manager representative officer agent developer designer " +
  "engineer consultant coordinator administrator freelance freelancer support sales marketing accountant bookkeeper analyst lead " +
  "setter appointment customer service services social media cold caller calling telemarketer telemarketing real estate operations " +
  "receptionist secretary writer editor graphic data entry encoder supervisor team leader va ceo coo hr intern applicant position " +
  "philippines city province street st avenue ave barangay brgy").split(/\s+/));
const PARTICLES = new Set(["de", "dela", "del", "delos", "los", "la", "da", "dos", "van", "von", "di", "le", "y", "jr", "jr.", "sr", "sr.", "ii", "iii", "iv"]);

export function findEmail(text) {
  const all = (String(text || "").match(EMAIL_RE) || []).map((e) => e.replace(/^mailto:/i, "").replace(/[.\-]+$/, "").toLowerCase());
  const bad = /(example|domain|email)\.(com|org)$|^(name|your\.?name|sample)@|noreply|no-reply/;
  return all.find((e) => !bad.test(e)) || "";
}

function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s\-'’])([a-zà-ÿñ])/g, (m, p, ch) => p + ch.toUpperCase())
    .replace(/\b(De|Dela|Del|Delos|Los|La|Da|Dos|Van|Von|Di|Le|Y)\b/g, (w, _1, i) => (i === 0 ? w : w.toLowerCase()))
    .replace(/\b(Ii|Iii|Iv)\b/g, (w) => w.toUpperCase());
}

/** Is this line plausibly a person's name? Returns the cleaned name or "". */
export function cleanName(raw) {
  let s = String(raw || "").replace(/^\s*(full\s*)?name\s*[:\-–]\s*/i, "").replace(/[|•·,]+$/g, "").replace(/\s+/g, " ").trim();
  if (s.length < 4 || s.length > 60) return "";
  if (/[0-9@#/\\:;()[\]{}<>+=_*&%$!?]/.test(s)) return "";
  const words = s.split(" ");
  if (words.length < 2 || words.length > 5) return "";
  for (const w of words) {
    const bare = w.toLowerCase().replace(/[.,]/g, "");
    if (NOT_NAME.has(bare)) return "";
    if (!/^[A-Za-zÀ-ÿÑñ][A-Za-zÀ-ÿÑñ.'’\-]*$/.test(w)) return "";
  }
  const core = words.filter((w) => !PARTICLES.has(w.toLowerCase()) && !/^[A-Za-z]\.?$/.test(w));
  if (core.length < 2) return "";
  // Must start with capitals (Title Case or ALL CAPS), like names are written on CVs.
  if (!words.every((w) => /^[A-ZÀ-ÞÑ]/.test(w) || PARTICLES.has(w.toLowerCase()))) return "";
  const caps = s === s.toUpperCase();
  return caps ? titleCase(s) : s;
}

/**
 * Detect { name, email, reason } from { text, lines } (lines = first page with font sizes).
 * reason is set when something couldn't be found.
 */
export function detectContact(parsed) {
  const text = parsed?.text || "";
  const lines = parsed?.lines || [];
  if (text.replace(/\s/g, "").length < 20) return { name: "", email: "", reason: "No readable text in this PDF. It may be a scanned image." };
  const firstPageText = lines.map((l) => l.text).join("\n");
  const email = findEmail(firstPageText) || findEmail(text);
  const local = email ? email.split("@")[0].toLowerCase().replace(/[^a-z]/g, " ") : "";
  const maxSize = Math.max(...lines.map((l) => l.size), 1);
  let best = null;
  lines.slice(0, 25).forEach((l, i) => {
    // A name is sometimes on the same line as other details: "MARIA SANTOS | Davao City"
    const segments = [l.text, ...l.text.split(/\s[|•·–—]\s|\s{2,}/)].filter(Boolean);
    for (const seg of segments) {
      const name = cleanName(seg);
      if (!name) continue;
      let score = 0;
      score += (l.size / maxSize) * 6;            // biggest text on the page
      score += Math.max(0, 4 - i * 0.5);          // near the top
      const parts = name.toLowerCase().split(/[\s\-]+/).filter((p) => p.length > 1);
      const hits = local ? parts.filter((p) => local.includes(p) || local.includes(p.slice(0, 4))).length : 0;
      score += hits * 3;                           // matches the email (maria.santos@…)
      if (/^(full\s*)?name\s*[:\-–]/i.test(l.text)) score += 6;
      if (!best || score > best.score) best = { name, score };
    }
  });
  const name = best && best.score >= 4 ? best.name : "";
  const reason = !email && !name ? "Couldn’t find a name or email address in this CV."
    : !email ? "Couldn’t find an email address in this CV."
    : !name ? "Couldn’t find the candidate’s name in this CV." : "";
  return { name, email, reason };
}
