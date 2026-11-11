// Gate scanner. Staff hold the event's gate code; every call is a code-checked RPC.
import { configured, rpc, esc, fmtTime, fmtCode, store, I, paintIcons, plural, PAUSED_MSG } from "./core.js";
import { Camera, decode, tokenFrom } from "./scanner.js";

const $ = (id) => document.getElementById(id);
const joinEl = $("join"), scanEl = $("scan");
const S = {
  code: null, gate: "Gate 1", event: null,
  device: store.get("gp.device") || Math.random().toString(36).slice(2, 10),
  last: { token: null, seen: 0, text: null, textSeen: 0 },
  busy: false, statsTimer: null, loopOn: false,
};
store.set("gp.device", S.device);
paintIcons();
$("findBtn").innerHTML = `${I.search}Find by name`;
$("photoLbl").innerHTML = `<span style="display:inline-flex;gap:10px;align-items:center">${I.camera}Scan a photo</span>`;

// ── sound + buzz (unlocked on the first tap) ──
let ac;
function unlockAudio() { try { ac ||= new (window.AudioContext || window.webkitAudioContext)(); ac.resume?.(); } catch {} }
document.addEventListener("pointerdown", unlockAudio, { once: true });
function tone(freq, start, dur, type = "sine", gain = 0.2) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  o.connect(g).connect(ac.destination);
  o.start(ac.currentTime + start); o.stop(ac.currentTime + start + dur + 0.05);
}
const sounds = {
  ok() { tone(988, 0, 0.11, "sine", 0.25); tone(1480, 0.12, 0.16, "sine", 0.25); navigator.vibrate?.(70); },
  dup() { tone(150, 0, 0.5, "sawtooth", 0.22); tone(155, 0, 0.5, "square", 0.08); navigator.vibrate?.([90, 60, 90, 60, 220]); },
  warn() { tone(440, 0, 0.14, "triangle", 0.2); tone(330, 0.16, 0.2, "triangle", 0.2); navigator.vibrate?.([50, 40, 50]); },
};

// ── verdict ──
const verdictEl = $("verdict");
function verdict(kind, main, sub = "") {
  const ico = { ok: I.okDot, dup: I.xDot, warn: I.warnDot, idle: I.idleDot }[kind];
  verdictEl.className = `verdict ${kind}`;
  verdictEl.innerHTML = `<span class="v-ico">${ico}</span><div class="v-text"><p class="v-main">${main}</p>${sub ? `<p class="v-sub">${sub}</p>` : ""}</div>`;
  if (kind !== "idle") { void verdictEl.offsetWidth; verdictEl.classList.add("pop"); }
}
function flash(kind) {
  const f = $("flash");
  f.className = `flash ${kind}`;
  f.innerHTML = kind === "ok" ? I.bigCheck : I.bigX;
  void f.offsetWidth;
  f.classList.add("show");
}
const idle = () => verdict("idle", "Point the camera at a pass", "The first scan lets them in. Any repeat goes red on every phone.");

function setCounts(c) {
  if (!c) return;
  $("cNum").textContent = `${c.checked} / ${c.total}`;
  $("cBar").style.setProperty("--p", c.total ? Math.min(1, c.checked / c.total) : 0);
}

function showResult(r) {
  if (!r) return;
  setCounts(r.counts);
  switch (r.status) {
    case "ok":
      flash("ok"); sounds.ok();
      verdict("ok", `${esc(r.name)} <span class="sep">· First scan</span>`, `Let them in · ${esc(fmtTime(r.scanned_at))}`);
      break;
    case "dup":
      flash("dup"); sounds.dup();
      verdict("dup", `Already scanned at ${esc(fmtTime(r.first_at))}`,
        `${esc(r.name)} · first scan at ${esc(r.first_gate)}${r.same_device ? " (this phone)" : ""} · ${plural(r.repeats, "repeat")}`);
      break;
    case "wrong_event":
      sounds.warn(); verdict("warn", "Pass for another event", "This QR is a GatePass pass, but not for this event. Don't let them in on it.");
      break;
    case "unknown":
      sounds.warn(); verdict("warn", "Not on the list", "This pass isn't in this event's registrations.");
      break;
    case "bad_code":
      sounds.warn(); leave("The organiser changed this gate's code. Ask them for the new one.");
      return;
  }
  loadStats();
}

async function scanToken(token) {
  S.busy = true;
  try {
    showResult(await rpc("gp_scan", { p_code: S.code, p_token: token, p_gate: S.gate, p_device: S.device }));
  } catch (e) {
    sounds.warn();
    verdict("warn", e.offline ? "No connection" : e.paused ? "Database asleep" : "Couldn't check that pass",
      e.offline ? "Not checked. Don't let them in until a scan goes green." : esc(e.paused ? PAUSED_MSG : e.message));
    S.last.token = null; // allow an immediate retry
  } finally {
    S.busy = false;
  }
}

// Called with every decoded QR text (camera, photo, or tests).
async function handleText(text) {
  const now = Date.now();
  const token = tokenFrom(text);
  if (!token) {
    if (text === S.last.text && now - S.last.textSeen < 3000) { S.last.textSeen = now; return; }
    S.last.text = text; S.last.textSeen = now;
    sounds.warn(); verdict("warn", "Not a GatePass QR", "That code isn't an entry pass.");
    return;
  }
  // The same pass sitting in front of the camera is one scan, not twenty.
  if (token === S.last.token && now - S.last.seen < 3500) { S.last.seen = now; return; }
  if (S.busy) return;
  S.last.token = token; S.last.seen = now;
  await scanToken(token);
}
window.GatePassGate = { handleText }; // handy for testing in the console

// ── stats ──
async function loadStats() {
  if (!S.code) return;
  try {
    const st = await rpc("gp_gate_stats", { p_code: S.code });
    if (!st) return leave("The organiser changed this gate's code. Ask them for the new one.");
    setCounts(st.counts);
    $("recent").innerHTML = st.recent.length ? st.recent.map((r) => `
      <li>
        <span class="${r.is_first ? "r-ok" : "r-dup"}">${r.is_first ? I.check : I.x}</span>
        <span class="r-name">${esc(r.name)}</span>
        <span class="r-at">${r.is_first ? "" : "repeat · "}${esc(r.gate)} · ${esc(fmtTime(r.scanned_at))}</span>
      </li>`).join("") : `<li><span class="r-at">Nobody scanned yet.</span></li>`;
  } catch {}
}

// ── camera ──
const cam = new Camera($("video"));
const camMsg = $("camMsg"), viewport = $("viewport");
function camMessage(title, body, action) {
  camMsg.innerHTML = `<h3>${title}</h3><p>${body}</p>${action ? `<button class="btn small" type="button" id="camAct">${action}</button>` : ""}`;
  camMsg.hidden = false;
  camMsg.querySelector("#camAct")?.addEventListener("click", () => { unlockAudio(); startCamera(); });
}
async function startCamera() {
  camMsg.hidden = true;
  try {
    await cam.start();
  } catch (e) {
    viewport.classList.remove("hunting");
    if (e.kind === "denied") return camMessage("Camera blocked", "Allow camera access for this site in your browser settings, then try again. Meanwhile, use Find by name.", "Try again");
    if (e.kind === "none") return camMessage("No camera found", "Use Find by name or Scan a photo below.", "Try again");
    if (e.kind === "unsupported") return camMessage("Camera unavailable", "Open this page in Chrome or Safari (not inside Instagram) to use the camera. Find by name still works.", null);
    return camMessage("Camera didn't start", esc(e.message), "Try again");
  }
  viewport.classList.add("hunting");
  renderCamTools();
  loop();
}
function renderCamTools() {
  const t = $("camTools");
  t.innerHTML = `${cam.canTorch ? `<button class="icon-btn" type="button" id="torch" aria-pressed="false" aria-label="Torch">${I.torch}</button>` : ""}${cam.canFlip ? `<button class="icon-btn" type="button" id="flip" aria-label="Switch camera">${I.flip}</button>` : ""}`;
  t.querySelector("#torch")?.addEventListener("click", async (e) => { const on = await cam.torch(); e.currentTarget.setAttribute("aria-pressed", String(on)); });
  t.querySelector("#flip")?.addEventListener("click", async () => { await cam.flip(); renderCamTools(); });
}
async function loop() {
  if (S.loopOn) return;
  S.loopOn = true;
  const video = $("video");
  while (cam.running && !scanEl.hidden) {
    if (document.visibilityState === "visible" && video.readyState >= 2 && !S.busy) {
      try {
        const text = await decode(video);
        if (text) await handleText(text);
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 110));
  }
  S.loopOn = false;
}

// ── photo fallback ──
$("photo").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  e.target.value = "";
  if (!f) return;
  try {
    const bmp = await createImageBitmap(f);
    const text = await decode(bmp, { maxSide: 1400 });
    if (text) { S.last.token = null; await handleText(text); }
    else { sounds.warn(); verdict("warn", "No QR in that photo", "Get closer so the QR fills most of the picture."); }
  } catch { verdict("warn", "Couldn't read that photo", "Try another one."); }
});

// ── find by name ──
$("findBtn").addEventListener("click", openFind);
function openFind() {
  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  bg.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="findT">
      <div class="sheet-top"><h2 class="head" id="findT" style="font-size:24px">Find by name</h2>
        <button class="icon-btn" type="button" id="closeFind" aria-label="Close">${I.x}</button></div>
      <p class="sub" style="margin-bottom:12px">For a dead phone or a cracked screen. Check their ID before you let them in.</p>
      <div class="search"><span>${I.search}</span><input class="input" id="q" placeholder="Type 2+ letters of their name" autocomplete="off" enterkeyhint="search"></div>
      <ul class="passlist" id="found" style="margin-top:12px"></ul>
    </div>`;
  document.body.append(bg);
  const close = () => { bg.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  bg.addEventListener("click", (e) => { if (e.target === bg) close(); });
  bg.querySelector("#closeFind").addEventListener("click", close);
  const q = bg.querySelector("#q"), list = bg.querySelector("#found");
  q.focus();
  let t, seq = 0;
  q.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const mine = ++seq;
      if (q.value.trim().length < 2) { list.innerHTML = ""; return; }
      let rows = [];
      try { rows = await rpc("gp_gate_find", { p_code: S.code, p_query: q.value }); } catch { list.innerHTML = `<li><p class="err">Couldn't search. Check your connection.</p></li>`; return; }
      if (mine !== seq) return;
      list.innerHTML = rows.length ? rows.map((r) => `
        <li>
          <p class="pl-name">${esc(r.name)}</p>
          <p class="pl-meta">${esc(r.hint || "no contact")}${r.checked_in_at ? ` · <span style="color:var(--stop);font-weight:700">in at ${esc(fmtTime(r.checked_in_at))} · ${esc(r.gate)}</span>` : ""}</p>
          <div class="pl-actions"><button class="btn small" type="button" data-id="${r.id}">${r.checked_in_at ? "Check" : "Let in"}</button></div>
        </li>`).join("") : `<li><p class="pl-meta" style="grid-column:1/-1">Nobody by that name in this event.</p></li>`;
    }, 220);
  });
  list.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-id]");
    if (!b) return;
    b.disabled = true;
    close();
    try { showResult(await rpc("gp_gate_admit", { p_code: S.code, p_pass: b.dataset.id, p_gate: S.gate, p_device: S.device })); }
    catch (err) { verdict("warn", "Couldn't check them in", err.offline ? "No connection." : esc(err.message)); }
  });
}

// ── join / leave ──
function showJoin(msg = "") {
  scanEl.hidden = true; joinEl.hidden = false;
  const err = $("joinErr");
  err.textContent = msg; err.hidden = !msg;
}
function leave(msg = "") {
  cam.stop(); clearInterval(S.statsTimer);
  S.code = null; store.del("gp.gate");
  showJoin(msg);
}
$("leaveBtn").addEventListener("click", () => leave());

function showScanner() {
  joinEl.hidden = true; scanEl.hidden = false;
  $("evName").textContent = S.event.name;
  $("gateName").textContent = S.gate;
  document.title = `${S.gate} · ${S.event.name} · GatePass`;
  setCounts(S.event.counts);
  idle();
  loadStats();
  clearInterval(S.statsTimer);
  S.statsTimer = setInterval(() => { if (document.visibilityState === "visible") loadStats(); }, 5000);
}

async function join(code, gate, { auto = false } = {}) {
  const btn = $("joinBtn");
  btn.disabled = true;
  try {
    const ev = await rpc("gp_gate_join", { p_code: code });
    if (!ev) { if (auto) store.del("gp.gate"); return showJoin(auto ? "" : "No event has that code. Check it with the organiser; they may have made a new one."); }
    S.code = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase(); S.gate = gate; S.event = ev;
    store.set("gp.gate", { code: S.code, gate });
    showScanner();
    const perm = await navigator.permissions?.query?.({ name: "camera" }).catch(() => null);
    if (!auto || perm?.state === "granted") startCamera();
    else camMessage("Ready", "Tap to turn on the camera.", "Start camera");
  } catch (e) {
    showJoin(e.offline ? "No connection. Connect and try again." : e.paused ? PAUSED_MSG : e.message);
  } finally {
    btn.disabled = false;
  }
}

const codeIn = $("code");
codeIn.addEventListener("input", () => {
  const raw = codeIn.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);
  codeIn.value = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
  $("joinErr").hidden = true;
});
$("joinForm").addEventListener("submit", (e) => {
  e.preventDefault();
  unlockAudio();
  const raw = codeIn.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (raw.length !== 8) return showJoin("The gate code has 8 letters and numbers, like K7QM-2XPA.");
  const gate = new FormData(e.target).get("gate") || "Gate 1";
  join(raw, gate);
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.code) loadStats(); });

// ── boot ──
(function boot() {
  if (!configured) { showJoin("This copy of GatePass has no Supabase project in config.js yet."); return; }
  const fromHash = (location.hash || "").replace(/^#\/?/, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const saved = store.get("gp.gate");
  if (fromHash.length === 8) {
    codeIn.value = fmtCode(fromHash);
    history.replaceState(null, "", location.pathname);
    if (saved?.code === fromHash) return join(saved.code, saved.gate, { auto: true });
    return showJoin();
  }
  if (saved?.code) return join(saved.code, saved.gate || "Gate 1", { auto: true });
  showJoin();
})();
