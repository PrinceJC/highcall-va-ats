// Boolean search: AND / OR / NOT, brackets, "exact phrases", word* prefixes,
// implicit AND between words, -word for NOT, and field:value filters.
export const FIELDS = {
  name: "name", email: "email", skill: "skills", skills: "skills", location: "location", loc: "location",
  headline: "headline", title: "headline", role: "roles", cv: "cv", note: "note", os: "os", availability: "availability",
};

function tokenize(q) {
  const toks = []; let i = 0;
  while (i < q.length) {
    const ch = q[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "(" || ch === ")") { toks.push({ t: ch }); i++; continue; }
    if (ch === '"') { let j = q.indexOf('"', i + 1); if (j < 0) j = q.length; toks.push({ t: "term", v: q.slice(i + 1, j), phrase: true }); i = j + 1; continue; }
    let j = i; while (j < q.length && !/[\s()"]/.test(q[j])) j++;
    let w = q.slice(i, j); i = j;
    let neg = false;
    if (w.length > 1 && w[0] === "-") { neg = true; w = w.slice(1); }
    const fm = w.match(/^([a-z]+):(.*)$/i);
    let field = null;
    if (fm && FIELDS[fm[1].toLowerCase()]) {
      field = FIELDS[fm[1].toLowerCase()]; w = fm[2];
      if (w === "" && q[i] === '"') {
        let k = q.indexOf('"', i + 1); if (k < 0) k = q.length;
        if (neg) toks.push({ t: "NOT" });
        toks.push({ t: "term", field, v: q.slice(i + 1, k), phrase: true }); i = k + 1; continue;
      }
    }
    if (!neg && !field) {
      if (w === "AND" || w === "&&") { toks.push({ t: "AND" }); continue; }
      if (w === "OR" || w === "||") { toks.push({ t: "OR" }); continue; }
      if (w === "NOT" || w === "!") { toks.push({ t: "NOT" }); continue; }
    }
    if (!w) continue;
    if (neg) toks.push({ t: "NOT" });
    toks.push({ t: "term", field, v: w });
  }
  return toks;
}

export function parseQuery(q) {
  const toks = tokenize(q); let p = 0;
  const peek = () => toks[p], take = () => toks[p++];
  function orE() { let l = andE(); while (peek()?.t === "OR") { take(); l = { op: "or", l, r: andE() }; } return l; }
  function andE() {
    let l = notE();
    while (peek() && ["AND", "term", "NOT", "("].includes(peek().t)) { if (peek().t === "AND") take(); l = { op: "and", l, r: notE() }; }
    return l;
  }
  function notE() { if (peek()?.t === "NOT") { take(); return { op: "not", e: notE() }; } return prim(); }
  function prim() {
    const t = take();
    if (!t) throw new Error("the search ends with an operator");
    if (t.t === "(") { const e = orE(); if (take()?.t !== ")") throw new Error("a bracket is not closed"); return e; }
    if (t.t === "term") return { op: "term", ...t };
    throw new Error("“" + t.t + "” needs a word on both sides");
  }
  if (!toks.length) return null;
  const tree = orE();
  if (p < toks.length) throw new Error(toks[p].t === ")" ? "there is an extra closing bracket" : "check the operators");
  return tree;
}

function termMatch(t, hay) {
  const src = t.field ? hay[t.field] || "" : hay.all;
  let v = t.v.toLowerCase().trim(); if (!v) return true;
  if (t.phrase) return src.replace(/\s+/g, " ").includes(v.replace(/\s+/g, " "));
  const wild = v.endsWith("*"); if (wild) v = v.slice(0, -1);
  const e = v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = t._re || (t._re = new RegExp("(^|[^\\p{L}\\p{N}])" + e + (wild ? "[\\p{L}\\p{N}]*" : "") + "(?=[^\\p{L}\\p{N}]|$)", "u"));
  return re.test(src);
}
function evalQ(n, hay) {
  if (n.op === "and") return evalQ(n.l, hay) && evalQ(n.r, hay);
  if (n.op === "or") return evalQ(n.l, hay) || evalQ(n.r, hay);
  if (n.op === "not") return !evalQ(n.e, hay);
  return termMatch(n, hay);
}

const cache = new WeakMap();
export function haystack(c, roleTitles) {
  const hit = cache.get(c); if (hit) return hit;
  const d = c.device || {};
  const f = {
    name: c.name, email: c.email, skills: (c.skills || []).join(", "), location: c.location, headline: c.headline,
    roles: roleTitles, cv: c.cv_text || "", note: c.note || "", os: [d.os, d.cpu].join(" "), availability: c.availability,
  };
  const low = {}; for (const k in f) low[k] = String(f[k] || "").toLowerCase();
  low.all = [c.name, c.email, c.phone, c.location, c.headline, f.skills, c.availability, c.note, c.years && c.years + " years", roleTitles, c.cv_text, d.os, d.cpu, d.isp]
    .filter(Boolean).join("\n").toLowerCase();
  cache.set(c, low);
  return low;
}

/** items: [{cand, ...}], titlesFor: cand => string of role titles */
export function searchList(items, q, titlesFor) {
  let tree = null, err = "";
  try { tree = parseQuery(q); } catch (e) { err = e.message; }
  if (err) {
    const words = q.replace(/[()"]/g, " ").split(/\s+/).filter((w) => w && !/^(AND|OR|NOT)$/.test(w));
    tree = words.length ? words.map((v) => ({ op: "term", v })).reduce((l, r) => ({ op: "and", l, r })) : null;
  }
  return { err, list: tree ? items.filter((x) => evalQ(tree, haystack(x.cand, titlesFor(x.cand)))) : items };
}
