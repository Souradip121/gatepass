// Registrations parsing: CSV / TSV files, or cells pasted from Google Sheets / Excel.

export function parseTable(text) {
  text = String(text || "").replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delim = firstLine.includes("\t") ? "\t" : (firstLine.split(";").length > firstLine.split(",").length ? ";" : ",");
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s().-]{7,20}$/;
export const isEmail = (v) => EMAIL.test(v);
export const isPhone = (v) => PHONE.test(v) && v.replace(/\D/g, "").length >= 7;

const NAME_HDR = /^(full\s*name|name|your\s*(full\s*)?name|student\s*name|participant('?s)?\s*name|attendee\s*name|name\s*of\s*(the\s*)?(participant|student|attendee))$/i;
const NAME_ANY = /name/i;
const NAME_NOT = /college|club|team|institute|institution|school|university|event|father|mother|guardian|parent|user\s*name|file/i;
const EMAIL_HDR = /e-?mail/i;
const PHONE_HDR = /phone|mobile|whats\s*app|contact|number|cell/i;

// Work out which columns hold the name and the contact.
export function analyse(rows) {
  if (!rows.length) return null;
  const head = rows[0];
  const width = Math.max(...rows.slice(0, 50).map((r) => r.length));
  const looksLikeData = head.some((c) => isEmail(c) || isPhone(c));
  const hasHeader = !looksLikeData && head.some((c) => NAME_ANY.test(c) || EMAIL_HDR.test(c) || PHONE_HDR.test(c));
  const body = hasHeader ? rows.slice(1) : rows;
  const sample = body.slice(0, 200);
  const share = (col, test) => {
    const vals = sample.map((r) => r[col] || "").filter(Boolean);
    return vals.length ? vals.filter(test).length / vals.length : 0;
  };
  const cols = Array.from({ length: width }, (_, i) => ({
    i,
    label: hasHeader ? head[i] || `Column ${i + 1}` : `Column ${i + 1}`,
    email: share(i, isEmail),
    phone: share(i, isPhone),
  }));

  let name = -1;
  if (hasHeader) {
    name = head.findIndex((h) => NAME_HDR.test(h));
    if (name < 0) name = head.findIndex((h) => NAME_ANY.test(h) && !NAME_NOT.test(h));
  }
  if (name < 0) name = cols.findIndex((c) => c.email < 0.3 && c.phone < 0.3 && share(c.i, (v) => /[A-Za-zऀ-ॿ]/.test(v) && !/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(v)) > 0.7);
  if (name < 0) name = 0;

  const best = (key, hdr) => {
    let idx = hasHeader ? head.findIndex((h, i) => i !== name && hdr.test(h) && cols[i][key] > 0.5) : -1;
    if (idx < 0) {
      const sorted = cols.filter((c) => c.i !== name && c[key] > 0.5).sort((a, b) => b[key] - a[key]);
      idx = sorted.length ? sorted[0].i : -1;
    }
    return idx;
  };
  const phone = best("phone", PHONE_HDR);
  const email = best("email", EMAIL_HDR);
  // Indian clubs send passes on WhatsApp first, so prefer the phone column when there is one.
  const contact = phone >= 0 ? phone : email;
  return { hasHeader, cols, name, contact, body };
}

// Turn rows into passes; drop blanks and duplicates (also against people already on the list).
export function toPasses(a, nameCol, contactCol, existing = []) {
  const seen = new Set(existing.map((p) => key(p.name, p.contact)));
  const out = [];
  let blank = 0, dup = 0;
  for (const r of a.body) {
    const name = (r[nameCol] || "").replace(/\s+/g, " ").trim().slice(0, 120);
    const contact = contactCol >= 0 ? (r[contactCol] || "").replace(/\s+/g, " ").trim().slice(0, 160) : "";
    if (!name) { blank++; continue; }
    const k = key(name, contact);
    if (seen.has(k)) { dup++; continue; }
    seen.add(k);
    out.push({ name, contact });
  }
  return { passes: out, blank, dup };
}

// Same person twice = same name and same contact (a double-submitted form).
// Two people may share a phone (siblings, a parent's number), so contact alone never merges rows.
function key(name, contact) {
  const c = (contact || "").toLowerCase().trim();
  const digits = c.replace(/\D/g, "");
  const norm = isEmail(c) ? c : digits.length >= 7 ? digits.slice(-10) : c;
  return `${name.toLowerCase().replace(/\s+/g, " ").trim()}|${norm}`;
}

export function toCsv(rows) {
  return rows.map((r) => r.map((v) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\r\n") + "\r\n";
}
