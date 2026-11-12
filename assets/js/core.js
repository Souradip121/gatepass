// Shared helpers for every GatePass page.
import qrcode from "../../vendor/qrcode.mjs";

export const cfg = window.GATEPASS || {};
export const ROOT = new URL("../../", import.meta.url);            // the site root, wherever it is hosted
export const configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && !/YOUR_|PLACEHOLDER/.test(cfg.supabaseUrl + cfg.supabaseAnonKey));

export const ART = [
  { key: "crowd", name: "Crowd" },
  { key: "dj", name: "DJ night" },
  { key: "mic", name: "Open mic" },
  { key: "dance", name: "Dance" },
  { key: "band", name: "Live band" },
  { key: "hack", name: "Hackathon" },
];
export const artUrl = (i, thumb = false) => new URL(`assets/art/${thumb ? "thumb/" : ""}${(ART[i] || ART[0]).key}.jpg`, ROOT).href;
export const passUrl = (token) => new URL(`p/#${token}`, ROOT).href;
export const gateUrl = (code) => new URL(`gate/#${code}`, ROOT).href;
export const fmtCode = (c = "") => (c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);

// ── Supabase RPC over plain fetch (pass + gate pages don't need the SDK) ──
export class RpcError extends Error {}
export async function rpc(fn, args = {}, { token, signal } = {}) {
  let res;
  try {
    res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: `Bearer ${token || cfg.supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal,
      cache: "no-store",
    });
  } catch (e) {
    const err = new RpcError("offline");
    err.offline = true;
    throw err;
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { msg = JSON.parse(text).message || text; } catch {}
    const err = new RpcError(msg);
    err.status = res.status;
    // A paused free-tier project answers 5xx / 540 until it wakes up.
    err.paused = res.status >= 500;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

// ── formatting ──
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtTime(d) {
  d = new Date(d);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}
export function fmtDay(d) {
  d = new Date(d);
  return `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}`;
}
export const fmtWhen = (d) => `${fmtDay(d)} · ${fmtTime(d)}`;
export function fmtAgo(d) {
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 50) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (new Date(d).toDateString() === new Date().toDateString()) return fmtTime(d);
  return fmtWhen(d);
}
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Display type prints a real apostrophe: FRESHERS’ NIGHT, not FRESHERS' NIGHT.
export const typo = (s) => String(s ?? "").replace(/'/g, "’");
export const escT = (s) => esc(typo(s));
export const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

// ── storage that never throws (private windows, in-app browsers) ──
export const store = {
  get(k, fallback = null) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

// ── clipboard ──
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = document.createElement("textarea");
  ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.append(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch {}
  ta.remove();
  return ok;
}

// ── toast ──
let toastTimer;
export function toast(msg, icon = "check") {
  document.querySelector(".toast")?.remove();
  const t = document.createElement("div");
  t.className = "toast"; t.setAttribute("role", "status");
  t.innerHTML = `${I[icon] || ""}<span>${esc(msg)}</span>`;
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

// ── download a text file ──
export function download(name, text, type = "text/csv") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ── QR as SVG (one path, runs merged) ──
export function qrSvg(text, { fg = "#1A43B4", margin = 2, label = "QR code", ghost = null } = {}) {
  const q = qrcode(0, "M");
  q.addData(text, "Byte");
  q.make();
  const n = q.getModuleCount();
  const size = n + margin * 2;
  let d = "";
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (q.isDark(y, x)) {
        let w = 1;
        while (x + w < n && q.isDark(y, x + w)) w++;
        d += `M${x + margin} ${y + margin}h${w}v1h-${w}z`;
        x += w;
      } else x++;
    }
  }
  // ghost = a second riso plate a hair off register (light enough that scanners binarise it away)
  const g = ghost ? `<path fill="${ghost}" opacity=".5" transform="translate(.24 .17)" d="${d}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="${esc(label)}">${g}<path fill="${fg}" d="${d}"/></svg>`;
}

// ── icons: utility glyphs share a 2.4 stroke; the comp's signature marks are filled ──
const s = (body, vb = "0 0 24 24") => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const I = {
  chev: s('<path d="m9 5 7 7-7 7"/>'),
  back: s('<path d="m15 5-7 7 7 7"/>'),
  arrow: s('<path d="M4 12h15M13 6l6 6-6 6"/>'),
  check: s('<path d="m5 12.5 4.5 4.5L19 7"/>'),
  x: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  copy: s('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>'),
  download: s('<path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/>'),
  link: s('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  open: s('<path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H10"/>'),
  chat: s('<path d="M20 11.6a8 8 0 0 1-11.9 7l-4.6 1.3 1.3-4.4A8 8 0 1 1 20 11.6z"/><path d="M9 9.2c.2 2.6 2.7 5.2 5.6 5.6l1.2-1.4-1.8-.9-.8.8c-1-.4-1.9-1.3-2.4-2.3l.8-.8-.8-1.8L9 9.2z" stroke-width="1.6"/>'),
  mail: s('<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>'),
  search: s('<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>'),
  torch: s('<path d="M8 3.5h8l-1.5 6.5h-5zM9.5 10h5v9.5a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1z"/><path d="M12 13.5v2"/>'),
  flip: s('<path d="M4 8.5h13l-3-3M20 15.5H7l3 3"/>'),
  refresh: s('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9"/><path d="M19.5 4v5h-5"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  trash: s('<path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l1 12.5h9l1-12.5"/>'),
  out: s('<path d="M14 4.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 19.5h8M10 12h10M16.5 8l4 4-4 4"/>'),
  user: s('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.8 4-5.6 7.5-5.6s6.3 1.8 7.5 5.6"/>'),
  qr: s('<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 18.5V20M20 14v1.5"/>'),
  camera: s('<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.4-2h5.6l1.4 2h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.8" r="3.4"/>'),
  // filled, from the comp
  doc: `<svg viewBox="0 0 34 40" aria-hidden="true"><path fill="#1A43B4" d="M4 0h18l12 12v24a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z"/><path fill="#F8D5E4" d="M22 0v8a4 4 0 0 0 4 4h8z" opacity=".55"/><path stroke="#fff" stroke-width="3" stroke-linecap="round" d="M8 20h18M8 26h18M8 32h12"/></svg>`,
  ticket: `<svg viewBox="0 0 48 34" aria-hidden="true"><g transform="rotate(-24 24 17)"><path fill="#F8D5E4" d="M6 7h36v6.2a3.8 3.8 0 0 0 0 7.6V27H6v-6.2a3.8 3.8 0 0 0 0-7.6z"/><path fill="#FF2FA2" d="M12.5 10.5h18v13h-18z" opacity=".55"/><path stroke="#FF2FA2" stroke-width="2" stroke-dasharray="2 2.6" d="M34 8.5v17"/></g></svg>`,
  dotCheck: `<svg viewBox="0 0 50 50" aria-hidden="true"><circle cx="25" cy="25" r="25" fill="#FF2FA2"/><path d="m14.5 25.5 7 7 14-15" fill="none" stroke="#fff" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  okDot: `<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="26" fill="#fff"/><path d="m15 26.5 7.5 7.5L37.5 18.5" fill="none" stroke="#12844A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  xDot: `<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="26" fill="#E0144C"/><path d="m18 18 16 16M34 18 18 34" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>`,
  warnDot: `<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="26" fill="#C50F72"/><path d="M26 14v15" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="26" cy="37" r="3.2" fill="#fff"/></svg>`,
  idleDot: `<svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="26" fill="#1A43B4"/><g fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round"><path d="M15 21v-6h6M31 15h6v6M37 31v6h-6M21 37h-6v-6"/><path d="M15 26h22" stroke="#FF2FA2"/></g></svg>`,
  bigCheck: `<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="56" fill="none" stroke="#fff" stroke-width="8"/><path d="m34 62 17 17 36-38" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  bigX: `<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="56" fill="none" stroke="#fff" stroke-width="8"/><path d="m40 40 40 40M80 40 40 80" fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round"/></svg>`,
  google: `<svg class="google" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.5z"/></svg>`,
};

export function setArt(el, i, thumb = false) {
  el.style.backgroundImage = `url("${artUrl(i, thumb)}")`;
}

// One message for a free-tier project that went to sleep.
export const PAUSED_MSG = "The database is asleep (free Supabase projects pause after a week idle). The organiser can restore it from the Supabase dashboard.";

// Fill <span data-i="name"></span> placeholders with their icon.
export function paintIcons(root = document) {
  root.querySelectorAll("[data-i]").forEach((el) => { if (!el.firstChild) el.innerHTML = I[el.dataset.i] || ""; });
}
