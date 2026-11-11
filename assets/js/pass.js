// The attendee's pass. Public at /p/#<token>; reads only its own pass through gp_pass().
import { cfg, configured, rpc, esc, fmtWhen, fmtTime, qrSvg, setArt, passUrl, copyText, toast, I, PAUSED_MSG } from "./core.js";

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

function render(p) {
  const ev = p.event;
  document.title = `${p.name} · ${ev.name} · GatePass`;
  const used = !!p.checked_in_at;
  view.innerHTML = `
    <div class="ticket-wrap">
      <article class="ticket ${used ? "used" : ""}" aria-label="Entry pass for ${esc(p.name)}">
        <div class="t-art" role="img" aria-label=""></div>
        <div class="t-body">
          <h1 class="t-name ink">${esc(p.name)}</h1>
          <div class="t-rule ink"></div>
          <p class="t-event ink">${esc(ev.name)}</p>
          <p class="t-when">${esc(fmtWhen(ev.starts_at))}</p>
          ${ev.venue ? `<p class="t-where">${esc(ev.venue)}</p>` : ""}
        </div>
        <div class="t-qr">
          ${qrSvg(passUrl(token), { label: `Entry QR for ${p.name}` })}
          ${used ? `<div class="t-stamp"><div>Checked in<small>${esc(fmtTime(p.checked_in_at))} · ${esc(p.gate)}</small></div></div>` : ""}
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
  setArt(view.querySelector(".t-art"), ev.art);
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
