/* Motolab AA — Mecánico Virtual (frontend standalone).
   Consume EXACTAMENTE la API de SPEC.md (base /api).
   Voz: Web Speech API del propio dispositivo (gratis, sin clave).
   Sin "Angela" en lo que ven los clientes: aquí solo "Motolab AA". */
"use strict";

const API = "/api";
const WA_NUMBER = "584227201274"; // 0422-720-1274
const WA_DISPLAY = "0422-720-1274";
const TOKEN_KEY = "mv_token";
const ADMIN_TOKEN_KEY = "mv_admin_token";
const FIRST_QUESTIONS = ["No enciende", "Hace un ruido raro", "Se apaga o pierde fuerza"];
const TZ = "America/Caracas";

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const show = (el) => el.classList.remove("hidden");
const hide = (el) => el.classList.add("hidden");
function showError(msg) {
  const el = $("error");
  if (!msg) { hide(el); el.textContent = ""; return; }
  el.textContent = msg;
  show(el);
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeZone: TZ }).format(new Date(iso));
  } catch { return new Date(iso).toLocaleDateString(); }
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* Formato automático: cédula V-12345678, teléfono 0412-1234567 */
function formatCedulaInput(input) {
  const digits = input.value.replace(/\D/g, "").slice(0, 8);
  input.value = digits ? `V-${digits}` : "";
}
function formatPhoneInput(input) {
  const digits = input.value.replace(/\D/g, "").slice(0, 11);
  input.value = digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
}
function attachFormatters() {
  for (const id of ["reg-phone", "login-phone", "adm-reg-phone", "adm-pm-phone"]) {
    const el = $(id);
    if (el) el.addEventListener("input", () => formatPhoneInput(el));
  }
  for (const id of ["pay-cedula", "adm-pm-cedula"]) {
    const el = $(id);
    if (el) el.addEventListener("input", () => formatCedulaInput(el));
  }
  // PIN: solo números, máximo 12 (así no puede quedar una letra por error).
  for (const id of ["admin-new-pin", "admin-pin"]) {
    const el = $(id);
    if (el) el.addEventListener("input", () => { el.value = el.value.replace(/\D/g, "").slice(0, 12); });
  }
}

/* ---------- API ---------- */
async function api(path, { method = "GET", body, admin = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = admin ? localStorage.getItem(ADMIN_TOKEN_KEY) : localStorage.getItem(TOKEN_KEY);
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* ---------- voz gratis (speechSynthesis) ---------- */
/* Cheo es HOMBRE: la voz tiene que ser de hombre. Se busca una voz masculina
   en español en TODOS los idiomas antes de aceptar cualquier otra. */
let spanishVoice = null;
function pickSpanishVoice() {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices().filter((v) => /^es([-_]|$)/i.test(v.lang));
  if (!voices.length) return null;
  const prefLangs = ["es-VE", "es-ES", "es-MX", "es-US"];
  const maleHint = /male|masculin|hombre|jorge|diego|miguel|carlos|andres|alejandro|luis|pedro|juan|pablo|david|sergio|raul|enrique|fernando|roberto|javier|manuel|francisco|jose|antonio|daniel|ricardo|martin|abuelo|eddy|reed|rocko/i;
  const femaleHint = /female|femenin|mujer|monica|paulina|marisol|luciana|sofia|valentina|camila|alejandra|fernanda|carmen|elena|rosa|maria|laura|ana|isabella|gabriela|daniela|teresa|lucia|patricia|veronica|natalia|abuela|flo|sandy|shelley/i;
  const isMale = (v) => maleHint.test(v.name) && !femaleHint.test(v.name);
  const isNotFemale = (v) => !femaleHint.test(v.name);
  // 1) Voz de hombre, prefiriendo los idiomas de la lista.
  for (const lang of prefLangs) {
    const inLang = voices.filter((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
    const male = inLang.find(isMale);
    if (male) return male;
  }
  // 2) Cualquier voz de hombre en español.
  const anyMale = voices.find(isMale);
  if (anyMale) return anyMale;
  // 3) Cualquier voz en español que no sea claramente de mujer.
  const notFemale = voices.find(isNotFemale);
  if (notFemale) return notFemale;
  // 4) Último recurso: la primera voz en español.
  return voices[0];
}
function refreshVoice() {
  spanishVoice = pickSpanishVoice();
  // Si no hay voz en español, las bocinas quedan ocultas (solo texto).
  document.querySelectorAll(".speak-btn").forEach((b) => {
    b.style.display = spanishVoice ? "" : "none";
  });
}
function speak(text, btn) {
  if (!spanishVoice || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = spanishVoice;
  u.lang = spanishVoice.lang;
  u.rate = 0.95;
  u.pitch = 1; // Tono natural de la voz elegida (sin forzarla grave, que sonaba raro).
  if (btn) {
    u.onend = () => btn.classList.remove("playing");
    u.onerror = () => btn.classList.remove("playing");
    btn.classList.add("playing");
  }
  window.speechSynthesis.speak(u);
}
if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = refreshVoice;
}

/* ---------- estado ---------- */
let session = null; // {client, state, plan, pagoMovil}
let stubMode = false;
let lastQuestion = "";
let currentCauses = [];
let causeIndex = 0;
let sessionTimer = null;

const STATE_LABEL = { none: "Sin plan", pending: "Pago en revisión", active: "Activo", expired: "Vencido" };

function setStubBanner(on) {
  stubMode = on;
  if (on) show($("stub-banner")); else hide($("stub-banner"));
}

function showView(name) {
  for (const v of ["view-auth", "view-payment", "view-moto", "view-chat", "view-admin"]) hide($(v));
  show($(name));
  // La presentación (Cheo) solo se ve antes de entrar al chat o al panel.
  const hero = $("hero");
  if (hero) {
    if (name === "view-auth" || name === "view-payment" || name === "view-moto") show(hero);
    else hide(hero);
  }
  showError(null);
}

/* ---------- sesión / ruteo ---------- */
async function loadSession() {
  try {
    session = await api("/session");
  } catch (e) {
    if (e.status === 401 || e.status === 404) {
      localStorage.removeItem(TOKEN_KEY);
      session = null;
      return null;
    }
    throw e;
  }
  return session;
}

function routeByState() {
  const logoutBtn = $("nav-logout");
  if (!session) {
    hide(logoutBtn);
    showView("view-auth");
    return;
  }
  show(logoutBtn);
  const state = session.state;
  if (state === "active") {
    // Paso a paso: sin los datos de la moto no se entra al chat.
    if (!motoComplete()) {
      showView("view-moto");
      return;
    }
    showView("view-chat");
    renderMotoSummary();
    renderChatStatus();
    loadHistory();
  } else {
    // none (congelado), pending (pago en revisión) o expired: paso del pago
    showView("view-payment");
    renderPayment();
  }
}

/* Paso de la moto: los 4 datos tienen que estar para avanzar al chat. */
function motoComplete() {
  const m = motoFields();
  return Boolean(m.brand && m.model && m.year && m.cc);
}

function renderMotoSummary() {
  const m = motoFields();
  const el = $("moto-summary-text");
  if (!el) return;
  el.textContent = m.brand && m.model
    ? `Tu moto: ${m.brand} ${m.model}${m.year ? `, ${m.year}` : ""}${m.cc ? `, ${m.cc}` : ""}`
    : "Tu moto: sin datos";
}

function renderPayment() {
  const st = session?.state;
  $("expired-note").classList.toggle("hidden", st !== "expired");
  $("pending-note").classList.toggle("hidden", st !== "pending");
  const pm = session?.pagoMovil;
  $("pm-bank").textContent = pm?.bank || "—";
  $("pm-phone").textContent = pm?.phone || "—";
  $("pm-cedula").textContent = pm?.cedula || "—";
  // Si ya hay un pago en revisión, el formulario queda para cargar otro solo si hace falta.
  $("form-payment").style.display = st === "pending" ? "none" : "";
}

function renderChatStatus() {
  const c = session?.client || {};
  $("chat-user").textContent = c.username ? `@${c.username} · ${c.phone || ""}` : "—";
  const badge = $("chat-state");
  badge.textContent = STATE_LABEL[session?.state] || session?.state || "—";
  badge.className = "badge " + (session?.state === "active" ? "active" : session?.state === "pending" ? "pending" : "frozen");
  const plan = session?.plan || {};
  $("chat-plan").textContent = plan.startsAt
    ? `Plan desde el ${fmtDate(plan.startsAt)} · Activo hasta el ${fmtDate(plan.endsAt)}`
    : "Sin plan activo";
  const days = plan.daysLeft;
  $("chat-days").textContent = typeof days === "number" ? (days > 0 ? `${days} día(s) restantes` : "Vencido") : "";
  $("chat-days").className = "badge " + (typeof days === "number" && days > 0 ? "ok" : "out");
  hide($("chat-frozen"));
  hide($("chat-expired"));
}

async function refreshSessionSilently() {
  try {
    const prev = session?.state;
    await loadSession();
    // Si está en el panel de administración, no sacarla de ahí: el ruteo
    // de cliente no debe tapar el panel.
    const adminEl = $("view-admin");
    if (adminEl && !adminEl.classList.contains("hidden")) return;
    if (!session) { routeByState(); return; }
    if (prev !== session.state) {
      routeByState();
    } else if (session.state === "active") {
      renderChatStatus();
    } else {
      renderPayment();
    }
  } catch { /* sin conexión: se reintenta al minuto siguiente */ }
}

function startSessionTimer() {
  if (sessionTimer) clearInterval(sessionTimer);
  sessionTimer = setInterval(refreshSessionSilently, 60_000); // revisión de acceso cada minuto
}

/* ---------- chat ---------- */
function waLink(part) {
  const text = `Hola Motolab AA, me interesa el repuesto ${part.code} — ${part.description || ""}. ¿Me confirma precio y disponibilidad?`;
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
}

function addMessage({ who, text, greeting = false, causes = null, parts = null, showGuided = false }) {
  const log = $("chat-log");
  const div = document.createElement("div");
  div.className = `msg ${who === "user" ? "user" : "cheo"}${greeting ? " greeting" : ""}`;
  const whoEl = document.createElement("span");
  whoEl.className = "who" + (who === "user" ? " user-who" : "");
  whoEl.textContent = who === "user" ? "Tú" : "Cheo";
  div.appendChild(whoEl);
  const body = document.createElement("div");
  body.textContent = text;
  div.appendChild(body);

  if (Array.isArray(causes) && causes.length) {
    const ul = document.createElement("ul");
    ul.className = "causes";
    for (const c of causes) {
      const li = document.createElement("li");
      li.textContent = c;
      ul.appendChild(li);
    }
    div.appendChild(ul);
  }
  if (Array.isArray(parts) && parts.length) {
    const wrap = document.createElement("div");
    wrap.className = "parts";
    for (const p of parts) {
      const card = document.createElement("div");
      card.className = "part-card";
      const code = document.createElement("span");
      code.className = "code";
      code.textContent = p.code;
      const desc = document.createElement("div");
      desc.textContent = p.description || "";
      const price = document.createElement("div");
      price.className = "price";
      price.textContent = p.price != null && p.price !== "" ? `$${p.price}` : "Precio a consultar";
      const wa = document.createElement("a");
      wa.className = "wa-btn";
      wa.href = waLink(p);
      wa.target = "_blank";
      wa.rel = "noopener";
      wa.textContent = `WhatsApp ${WA_DISPLAY}`;
      card.append(code, desc, price, wa);
      wrap.appendChild(card);
    }
    div.appendChild(wrap);
  }

  // Bocina "Escuchar" en cada respuesta de Cheo, NUNCA en el saludo.
  if (who === "cheo" && !greeting) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "speak-btn";
    btn.textContent = "🔊 Escuchar";
    if (!spanishVoice) btn.style.display = "none";
    btn.addEventListener("click", () => speak(text, btn));
    div.appendChild(btn);
  }
  if (showGuided) {
    const g = document.createElement("div");
    g.className = "guided";
    const mk = (label, mode) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn";
      b.textContent = label;
      b.addEventListener("click", () => sendGuided(mode));
      return b;
    };
    g.append(mk("Ya lo revisé, no es eso", "not-that"), mk("¡Era eso!", "solved"),
             mk("Explícame más fácil", "explain-easier"), mk("¿Cómo lo hago?", "how-to"));
    div.appendChild(g);
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

function renderQuickChips(questions, withFollowup) {
  const wrap = $("quick-chips");
  wrap.innerHTML = "";
  if (withFollowup) {
    const p = document.createElement("p");
    p.className = "followup";
    p.textContent = "¿No te quedó claro? Sigue preguntándole a Cheo";
    wrap.appendChild(p);
  }
  for (const q of questions) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = q;
    b.addEventListener("click", () => ask(q, "question"));
    wrap.appendChild(b);
  }
}

function motoFields() {
  const v = (id) => $(id).value.trim();
  const out = {};
  if (v("moto-brand")) out.brand = v("moto-brand");
  if (v("moto-model")) out.model = v("moto-model");
  if (v("moto-year")) out.year = v("moto-year");
  if (v("moto-cc")) out.cc = v("moto-cc");
  return out;
}

/* Los datos de la moto se guardan en este teléfono: se escriben una sola vez. */
const MOTO_KEY = "mv_moto";
function saveMoto() {
  try { localStorage.setItem(MOTO_KEY, JSON.stringify(motoFields())); } catch {}
}
function loadMoto() {
  try {
    const m = JSON.parse(localStorage.getItem(MOTO_KEY) || "{}");
    const map = { brand: "moto-brand", model: "moto-model", year: "moto-year", cc: "moto-cc" };
    for (const [key, id] of Object.entries(map)) {
      if (m[key] && $(id)) $(id).value = m[key];
    }
  } catch {}
}

async function ask(message, mode = "question", causeIdx = undefined) {
  if (!message.trim()) return;
  showError(null);
  // Cheo no responde sin los datos de la moto (los 4 datos).
  if (mode === "question") {
    if (!motoComplete()) {
      showError("Primero completa los datos de tu moto, para que Cheo te ayude bien.");
      showView("view-moto");
      return;
    }
  }
  lastQuestion = message;
  if (mode === "question") {
    addMessage({ who: "user", text: message });
    currentCauses = [];
    causeIndex = 0;
  }
  $("ask-input").value = "";
  renderQuickChips([], false);
  try {
    const res = await api("/ask", {
      method: "POST",
      body: { message, mode, ...(causeIdx !== undefined ? { causeIndex: causeIdx } : {}), ...motoFields() },
    });
    if (res.stub) setStubBanner(true);
    if (res.state) {
      session = { ...session, state: res.state };
      if (res.state !== "active") { routeByState(); return; }
    }
    if (res.greeting) {
      addMessage({ who: "cheo", greeting: true, text: "¡Hola! Soy Cheo, el mecánico. ¿En qué te puedo ayudar?" });
    }
    currentCauses = Array.isArray(res.causes) ? res.causes : [];
    causeIndex = 0;
    addMessage({
      who: "cheo",
      text: res.answer || "",
      causes: currentCauses.length ? currentCauses : null,
      parts: res.parts || null,
      showGuided: mode !== "solved",
    });
    renderQuickChips(FIRST_QUESTIONS, true);
  } catch (e) {
    if (e.status === 403) {
      showError("Tu plan no está activo. Completa el pago para seguir preguntando.");
      await refreshSessionSilently();
    } else {
      showError(`No se pudo enviar la pregunta: ${e.message}`);
      renderQuickChips(FIRST_QUESTIONS, true);
    }
  }
}

async function sendGuided(mode) {
  if (!lastQuestion) return;
  if (mode === "not-that") {
    // Pasa a la siguiente causa sin repetir las descartadas.
    const next = causeIndex + 1;
    if (currentCauses.length && next >= currentCauses.length) {
      addMessage({ who: "user", text: "Ya lo revisé, no es eso" });
      addMessage({
        who: "cheo",
        text: "Ya descartamos las causas más probables. Lo mejor es que lo revise un mecánico presencial, o escríbenos por WhatsApp al 0422-720-1274 y te ayudamos.",
        showGuided: false,
      });
      return;
    }
    causeIndex = next;
    addMessage({ who: "user", text: "Ya lo revisé, no es eso" });
    await ask(lastQuestion, "not-that", causeIndex);
    return;
  }
  const labels = { solved: "¡Era eso!", "explain-easier": "Explícame más fácil", "how-to": "¿Cómo lo hago?" };
  addMessage({ who: "user", text: labels[mode] || mode });
  await ask(lastQuestion, mode, causeIndex);
}

async function loadHistory() {
  try {
    const res = await api("/history");
    const items = res.consultations || [];
    if (!items.length) {
      renderQuickChips(FIRST_QUESTIONS, false);
      return;
    }
    // El historial trae solo las últimas 48 h; se muestra en orden cronológico.
    for (const c of [...items].reverse()) {
      addMessage({ who: "user", text: c.question });
      addMessage({ who: "cheo", text: c.answer, showGuided: false });
    }
    renderQuickChips(FIRST_QUESTIONS, true);
  } catch {
    renderQuickChips(FIRST_QUESTIONS, false);
  }
}

/* ---------- auth cliente ---------- */
function bindAuth() {
  $("tab-register").addEventListener("click", () => {
    $("tab-register").classList.add("active");
    $("tab-login").classList.remove("active");
    show($("form-register")); hide($("form-login"));
  });
  $("tab-login").addEventListener("click", () => {
    $("tab-login").classList.add("active");
    $("tab-register").classList.remove("active");
    show($("form-login")); hide($("form-register"));
  });

  $("form-register").addEventListener("submit", async (e) => {
    e.preventDefault();
    showError(null);
    try {
      const res = await api("/register", {
        method: "POST",
        body: { username: $("reg-username").value.trim(), phone: $("reg-phone").value.trim() },
      });
      localStorage.setItem(TOKEN_KEY, res.token);
      session = { client: res.client, state: res.state, planEndsAt: res.planEndsAt, plan: res.plan || null };
      await loadSession();
      routeByState();
    } catch (err) {
      if (err.status === 409) {
        showError("Ese usuario ya lo tiene otra cuenta o ese número ya está registrado. Prueba con otro usuario o entra con tu cuenta.");
      } else {
        showError(`No se pudo registrar: ${err.message}`);
      }
    }
  });

  $("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    showError(null);
    try {
      const res = await api("/login", {
        method: "POST",
        body: { username: $("login-username").value.trim(), phone: $("login-phone").value.trim() },
      });
      localStorage.setItem(TOKEN_KEY, res.token);
      session = { client: res.client, state: res.state, planEndsAt: res.planEndsAt, plan: res.plan || null };
      await loadSession();
      routeByState();
    } catch (err) {
      if (err.status === 404) showError("No encontramos esa cuenta. Revisa el usuario y el teléfono, o regístrate.");
      else showError(`No se pudo entrar: ${err.message}`);
    }
  });
}

/* ---------- pago ---------- */
function bindPayment() {
  $("form-payment").addEventListener("submit", async (e) => {
    e.preventDefault();
    showError(null);
    try {
      await api("/request-plan", {
        method: "POST",
        body: {
          payerName: $("pay-payerName").value.trim(),
          cedula: $("pay-cedula").value.trim(),
          amountBs: Number($("pay-amountBs").value),
          reference: $("pay-reference").value.trim(),
          bank: $("pay-bank").value.trim(),
        },
      });
      await loadSession();
      routeByState();
      showError(null);
    } catch (err) {
      showError(`No se pudo cargar el pago: ${err.message}`);
    }
  });
}

/* ---------- panel ---------- */
let adminStatus = null;

async function checkAdminStatus() {
  try {
    adminStatus = await api("/admin/status", { admin: true });
  } catch {
    adminStatus = { pinSet: false, pendingPayments: 0 };
  }
  if (adminStatus.pinSet) {
    show($("form-admin-pin")); hide($("form-admin-setpin"));
  } else {
    hide($("form-admin-pin")); show($("form-admin-setpin"));
  }
  return adminStatus;
}

async function loadDashboard() {
  try {
    const dash = await api("/admin/dashboard", { admin: true });
    const banner = $("admin-pending-banner");
    const n = dash.payments?.length || 0;
    if (n > 0) {
      banner.textContent = `Tienes ${n} pago(s) nuevo(s) por confirmar.`;
      show(banner);
    } else hide(banner);

    const payWrap = $("admin-payments");
    payWrap.innerHTML = "";
    if (!n) payWrap.innerHTML = '<p class="empty">No hay pagos por confirmar.</p>';
    for (const p of dash.payments || []) {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="row"><strong>${esc(p.clientUsername || "")}</strong><span>${esc(p.clientPhone || "")}</span></div>
        <div>Quien paga: ${esc(p.payerName || "")} · Cédula: ${esc(p.cedula || "")}</div>
        <div>Monto: ${esc(String(p.amountBs ?? ""))} Bs · Banco: ${esc(p.bank || "")}</div>
        <div>Referencia: <strong>${esc(p.reference || "")}</strong> · ${esc(fmtDate(p.createdAt))}</div>`;
      const actions = document.createElement("div");
      actions.className = "actions";
      const ok = document.createElement("button");
      ok.type = "button"; ok.className = "btn small primary"; ok.textContent = "Confirmar pago";
      ok.addEventListener("click", () => decidePayment(p.id, "confirm"));
      const no = document.createElement("button");
      no.type = "button"; no.className = "btn small danger"; no.textContent = "No llegó";
      no.addEventListener("click", () => decidePayment(p.id, "reject"));
      actions.append(ok, no);
      div.appendChild(actions);
      payWrap.appendChild(div);
    }

    const clWrap = $("admin-clients");
    clWrap.innerHTML = "";
    const clients = dash.clients || [];
    if (!clients.length) clWrap.innerHTML = '<p class="empty">No hay clientes todavía.</p>';
    for (const c of clients) {
      const active = c.state === "active";
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="row"><strong>${esc(c.username)}</strong><span>${esc(c.phone)}</span></div>
        <div><span class="badge ${active ? "active" : "expired"}">${esc(STATE_LABEL[c.state] || c.state)}</span></div>
        <div>Plan desde el ${esc(fmtDate(c.planStartsAt))} · Activo hasta el ${esc(fmtDate(c.planEndsAt))}</div>
        <div class="muted">Consultas hoy: ${esc(String(c.consultationsToday ?? 0))} · últimas 48 h: ${esc(String(c.consultations48h ?? 0))}${c.bank ? ` · Banco: ${esc(c.bank)}` : ""}${c.reference ? ` · Ref: ${esc(c.reference)}` : ""}</div>`;
      const actions = document.createElement("div");
      actions.className = "actions";
      const toggle = document.createElement("button");
      toggle.type = "button"; toggle.className = "btn small";
      toggle.textContent = active ? "Desactivar" : "Activar";
      toggle.addEventListener("click", () => setActive(c.id, !active));
      actions.appendChild(toggle);
      div.appendChild(actions);
      clWrap.appendChild(div);
    }

    // Datos de pago móvil actuales en el formulario.
    const st = await api("/admin/status", { admin: true });
    if (st.pagoMovil) {
      $("adm-pm-bank").value = st.pagoMovil.bank || "";
      $("adm-pm-phone").value = st.pagoMovil.phone || "";
      $("adm-pm-cedula").value = st.pagoMovil.cedula || "";
    }
  } catch (e) {
    // Token viejo (el servidor se reinició y lo olvidó): volver al PIN para entrar de nuevo.
    if (e.status === 401 || e.message === "unauthorized") {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      hide($("admin-dash")); show($("admin-auth"));
      $("admin-pin").value = "";
      await checkAdminStatus();
      showError(null);
      return;
    }
    showError(`No se pudo cargar el panel: ${e.message}`);
  }
}

async function decidePayment(paymentId, decision) {
  try {
    const res = await api("/admin/decide", { method: "POST", admin: true, body: { paymentId, decision } });
    if (res && res.message) showError(null);
    await loadDashboard();
  } catch (e) {
    showError(`No se pudo decidir el pago: ${e.message}`);
  }
}

async function setActive(clientId, active) {
  try {
    await api("/admin/set-active", { method: "POST", admin: true, body: { clientId, active } });
    await loadDashboard();
  } catch (e) {
    showError(`No se pudo cambiar el estado: ${e.message}`);
  }
}

function bindAdmin() {
  $("form-admin-setpin").addEventListener("submit", async (e) => {
    e.preventDefault();
    showError(null);
    const pin = $("admin-new-pin").value.replace(/\D/g, "");
    if (pin.length < 4) {
      showError("El PIN debe tener al menos 4 números.");
      return;
    }
    try {
      const res = await api("/admin/set-pin", { method: "POST", admin: true, body: { pin } });
      if (res && res.adminToken) localStorage.setItem(ADMIN_TOKEN_KEY, res.adminToken);
      hide($("admin-auth")); show($("admin-dash"));
      await loadDashboard();
      showError(null);
    } catch (err) {
      if (err.message === "invalid-pin") showError("El PIN debe ser solo números, de 4 a 12.");
      else if (err.message === "pin-already-set") {
        showError("Ya hay un PIN creado. Usa el PIN para entrar.");
        await checkAdminStatus();
      }
      else showError(`No se pudo crear el PIN: ${err.message}`);
    }
  });
  $("form-admin-pin").addEventListener("submit", async (e) => {
    e.preventDefault();
    showError(null);
    try {
      const res = await api("/admin/login", { method: "POST", admin: true, body: { pin: $("admin-pin").value } });
      localStorage.setItem(ADMIN_TOKEN_KEY, res.adminToken);
      hide($("admin-auth")); show($("admin-dash"));
      await loadDashboard();
    } catch {
      showError("PIN incorrecto.");
    }
  });
  $("form-admin-register").addEventListener("submit", async (e) => {
    e.preventDefault();
    showError(null);
    try {
      const res = await api("/admin/register-client", {
        method: "POST", admin: true,
        body: {
          username: $("adm-reg-username").value.trim(),
          phone: $("adm-reg-phone").value.trim(),
          bank: $("adm-reg-bank").value.trim(),
          reference: $("adm-reg-reference").value.trim(),
        },
      });
      e.target.reset();
      if (res && res.message) showError(res.message);
      await loadDashboard();
    } catch (err) {
      showError(`No se pudo registrar al cliente: ${err.message}`);
    }
  });
  $("form-admin-pagomovil").addEventListener("submit", async (e) => {
    e.preventDefault();
    showError(null);
    try {
      await api("/admin/save-pago-movil", {
        method: "POST", admin: true,
        body: {
          bank: $("adm-pm-bank").value.trim(),
          phone: $("adm-pm-phone").value.trim(),
          cedula: $("adm-pm-cedula").value.trim(),
        },
      });
      await loadDashboard();
    } catch (err) {
      showError(`No se pudieron guardar los datos: ${err.message}`);
    }
  });
  $("btn-export").addEventListener("click", async () => {
    try {
      const token = localStorage.getItem(ADMIN_TOKEN_KEY);
      const res = await fetch(`${API}/admin/export`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "clientes-mecanico-virtual.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      showError(`No se pudo descargar el respaldo: ${e.message}`);
    }
  });
  $("btn-cleanup").addEventListener("click", async () => {
    try {
      await api("/admin/cleanup", { method: "POST", admin: true });
      await loadDashboard();
    } catch (e) {
      showError(`No se pudo limpiar: ${e.message}`);
    }
  });
  $("btn-admin-logout").addEventListener("click", () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    hide($("admin-dash")); show($("admin-auth"));
    $("admin-pin").value = "";
    checkAdminStatus();
  });
}

async function openAdmin() {
  showView("view-admin");
  await checkAdminStatus();
  if (localStorage.getItem(ADMIN_TOKEN_KEY)) {
    hide($("admin-auth")); show($("admin-dash"));
    await loadDashboard();
  } else {
    show($("admin-auth")); hide($("admin-dash"));
  }
}

/* ---------- arranque ---------- */
async function init() {
  attachFormatters();
  loadMoto();
  for (const id of ["moto-brand", "moto-model", "moto-year", "moto-cc"]) {
    const el = $(id);
    if (el) el.addEventListener("input", saveMoto);
  }
  bindAuth();
  bindPayment();
  bindAdmin();
  refreshVoice();

  $("form-ask").addEventListener("submit", (e) => {
    e.preventDefault();
    ask($("ask-input").value.trim(), "question");
  });
  $("form-moto").addEventListener("submit", (e) => {
    e.preventDefault();
    saveMoto();
    if (!motoComplete()) {
      showError("Faltan datos de tu moto: llena marca, modelo, año y cilindrada.");
      return;
    }
    routeByState();
  });
  $("btn-edit-moto").addEventListener("click", () => showView("view-moto"));
  $("nav-chat").addEventListener("click", async () => {
    if (localStorage.getItem(TOKEN_KEY)) {
      await loadSession();
      routeByState();
    } else {
      showView("view-auth");
    }
  });
  $("nav-admin").addEventListener("click", openAdmin);
  $("nav-logout").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    window.speechSynthesis?.cancel();
    session = null;
    $("chat-log").innerHTML = "";
    routeByState();
  });
  $("btn-goto-payment").addEventListener("click", () => { showView("view-payment"); renderPayment(); });
  $("btn-goto-payment-2").addEventListener("click", () => { showView("view-payment"); renderPayment(); });

  // Aviso de modo stub desde /api/health (sin bloquear si el backend no responde).
  try {
    const health = await api("/health");
    if (health.stub) setStubBanner(true);
  } catch { /* el backend aún no está arriba; se sabrá al usar la app */ }

  if (location.hash === "#admin") {
    await openAdmin();
  } else if (localStorage.getItem(TOKEN_KEY)) {
    try {
      await loadSession();
    } catch (e) {
      showError(`No se pudo conectar con el servidor: ${e.message}`);
    }
    routeByState();
  } else {
    routeByState();
  }
  startSessionTimer();
}

init();
