// The attendee's pass. Public at /p/#<token>; reads only its own pass through gp_pass().
import { configured, rpc, esc, escT, typo, fmtWhen, fmtTime, qrSvg, setArt, passUrl, copyText, toast, I, ROOT, PAUSED_MSG } from "./core.js";

const view = document.getElementById("view");
const token = decodeURIComponent((location.hash || "").replace(/^#\/?/, "")).trim();

function missing(title, body) {
  document.title = "Pass not found · GatePass";
  view.innerHTML = `
    <section class="torn">
      <h1>${esc(title)}</h1>
      <p class="sub">${body}</p>
    </section>`;
}

async function load() {
  if (!configured) return missing("Not set up yet", "This copy of GatePass has no Supabase project in <code>config.js</code>.");
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) {
    return missing("No pass here", "This link is incomplete. Open the whole link from your message again, or ask the organiser to resend it.");
  }
  let p;
  try {
    p = await rpc("gp_pass", { p_token: token });
  } catch (e) {
    if (e.offline) return missing("You're offline", "Connect to the internet once to load your pass. After that, a screenshot works at the gate too (once).");
    if (e.paused) return missing("Back in a minute", esc(PAUSED_MSG));
    return missing("Couldn't load", esc(e.message));
  }
  if (!p) return missing("No pass here", "This pass doesn't exist or the event was deleted. Ask the organiser to resend your link.");
  render(p);
}

// ── the ticket stock: one SVG measured to the ticket, so the scallops, notches and the
//    printed frame are one shape (the frame runs along the stock edge and the bites cut through it).
const img = (f) => new URL(`assets/img/${f}`, ROOT).href;
function shape(t) {
  const W = t.clientWidth, H = t.clientHeight;
  const tear = t.querySelector(".t-tear");
  if (!W || !H || !tear) return;
  const k = 2.5;                                   // inset so the whole frame stroke stays on the stock
  const w = W - 2 * k, h = H - 2 * k;
  const ty = tear.offsetTop + 2 - k;               // centre of the dotted tear line
  const r = 6, pitch = 19, C = 11, R = 13;         // bite, bite pitch, centre notch, side notch
  const centres = [];
  const n = Math.floor((w - 24) / pitch);
  const x0 = (w - (n - 1) * pitch) / 2;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * pitch;
    if (Math.abs(x - w / 2) > C + r + 3) centres.push([x, r]);
  }
  centres.push([w / 2, C]);
  centres.sort((a, b) => a[0] - b[0]);
  const f = (v) => +v.toFixed(2);
  let d = `M0 0`;
  for (const [x, q] of centres) d += `L${f(x - q)} 0A${q} ${q} 0 0 0 ${f(x + q)} 0`;
  d += `L${f(w)} 0L${f(w)} ${f(ty - R)}A${R} ${R} 0 0 0 ${f(w)} ${f(ty + R)}L${f(w)} ${f(h)}`;
  for (const [x, q] of [...centres].reverse()) d += `L${f(x + q)} ${f(h)}A${q} ${q} 0 0 0 ${f(x - q)} ${f(h)}`;
  d += `L0 ${f(h)}L0 ${f(ty + R)}A${R} ${R} 0 0 0 0 ${f(ty - R)}Z`;
  t.querySelector(".t-shape").innerHTML = `
    <defs>
      <pattern id="gp-stock" patternUnits="userSpaceOnUse" width="512" height="512">
        <rect width="512" height="512" fill="#F7CFDF"/><image href="${img("mottle.png")}" width="512" height="512"/>
      </pattern>
      <pattern id="gp-inkpat" patternUnits="userSpaceOnUse" width="256" height="256"><image href="${img("ink.png")}" width="256" height="256"/></pattern>
      <mask id="gp-ink" maskUnits="userSpaceOnUse" x="-10" y="-10" width="${W + 20}" height="${H + 20}" style="mask-type:alpha"><rect x="-10" y="-10" width="${W + 20}" height="${H + 20}" fill="url(#gp-inkpat)"/></mask>
      <filter id="gp-rough" x="-4%" y="-4%" width="108%" height="108%">
        <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="11" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
    </defs>
    <g transform="translate(${k} ${k})">
      <path d="${d}" fill="url(#gp-stock)"/>
      <path d="${d}" fill="none" stroke="#1A43B4" stroke-opacity=".3" stroke-width="2" transform="translate(1.3 1.1)" filter="url(#gp-rough)"/>
      <g mask="url(#gp-ink)"><path d="${d}" fill="none" stroke="#FF2FA2" stroke-width="4.6" stroke-linejoin="round" filter="url(#gp-rough)"/></g>
    </g>`;
}

function render(p) {
  const ev = p.event;
  document.title = `${p.name} · ${typo(ev.name)} · GatePass`;
  const used = !!p.checked_in_at;
  view.innerHTML = `
    <div class="ticket-wrap">
      <article class="ticket ${used ? "used" : ""}" aria-label="Entry pass for ${esc(p.name)}">
        <svg class="t-shape" aria-hidden="true" focusable="false"></svg>
        <div class="t-art" role="img" aria-label=""></div>
        <div class="t-body">
          <h1 class="t-name ink">${esc(p.name)}</h1>
          <div class="t-rule inked"></div>
          <p class="t-event ink">${escT(ev.name)}</p>
          <p class="t-when">${esc(fmtWhen(ev.starts_at))}</p>
          ${ev.venue ? `<p class="t-where">${esc(ev.venue)}</p>` : ""}
        </div>
        <div class="t-qr">
          ${qrSvg(passUrl(token), { label: `Entry QR for ${p.name}`, ghost: "#FF2FA2" })}
          ${used ? `<div class="t-stamp"><div class="inked">Checked in<small>${esc(fmtTime(p.checked_in_at))} · ${esc(p.gate)}</small></div></div>` : ""}
        </div>
        <div class="t-tear" aria-hidden="true"></div>
        <div class="t-stub ink">${used ? "Already used" : "Show this at the gate"}</div>
      </article>
    </div>
    <div class="pass-notes">
      <p class="fine">${used
        ? "This pass let someone in already. If that wasn't you, find the organiser at the gate."
        : "Turn your brightness up at the gate. A screenshot works too, but only once: the first scan lets you in."}</p>
    </div>
    <div class="pass-actions">
      <button class="btn small" type="button" id="copy">${I.link}Copy pass link</button>
    </div>`;
  const t = view.querySelector(".ticket");
  setArt(view.querySelector(".t-art"), ev.art);
  shape(t);
  new ResizeObserver(() => shape(t)).observe(t);
  document.fonts?.ready.then(() => shape(t));
  view.querySelector("#copy").addEventListener("click", async () => {
    (await copyText(passUrl(token))) ? toast("Pass link copied") : toast("Couldn't copy. Long-press the address bar.", "x");
  });
  keepAwake();
}

// Keep the screen on while the pass is open (no-op where unsupported).
let lock;
async function keepAwake() {
  try { lock = await navigator.wakeLock?.request("screen"); } catch {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && lock?.released) keepAwake(); });
window.addEventListener("hashchange", () => location.reload());

load();
