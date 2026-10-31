// Threads Emmy : CRM des comptes Threads achetés (warm-up 3 semaines). Aucune dépendance.
// Interface d'Emmy en thaï parlé (boutons EN / FR). Pages admin (Awen) en français.
import { L, LANGS, ADM } from "./i18n.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = $("#app");
const lsGet = (k, d = "") => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

const S = {
  token: lsGet("em_token"),
  lang: LANGS.includes(lsGet("em_lang")) ? lsGet("em_lang") : "th",
  data: null,
  tab: lsGet("em_tab") || "today",
  filter: "alive",
  search: "",
  pass: null, // passage en cours sur un compte
  wiz: null, // ajout d'un compte
  pin: "",
  firstRun: false,
  busy: false,
  tr: { th: {}, fr: {}, en: {} },
  forAcc: "",
  trTool: { text: "", out: "", tl: "th" },
};

// ------------------------------------------------------------ langue
const LI = () => LANGS.indexOf(S.lang);
function t(k, v = {}) {
  const row = L[k];
  let s = row ? row[LI()] ?? row[2] : k;
  for (const [a, b] of Object.entries(v)) s = s.split(`{${a}}`).join(b);
  return s;
}
const tl = (k, v) => t(k, v).split("|");
// pages admin : la phrase française sert de clé, traduite en thaï / anglais (ADM dans i18n.js)
function A(fr, v = {}) {
  let s = S.lang === "fr" ? fr : (ADM[fr] || [])[S.lang === "th" ? 0 : 1] || fr;
  for (const [a, b] of Object.entries(v)) s = s.split(`{${a}}`).join(b);
  return s;
}
const LANG_NAME = { fr: { th: "ฝรั่งเศส", en: "French", fr: "français" }, en: { th: "อังกฤษ", en: "English", fr: "anglais" } };
const langName = (l) => (LANG_NAME[l] || {})[S.lang] || l;

// ------------------------------------------------------------ API
async function api(path, body, method) {
  const r = await fetch("/api/" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: { "content-type": "application/json", authorization: "Bearer " + S.token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== "login") {
    logout();
    throw new Error(t("sessionOut"));
  }
  if (!r.ok) throw new Error(await trErr(j.error || "Erreur " + r.status));
  return j;
}
// les messages d'erreur du serveur sont en français : traduits pour Emmy
async function trErr(msg) {
  if (S.lang === "fr" || !S.token) return msg;
  try {
    const out = await translate([msg], S.lang);
    return out[msg] || msg;
  } catch {
    return msg;
  }
}
async function translate(texts, lang, fresh) {
  const need = texts.filter((x) => x && !S.tr[lang]?.[x]);
  if (need.length) {
    let r = {};
    try {
      r = await fetch("/api/tr2", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + S.token }, body: JSON.stringify({ texts: need, tl: lang, fresh: !!fresh }) }).then((x) => x.json());
    } catch {}
    delete r._fail;
    delete r.error;
    // ce que le serveur n'a pas pu traduire : le navigateur demande lui-même, puis le CRM garde en cache
    const miss = need.filter((x) => !r[x]);
    const got = {};
    for (const x of miss) {
      try {
        const g = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(x)}`);
        const j = await g.json();
        const v = (j?.[0] || []).map((y) => y?.[0] || "").join("").trim();
        if (v) got[x] = v;
      } catch {}
    }
    if (Object.keys(got).length) {
      Object.assign(r, got);
      fetch("/api/tr2", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + S.token }, body: JSON.stringify({ tl: lang, save: got }) }).catch(() => {});
    }
    S.tr[lang] = { ...(S.tr[lang] || {}), ...r };
  }
  return Object.fromEntries(texts.map((x) => [x, S.tr[lang]?.[x] || ""]));
}
async function refresh() {
  S.data = await api("state");
  render();
}
function toast(msg, bad) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast show" + (bad ? " err" : "");
  clearTimeout(el._h);
  el._h = setTimeout(() => (el.className = "toast"), bad ? 5000 : 2200);
}
async function run(btn, fn) {
  if (S.busy) return toast(t("busy"), true);
  S.busy = true;
  const old = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> ' + (btn.dataset.wait || t("wait"));
  }
  try {
    await fn();
  } catch (e) {
    toast(e.message, true);
  } finally {
    S.busy = false;
    if (btn && document.body.contains(btn)) {
      btn.disabled = false;
      btn.innerHTML = old;
    }
  }
}
function copy(text) {
  const ok = () => toast(t("copied"));
  navigator.clipboard.writeText(text).then(ok, () => {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    ok();
  });
}
function logout() {
  S.token = "";
  S.data = null;
  lsSet("em_token", "");
  render();
}
function modal(html) {
  $("#modal-body").innerHTML = html;
  $("#modal").classList.remove("hidden");
}
function closeModal() {
  $("#modal").classList.add("hidden");
}

// ------------------------------------------------------------ aides d'affichage
const isAdmin = () => S.data?.me?.role === "admin";
const accById = (id) => S.data.accounts.find((a) => a.id === id);
const ALIVE = ["warmup", "actif", "verif", "restreint"];
const WORKING = ["warmup", "actif"];
function ago(iso) {
  if (!iso) return t("never");
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 0) {
    const m = -s / 60;
    return m < 60 ? t("inMin", { n: Math.ceil(m) }) : t("inH", { n: Math.ceil(m / 60) });
  }
  if (s < 60) return t("justNow");
  if (s < 3600) return t("minAgo", { n: Math.floor(s / 60) });
  if (s < 86400) return t("hAgo", { n: Math.floor(s / 3600) });
  return t("dAgo", { n: Math.floor(s / 86400) });
}
const hm = (iso) => (iso ? new Date(iso).toLocaleTimeString(S.lang === "th" ? "th-TH" : S.lang === "en" ? "en-GB" : "fr-FR", { hour: "2-digit", minute: "2-digit" }) : "");
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const copyLine = (k, v, secret) =>
  `<div class="copyline"><span class="k">${esc(k)}</span><span class="v">${v ? esc(secret ? "••••••••" : v) : `<span class="muted">${t("empty")}</span>`}</span>${v ? `<button class="btn sm light" data-act="copy" data-v="${esc(v)}">${t("copy")}</button>` : ""}</div>`;
const pill = (st) => `<span class="status st-${esc(st)}"><i></i>${esc(L["status_" + st] ? t("status_" + st) : st)}</span>`;
const langPill = (l) => `<span class="pill lang-${esc(l || "fr")}">${esc((l || "fr").toUpperCase())}</span>`;
const threadsUrl = (p) => `https://www.threads.com/@${encodeURIComponent(p)}`;

// --- 2FA (TOTP, RFC 6238) calculé dans le navigateur
const TOTP_CACHE = {};
function b32decode(str) {
  const al = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, val = 0;
  const out = [];
  for (const ch of String(str).toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    val = (val << 5) | al.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
async function totpCode(secret, tm = Date.now()) {
  const step = Math.floor(tm / 1000 / 30);
  const ck = secret + ":" + step;
  if (TOTP_CACHE[ck]) return TOTP_CACHE[ck];
  const msg = new Uint8Array(8);
  let c = step;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
  const key = await crypto.subtle.importKey("raw", b32decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[h.length - 1] & 15;
  const n = (((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6;
  return (TOTP_CACHE[ck] = String(n).padStart(6, "0"));
}
function cleanTotpC(v) {
  let x = String(v ?? "").trim();
  const m = x.match(/[?&]secret=([^&]+)/i);
  if (m) x = decodeURIComponent(m[1]);
  x = x.replace(/[\s-]/g, "").toUpperCase().replace(/=+$/, "");
  return /^[A-Z2-7]{8,128}$/.test(x) ? x : "";
}
const totpSecret = (id) => {
  if (id === "__wiz") {
    const el = document.querySelector('[data-f="totp"]');
    return cleanTotpC(el ? el.value : S.wiz?.f?.totp);
  }
  const a = S.data?.accounts.find((x) => x.id === id);
  return a && a.totp ? a.totp : "";
};
const totpLine = (id) =>
  `<div class="copyline totpline"><span class="k">${t("code2fa")}</span><span class="v"><b data-totp="${esc(id)}" class="totp">······</b> <small class="muted" data-totpleft></small></span><button class="btn sm light" data-act="copyTotp" data-id="${esc(id)}">${t("copy")}</button></div>`;
async function tickTotp() {
  const els = document.querySelectorAll("[data-totp]");
  if (!els.length || !S.data) return;
  const left = 30 - (Math.floor(Date.now() / 1000) % 30);
  for (const el of els) {
    const sec = totpSecret(el.dataset.totp);
    if (!sec) { el.textContent = t("pasteKey"); continue; }
    try { el.textContent = await totpCode(sec); } catch { el.textContent = "?"; }
    const l = el.parentElement.querySelector("[data-totpleft]");
    if (l) { l.textContent = `(${left} s)`; l.classList.toggle("late", left <= 5); }
  }
}
setInterval(tickTotp, 1000);
window.totpCodeForTest = (k) => totpCode(k);

// --- boîte mail d'un compte : lien du webmail selon le domaine
function webmail(email) {
  const d = String(email || "").split("@")[1]?.toLowerCase() || "";
  if (!d) return "";
  if (/^(outlook|hotmail|live|msn)\./.test(d)) return "https://outlook.live.com/mail/";
  if (/^(gmail|googlemail)\./.test(d)) return "https://mail.google.com/";
  if (/^yahoo\./.test(d)) return "https://mail.yahoo.com/";
  if (/^(icloud|me|mac)\./.test(d)) return "https://www.icloud.com/mail";
  if (/^gmx\./.test(d)) return "https://www.gmx.com/";
  if (/^(mail|inbox|list|bk)\.ru$/.test(d)) return "https://e.mail.ru/";
  if (/^rambler\./.test(d)) return "https://mail.rambler.ru/";
  if (/^yandex\./.test(d)) return "https://mail.yandex.com/";
  if (/^aol\./.test(d)) return "https://mail.aol.com/";
  if (/^proton/.test(d)) return "https://mail.proton.me/";
  return `https://www.google.com/search?q=${encodeURIComponent(d + " webmail login")}`;
}
function loginBlock(a) {
  const wm = webmail(a.email);
  return `${copyLine(t("user"), a.pseudo)}${copyLine(t("pass"), a.password)}${a.totp ? totpLine(a.id) : ""}
    ${a.email ? copyLine(t("email"), a.email) : ""}${a.emailPassword ? copyLine(t("emailPass"), a.emailPassword) : ""}
    ${a.phone ? copyLine(t("phone"), a.phone) : ""}
    ${wm ? `<div class="copyline"><span class="k">${t("openMail")}</span><span class="v"><small class="muted">${t("openMailHint")}</small></span><button class="btn sm light" data-act="copy" data-v="${esc(wm)}">${t("copy")}</button><a class="btn sm light" href="${esc(wm)}" target="_blank" rel="noopener">${t("openMail")}</a></div>` : ""}`;
}

// ------------------------------------------------------------ programme de warm-up
const prog = () => ({ perDay: 5, gapMin: 60, w2Photo: 2, w3Photo: 1, w3PostEvery: 2, w4Posts: 1, w4Photo: 1, activeAfterDay: 22, ...(S.data.settings.program || {}) });
function dayNum(a) {
  if (!a.startDay) return 1;
  const d = (Date.parse(S.data.today + "T00:00:00Z") - Date.parse(a.startDay + "T00:00:00Z")) / 864e5;
  return Math.max(1, Math.round(d) + 1);
}
const weekOf = (d) => Math.ceil(d / 7);
function planOf(a) {
  const P = prog();
  const d = dayNum(a);
  const w = weekOf(d);
  let photo = 0;
  let post = 0;
  if (w === 2) photo = P.w2Photo;
  else if (w === 3) {
    photo = P.w3Photo;
    post = (d - 15) % Math.max(1, P.w3PostEvery) === 0 ? 1 : 0;
  } else if (w >= 4) {
    photo = P.w4Photo;
    post = P.w4Posts;
  }
  const total = P.perDay;
  post = Math.min(post, total);
  photo = Math.min(photo, total - post);
  return { d, w, total, c: total - photo - post, p: photo, post };
}
const todayActs = (a) => (a.acts || []).filter((x) => x.day === S.data.today);
function doneOf(a) {
  const o = { c: 0, p: 0, post: 0, total: 0 };
  for (const x of todayActs(a)) { o[x.k] = (o[x.k] || 0) + 1; o.total++; }
  return o;
}
// type de la prochaine action : celui qui est le plus en retard (étale photos et posts sur la journée)
function nextKind(a) {
  const pl = planOf(a);
  const dn = doneOf(a);
  const rem = ["c", "p", "post"].map((k) => ({ k, left: pl[k] - dn[k], ratio: pl[k] ? dn[k] / pl[k] : 1 })).filter((x) => x.left > 0);
  if (!rem.length) return null;
  rem.sort((x, y) => x.ratio - y.ratio || ["post", "p", "c"].indexOf(x.k) - ["post", "p", "c"].indexOf(y.k));
  // le post de la journée passe en 2e ou 3e position, jamais en premier
  if (rem[0].k === "post" && dn.total === 0 && rem.length > 1) return rem[1].k;
  return rem[0].k;
}
function nextAt(a) {
  const last = todayActs(a).slice(-1)[0];
  if (!last) return 0;
  return new Date(last.at).getTime() + prog().gapMin * 60e3;
}
function queue() {
  const now = Date.now();
  const list = S.data.accounts.filter((a) => WORKING.includes(a.status) && !a.needWarm10).map((a) => {
    const k = nextKind(a);
    const at = nextAt(a);
    return { a, k, at, ready: !!k && at <= now, done: doneOf(a), plan: planOf(a) };
  });
  const rank = (x) => (x.ready ? 0 : x.k ? 1 : 2);
  list.sort((x, y) => rank(x) - rank(y) || (rank(x) === 0 ? x.done.total - y.done.total || (x.a.lastActAt || "").localeCompare(y.a.lastActAt || "") : x.at - y.at) || x.a.num - y.a.num);
  return list;
}

// --- choix des textes et photos : jamais 2 fois le même texte sur un compte, le moins utilisé partout
function usage() {
  const tx = {};
  const md = {};
  for (const a of S.data.accounts) for (const x of a.acts || []) {
    if (x.t) tx[x.t] = (tx[x.t] || 0) + 1;
    if (x.m) md[x.m] = (md[x.m] || 0) + 1;
  }
  return { tx, md };
}
function pickText(a, kind, avoid = []) {
  const lang = a.lang || "fr";
  const bank = kind === "post" ? S.data.settings.captions?.[lang] || [] : S.data.settings.comments?.[lang] || [];
  const mine = new Set((a.acts || []).map((x) => x.t));
  const { tx } = usage();
  let pool = bank.filter((x) => !mine.has(x) && !avoid.includes(x));
  if (!pool.length) pool = bank.filter((x) => !avoid.includes(x));
  if (!pool.length) return "";
  const min = Math.min(...pool.map((x) => tx[x] || 0));
  const best = pool.filter((x) => (tx[x] || 0) === min);
  return best[Math.floor(Math.random() * best.length)];
}
function pickMedia(a, kind, avoid = []) {
  const g = kind === "post" ? "posts" : "commentaires";
  const list = (S.data.media || []).filter((m) => m.group === g);
  const mine = new Set((a.acts || []).map((x) => x.m).filter(Boolean));
  const { md } = usage();
  let pool = list.filter((m) => !mine.has(m.id) && !avoid.includes(m.id));
  if (!pool.length) pool = list.filter((m) => !avoid.includes(m.id));
  if (!pool.length) return null;
  const min = Math.min(...pool.map((m) => md[m.id] || 0));
  const best = pool.filter((m) => (md[m.id] || 0) === min);
  return best[Math.floor(Math.random() * best.length)];
}
const mediaUrl = (m) => `/api/media/${m.id}.jpg`;

// ------------------------------------------------------------ IP
const freshIp = () => {
  const ip = S.data.lastIp;
  return ip && Date.now() - new Date(ip.at).getTime() < 15 * 60e3 ? ip : null;
};
const waitingCode = () => !!((S.data?.sms && S.data.sms.status === "attente") || (S.data?.emailAct && S.data.emailAct.status === "attente"));
function parseProxy(p) {
  if (!p) return null;
  const s = p.trim().replace(/^https?:\/\//, "");
  if (s.includes("@")) {
    const [cred, hp] = s.split("@");
    const [user, pass] = cred.split(":");
    const [host, port] = hp.split(":");
    return { host, port, user, pass };
  }
  const [host, port, user, pass] = s.split(":");
  if (!host || !port) return null;
  return { host, port, user: user || "", pass: pass || "" };
}

// ------------------------------------------------------------ icônes
const ICONS = {
  today: '<path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  accounts: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  verify: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  tr: '<path d="M4 5h9M8.5 3v2M6 5c0 4 3 7 6 8M11 5c-1 4-4 7-7 8M13 21l4-9 4 9M14.5 18h5"/>',
  guide: '<path d="M5 4h10l4 4v12H5z"/><path d="M14 4v5h5"/>',
  suivi: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  contenu: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  stock: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/>',
  reglages: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/>',
  journal: '<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
};
const icon = (k) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k] || ""}</svg>`;

// ------------------------------------------------------------ rendu principal
function render() {
  document.documentElement.lang = S.lang;
  if (!S.token || !S.data) return renderLogin();
  const q = queue();
  const problems = S.data.accounts.filter((a) => ["verif", "restreint"].includes(a.status)).length;
  const groups = [
    [t("t_work"), [
      ["today", t("t_today"), q.filter((x) => x.ready).length],
      ["accounts", t("t_accounts"), problems],
      ["add", t("t_add"), 0],
      ["verify", t("t_verify"), waitingCode() ? 1 : 0],
    ]],
    [t("t_help"), [
      ["tr", t("t_tr"), 0],
      ["guide", t("t_guide"), 0],
    ]],
  ];
  if (isAdmin()) {
    const c = S.data.configured;
    groups.push([A("Admin"), [
      ["suivi", A("Suivi"), 0],
      ["contenu", A("Textes et photos"), 0],
      ["stock", A("Comptes achetés"), 0],
      ["reglages", A("Réglages"), c.proxy && c.rotationOk && c.sms ? 0 : 1],
      ["journal", A("Journal"), 0],
    ]]);
  }
  const all = groups.flatMap((g) => g[1]);
  if (S.pass && !accById(S.pass.id)) S.pass = null;
  if (!all.some((x) => x[0] === S.tab)) S.tab = "today";
  const ip = S.data.lastIp;
  const fresh = freshIp();
  const lock = waitingCode() || (S.wiz && S.wiz.step >= 2 && S.wiz.step <= 5);
  const navBtn = ([id, l, c]) => `<button class="nav ${S.tab === id ? "on" : ""}" data-tab="${id}">${icon(id)}<span>${esc(l)}</span>${c ? `<em>${c}</em>` : ""}</button>`;
  const langs = `<div class="langs">${LANGS.map((l) => `<button class="${S.lang === l ? "on" : ""}" data-lang="${l}">${l.toUpperCase()}</button>`).join("")}</div>`;
  app.innerHTML = `
  <div class="shell">
    <aside class="side">
      <div class="logo"><span class="mark">TE</span><div><b>${t("app")}</b><small>${esc(S.data.me.name)}</small></div></div>
      ${groups.map(([title, items]) => `<div class="navgroup"><div class="navtitle">${esc(title)}</div>${items.map(navBtn).join("")}</div>`).join("")}
      <div class="me">${langs}<button class="link" data-act="logout">${t("logout")}</button></div>
    </aside>
    <div class="body">
      <header class="bar">
        <div class="ipnow ${lock ? "lock" : fresh ? "fresh" : ""}"><i></i><div><b>${ip ? esc(ip.ip) : t("noIp")}</b><small>${!ip ? "" : lock ? t("ipLocked") : t("ipAgo", { c: esc(ip.country || ""), ago: ago(ip.at) })}</small></div></div>
        <button class="btn accent" data-act="rotateGuard" data-wait="${t("changingIp")}">${icon("rotate")}${t("changeIp")}</button>
        <div class="mlangs">${langs}</div>
      </header>
      <nav class="mnav">${all.map(navBtn).join("")}</nav>
      <main>${S.pass && S.tab === "today" ? passView() : VIEWS[S.tab]()}</main>
    </div>
  </div>`;
  afterRender();
}
function renderLogin() {
  app.innerHTML = `<div class="login"><div class="login-card">
    <div class="langs center">${LANGS.map((l) => `<button class="${S.lang === l ? "on" : ""}" data-lang="${l}">${l.toUpperCase()}</button>`).join("")}</div>
    <span class="mark big">TE</span><h1>${t("app")}</h1>
    <p class="muted">${S.firstRun ? t("firstRun") : t("enterCode")}</p>
    ${S.firstRun ? '<input id="firstname" placeholder="Awen" value="Awen" />' : ""}
    <div class="pin-dots">${[0, 1, 2, 3, 4, 5].map((i) => `<span class="${i < S.pin.length ? "on" : ""}"></span>`).join("")}</div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-pin="${n}">${n}</button>`).join("")}<button data-pin="del" class="k-del">${t("erase")}</button><button data-pin="0">0</button><button class="k-go" data-pin="go">${t("enter")}</button></div>
  </div></div>`;
}

// ------------------------------------------------------------ vues
const dots = (x) => {
  const out = [];
  for (let i = 0; i < x.plan.total; i++) out.push(`<span class="pd ${i < x.done.total ? "on" : ""}"></span>`);
  return `<span class="pdots">${out.join("")}</span>`;
};
const weekLabel = (w) => t(w <= 1 ? "w1" : w === 2 ? "w2" : w === 3 ? "w3" : "w4").split(":").slice(1).join(":").trim();

const VIEWS = {
  today() {
    const q = queue();
    const ready = q.filter((x) => x.ready);
    const waiting = q.filter((x) => !x.ready && x.k);
    const doneN = q.reduce((s, x) => s + Math.min(x.done.total, x.plan.total), 0);
    const target = q.reduce((s, x) => s + x.plan.total, 0);
    const probs = S.data.accounts.filter((a) => ["verif", "restreint"].includes(a.status));
    const warmTodo = S.data.accounts.filter((a) => a.needWarm10 && WORKING.includes(a.status));
    const acts = S.data.accounts.flatMap((a) => todayActs(a).filter((x) => x.by === S.data.me.name || isAdmin())).sort((a, b) => (a.at < b.at ? -1 : 1));
    let big;
    if (!q.length) big = `<div class="card done-all"><b>${t("noAccounts")}</b><div class="row" style="margin-top:12px"><button class="btn" data-tab="add">${t("t_add")}</button></div></div>`;
    else if (ready.length) big = `<button class="btn big accent" data-act="passStart" data-id="${ready[0].a.id}">${t("startNext")} · @${esc(ready[0].a.pseudo)} · ${t("k_" + ready[0].k)}</button>`;
    else if (waiting.length) big = `<div class="card done-all"><b>${t("nextRound", { when: ago(new Date(waiting[0].at).toISOString()) })}</b><span>${t("nextRoundSub", { n: prog().gapMin })}</span></div>`;
    else big = `<div class="card done-all ok"><b>${t("allDone")}</b><span>${t("allDoneSub")}</span></div>`;
    return `<h2>${t("todayTitle")}</h2><p class="lead">${t("todayLead")}</p>
      <div class="stats">
        <div class="stat"><b>${doneN}<small>/${target}</small></b><span>${t("st_done")}</span></div>
        <div class="stat"><b>${q.length}</b><span>${t("st_queue")}</span></div>
        <div class="stat"><b>${ready.length}</b><span><i class="dot c-green"></i>${t("st_ready")}</span></div>
        <div class="stat"><b>${probs.length}</b><span><i class="dot ${probs.length ? "c-red" : ""}"></i>${t("st_problem")}</span></div>
      </div>
      ${big}
      ${acts.length ? `<p class="muted" style="margin-top:10px">${t("firstAct", { t: hm(acts[0].at), l: hm(acts[acts.length - 1].at) })}</p>` : ""}
      ${warmTodo.length ? `<h3>${t("warmTodo", { m: warmMin() })}</h3><div class="card list">${warmTodo.map((a) => `<div class="task"><div class="task-text"><b>@${esc(a.pseudo)} ${langPill(a.lang)}</b><span>${esc(a.geelarkProfile || "-")}</span></div><button class="btn sm accent" data-act="warmResume" data-id="${a.id}">${t("warmResume")}</button></div>`).join("")}</div>` : ""}
      ${probs.length ? `<h3>${t("problems")}</h3><div class="card list">${probs.map((a) => `<div class="task"><div class="task-text"><b>@${esc(a.pseudo)}</b> ${pill(a.status)}${a.notes ? `<span class="muted"> · ${esc(String(a.notes).split("\n").slice(-1)[0])}</span>` : ""}</div><button class="btn sm light" data-act="showLogin" data-id="${a.id}">${t("loginInfo")}</button>${a.status === "verif" ? `<button class="btn sm light" data-act="goVerify" data-id="${a.id}">${t("goVerify")}</button>` : ""}<button class="btn sm ok" data-act="setState" data-id="${a.id}" data-st="warmup">${t("fixed")}</button></div>`).join("")}</div>` : ""}
      ${q.length ? `<h3>${t("t_accounts")}</h3>
      <div class="card list">${q.map((x) => `<div class="task ${x.ready ? "" : "dim"}">
        <div class="task-text"><b>@${esc(x.a.pseudo)} ${langPill(x.a.lang)}</b><span>${t("dayW", { d: x.plan.d, w: x.plan.w })} · ${esc(x.a.geelarkProfile || "-")}</span></div>
        ${dots(x)}
        <div class="nextk">${x.k ? (x.ready ? `<b>${t("k_" + x.k)}</b>` : `<span class="muted">${t("k_" + x.k)} · ${ago(new Date(x.at).toISOString())}</span>`) : `<span class="tag ok">${t("doneTag")}</span>`}</div>
        ${x.ready ? `<button class="btn sm" data-act="passStart" data-id="${x.a.id}">${t("doIt")}</button>` : `<button class="btn sm ghost" data-act="passStart" data-id="${x.a.id}" ${x.k ? "" : "disabled"}>${t("doIt")}</button>`}
      </div>`).join("")}</div>` : ""}`;
  },

  accounts() {
    const f = S.filter;
    const inF = (a) => (f === "alive" ? WORKING.includes(a.status) : f === "problem" ? ["verif", "restreint"].includes(a.status) : f === "dead" ? a.status === "saute" : true);
    const s = S.search.trim().toLowerCase().replace(/^@/, "");
    const list = S.data.accounts.filter((a) => inF(a) && (!s || a.pseudo.toLowerCase().includes(s)));
    const cnt = (k) => S.data.accounts.filter((a) => (k === "alive" ? WORKING.includes(a.status) : k === "problem" ? ["verif", "restreint"].includes(a.status) : k === "dead" ? a.status === "saute" : true)).length;
    const chip = (k, l) => `<button class="chip ${f === k ? "on" : ""}" data-filter="${k}">${l}<b>${cnt(k)}</b></button>`;
    return `<h2>${t("accTitle")}</h2><p class="lead">${t("accLead")}</p>
      <div class="chips">${chip("alive", t("f_alive"))}${chip("problem", t("f_problem"))}${chip("dead", t("f_dead"))}${chip("all", t("f_all"))}</div>
      <input data-search placeholder="${t("search")}" value="${esc(S.search)}" style="margin-bottom:14px" />
      <div class="grid">${list.map(accCard).join("") || `<p class="muted">${t("none")}</p>`}</div>`;
  },

  add() {
    const w = S.wiz || (S.wiz = { step: 1, f: {} });
    const steps = `<div class="steps">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= w.step ? "on" : ""}"></span>`).join("")}</div>`;
    const head = (k) => `<div class="stepnum">${t("stepN", { n: w.step })}</div><h3>${t(k)}</h3>`;
    const nav = (nextOk = true) => `<div class="row" style="margin-top:18px">${w.step > 1 ? `<button class="btn light" data-act="wizBack">${t("back")}</button>` : ""}<span class="spacer"></span>${nextOk ? `<button class="btn" data-act="wizNext">${t("next")}</button>` : ""}</div>`;
    let body = "";
    if (w.done) {
      body = `<div class="alert c-green"><b>${esc(w.done)}</b></div><div class="row"><button class="btn" data-act="wizReset">${t("addAnother")}</button><button class="btn light" data-tab="today">${t("goToday")}</button></div>`;
      return `<h2>${t("addTitle")}</h2>${body}`;
    }
    if (w.step === 1) {
      const ip = S.data.lastIp;
      const fresh = freshIp();
      const used = fresh && S.data.accounts.find((a) => a.ip === fresh.ip);
      body = `${head("a1")}<p>${t("a1txt")}</p>
        ${!S.data.configured.proxy || !S.data.configured.rotationOk ? `<div class="alert c-red">${t("a1noconf")}</div>` : ""}
        ${fresh && !used ? `<div class="alert c-green">${t("a1fresh", { ip: esc(fresh.ip + " " + (fresh.country || "")) })}</div>` : used ? `<div class="alert c-red">${t("a1used", { p: esc(used.pseudo) })}</div>` : `<div class="alert c-yellow">${t("a1old")}</div>`}
        <button class="btn accent" data-act="rotate" data-wait="${t("changingIp")}">${icon("rotate")}${t("changeIp")}</button>
        ${nav(!!(fresh && !used))}`;
    } else if (w.step === 2) {
      const p = parseProxy(S.data.settings.proxy) || {};
      const socks = S.data.settings.socksPort;
      const type = socks ? "SOCKS5" : "HTTP";
      const country = (S.data.lastIp && S.data.lastIp.country) || "FR";
      body = `${head("a2")}
        ${!p.host || !p.port ? `<div class="alert c-red">${t("a1noconf")}</div>` : ""}
        <ol class="helpsteps">${tl("a2steps", { type, c: country }).map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
        ${copyLine(t("pType"), type)}${copyLine(t("pHost"), p.host)}${copyLine(t("pPort"), socks || p.port)}${copyLine(t("pUser"), p.user)}${copyLine(t("pPass"), p.pass)}
        <div class="alert c-yellow langip"><b>${t("cloudLang")}</b><img src="/help/cloud-phone-language.png" alt="Cloud phone language : Based on IP" /></div>
        <label class="f">${t("phoneName")}</label><input data-f="geelarkProfile" placeholder="${t("phoneNamePh")}" value="${esc(w.f.geelarkProfile || "")}" />
        <details class="card sop" style="margin-top:14px"><summary>${t("watchTuto")}</summary>${videoEmbed("/help/geelark.mp4")}</details>
        ${nav()}`;
    } else if (w.step === 3) {
      const st = S.data.stock || {};
      body = `${head("a3")}
        ${w.f.stockId ? `<div class="alert c-blue">${t("a3stock")}${w.f.stockOrder ? ` · #${esc(w.f.stockOrder)}` : ""}</div>` : `<p class="muted">${st.dispo ? t("stockLeft", { n: st.dispo }) : t("stockEmpty")}</p><p>${t("a3manual")}</p>`}
        <ol class="helpsteps">${tl("a3steps").map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
        <label class="f">${t("user")}</label><div class="inrow"><input data-f="pseudo" value="${esc(w.f.pseudo || "")}" autocomplete="off" /><button class="btn sm light" data-act="copyField" data-cf="pseudo">${t("copy")}</button></div>
        <label class="f">${t("pass")}</label><div class="inrow"><input data-f="password" value="${esc(w.f.password || "")}" autocomplete="off" /><button class="btn sm light" data-act="copyField" data-cf="password">${t("copy")}</button></div>
        <label class="f">${t("key2fa")}</label><input data-f="totp" value="${esc(w.f.totp || "")}" autocomplete="off" />
        ${totpLine("__wiz")}
        <label class="f">${t("email")}</label><div class="inrow"><input data-f="email" value="${esc(w.f.email || "")}" autocomplete="off" /><button class="btn sm light" data-act="copyField" data-cf="email">${t("copy")}</button></div>
        <label class="f">${t("emailPass")}</label><div class="inrow"><input data-f="emailPassword" value="${esc(w.f.emailPassword || "")}" autocomplete="off" /><button class="btn sm light" data-act="copyField" data-cf="emailPassword">${t("copy")}</button></div>
        ${w.f.email ? `<p><a class="btn sm light" href="${esc(webmail(w.f.email))}" target="_blank" rel="noopener">${t("openMail")}</a> <small class="muted">${t("openMailHint")}</small></p>` : ""}
        ${w.f.stockId ? `<div class="scambox"><p class="muted">${t("scamHint")}</p><button class="btn bad" data-act="scamAsk">${t("scamBtn")}</button></div>` : ""}
        <details class="card" style="margin-top:14px" ${S.data.sms || S.data.emailAct ? "open" : ""}><summary>${t("verifAsk")}</summary>${codeBlocks()}</details>
        <div class="row" style="margin-top:18px"><button class="btn light" data-act="wizBack">${t("back")}</button>${w.f.stockId ? `<button class="btn ghost" data-act="stockRelease">${t("release")}</button>` : ""}<span class="spacer"></span><button class="btn" data-act="wizNext">${t("next")}</button></div>`;
    } else if (w.step === 4) {
      body = `${head("a4")}<p>${t("a4txt")}</p>
        <label class="f">${t("langAuto")}</label>
        <select data-f="lang"><option value="">${t("auto")}</option><option value="fr" ${w.f.lang === "fr" ? "selected" : ""}>FR</option><option value="en" ${w.f.lang === "en" ? "selected" : ""}>EN</option></select>
        <div class="row" style="margin-top:18px"><button class="btn light" data-act="wizBack">${t("back")}</button><span class="spacer"></span><button class="btn bad" data-act="wizFail">${t("a4no")}</button><button class="btn ok" data-act="wizCreate" data-wait="${t("wait")}">${t("a4yes")}</button></div>`;
    } else if (w.step === 5) {
      const a = accById(w.accId);
      if (!a) { S.wiz = { step: 1, f: {} }; return VIEWS.add(); }
      const m = warmMin();
      const start = Number(lsGet("warm10_" + a.id) || 0);
      const end = start + m * 60e3;
      const over = start && Date.now() >= end;
      body = `<div class="stepnum">${t("stepN", { n: 5 })}</div><h3>${t("a5", { m })} · @${esc(a.pseudo)}</h3>
        <ol class="helpsteps">${tl("a5steps").map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
        ${a.geelarkProfile ? copyLine(t("geelark"), a.geelarkProfile) : ""}
        <div class="timer" data-warmend="${start ? end : ""}">${start ? "" : `${String(Math.floor(m)).padStart(2, "0")}:00`}</div>
        ${start ? "" : `<button class="btn accent" data-act="warmStart" data-id="${a.id}">${t("startTimer", { m })}</button>`}
        <div class="checklist" style="margin-top:14px">${["ck1", "ck2", "ck3"].map((k) => `<label><input type="checkbox" data-warmck /> ${t(k)}</label>`).join("")}</div>
        <div class="row" style="margin-top:18px"><span class="spacer"></span><button class="btn ok" data-act="warmFinish" data-id="${a.id}" data-wait="${t("wait")}" ${over ? "" : "disabled"}>${t("warmDone")}</button></div>
        ${over ? "" : `<p class="muted">${t("warmWait")}</p>`}`;
    }
    return `<h2>${t("addTitle")}</h2><p class="lead">${t("addLead")}</p>${steps}<div class="card">${body}</div>`;
  },

  verify() {
    const alive = S.data.accounts.filter((a) => a.status !== "saute");
    return `<h2>${t("verTitle")}</h2><p class="lead">${t("verLead")}</p>
      <div class="card"><label class="f" style="margin-top:0">${t("forAcc")}</label>
      <select data-foracc><option value="">${t("chooseAcc")}</option>${alive.map((a) => `<option value="${a.id}" ${S.forAcc === a.id ? "selected" : ""}>@${esc(a.pseudo)}${a.status === "verif" ? " · " + esc(t("status_verif")) : ""}</option>`).join("")}</select>
      ${S.forAcc && accById(S.forAcc) ? `<details style="margin-top:12px"><summary>${t("loginInfo")}</summary>${loginBlock(accById(S.forAcc))}</details>` : ""}</div>
      ${codeBlocks()}`;
  },

  tr() {
    const T = S.trTool;
    return `<h2>${t("trTitle")}</h2><p class="lead">${t("trLead")}</p>
      <div class="card">
        <label class="f" style="margin-top:0">${t("trIn")}</label>
        <textarea data-trin rows="4">${esc(T.text)}</textarea>
        <div class="row" style="margin-top:10px">
          <button class="btn" data-act="trRun" data-tl="th">${t("trToTh")}</button>
          <button class="btn light" data-act="trRun" data-tl="fr">${t("trToFr")}</button>
          <button class="btn light" data-act="trRun" data-tl="en">${t("trToEn")}</button>
        </div>
        ${T.out ? `<label class="f">${t("trOut")}</label><div class="trout">${esc(T.out)}</div>
          <div class="row" style="margin-top:8px"><button class="btn sm light" data-act="copy" data-v="${esc(T.out)}">${t("copy")}</button>${T.tl !== "th" ? `<button class="btn sm ghost" data-act="trCheck">${t("trBack")}</button>` : ""}</div>
          ${T.check ? `<div class="frtr"><span class="frk">TH</span><span class="frv">${esc(T.check)}</span></div>` : ""}` : ""}
        <p class="muted">${t("trTip")}</p>
      </div>`;
  },

  guide() {
    const P = prog();
    const sec = (title, steps, extra = "", open = false) => `<details class="card sop" ${open ? "open" : ""}><summary><b>${esc(title)}</b></summary>${extra}<ol>${steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></details>`;
    return `<h2>${t("gTitle")}</h2><p class="lead">${t("gLead")}</p>
      ${sec(t("g_day"), tl("g_daySteps"), "", true)}
      ${sec(t("g_plan"), tl("g_planSteps", { n: P.perDay, g: P.gapMin, p: P.w2Photo, e: P.w3PostEvery, q: P.w4Posts }))}
      ${sec(t("g_proxy"), tl("a2steps", { type: S.data.settings.socksPort ? "SOCKS5" : "HTTP", c: "FR" }), videoEmbed("/help/geelark.mp4"))}
      ${sec(t("a3"), tl("a3steps"))}
      ${sec(t("a5", { m: warmMin() }), tl("a5steps"))}
      ${sec(t("g_photo"), tl("g_photoSteps"))}
      ${sec(t("g_verif"), tl("g_verifSteps"), videoEmbed("/help/numero.mp4"))}
      ${sec(t("g_mail"), tl("g_mailSteps"))}
      ${sec(t("g_rules"), tl("g_rulesSteps", { n: P.perDay }))}`;
  },

  // ---------------- admin (Awen) : textes via A() (thaï / anglais / français)
  suivi() {
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(new Date(Date.parse(S.data.today + "T00:00:00Z") - i * 864e5).toISOString().slice(0, 10));
    const accs = S.data.accounts.filter((a) => a.status !== "saute" || (a.acts || []).some((x) => days.includes(x.day)));
    const all = S.data.accounts.flatMap((a) => (a.acts || []).map((x) => ({ ...x, pseudo: a.pseudo })));
    const per = (d) => all.filter((x) => x.day === d).length;
    const today = all.filter((x) => x.day === S.data.today).sort((a, b) => (a.at < b.at ? -1 : 1));
    const q = queue();
    const target = q.reduce((s, x) => s + x.plan.total, 0);
    const c = S.data.configured;
    const st = S.data.stock || {};
    const miss = [!c.proxy && A("proxy"), !c.rotationOk && A("lien de rotation"), !c.sms && A("site de numéros"), !c.smsHero && A("Hero SMS (e-mails)")].filter(Boolean);
    const count = (s) => S.data.accounts.filter((a) => a.status === s).length;
    return `<h2>${A("Suivi")}</h2><p class="lead">${A("Ce qu'Emmy a fait, compte par compte, sur 7 jours.")}</p>
      ${miss.length ? `<div class="alert c-red">${esc(A("À brancher dans Réglages : {x}.", { x: miss.join(", ") }))} <button class="btn sm light" data-tab="reglages">${A("Réglages")}</button></div>` : ""}
      ${!(S.data.media || []).some((m) => m.group === "commentaires") ? `<div class="alert c-yellow">${A("Aucune photo pour les commentaires (semaine 2).")} <button class="btn sm light" data-tab="contenu">${A("Ajouter")}</button></div>` : ""}
      ${!(S.data.users || []).some((u) => u.role === "va") ? `<div class="alert c-yellow">${A("Emmy n'a pas encore d'accès.")} <button class="btn sm light" data-tab="reglages">${A("Créer son code")}</button></div>` : ""}
      <div class="stats">
        <div class="stat"><b>${today.length}<small>/${target}</small></b><span>${A("actions aujourd'hui")}</span></div>
        <div class="stat"><b>${today.length ? hm(today[0].at) : "-"}</b><span>${A("début")}</span></div>
        <div class="stat"><b>${today.length ? hm(today[today.length - 1].at) : "-"}</b><span>${A("dernière action")}</span></div>
        <div class="stat"><b>${count("warmup") + count("actif")}</b><span><i class="dot c-green"></i>${A("en warm-up")}</span></div>
        <div class="stat"><b>${count("verif") + count("restreint")}</b><span><i class="dot c-yellow"></i>${A("à régler")}</span></div>
        <div class="stat"><b>${count("saute")}</b><span><i class="dot c-red"></i>${A("sautés")}</span></div>
        <div class="stat"><b>${st.dispo || 0}</b><span>${A("en stock")}</span></div>
      </div>
      <div class="card" style="overflow-x:auto"><table class="plan"><thead><tr><th class="pa">${A("Compte")}</th>${days.map((d) => `<th class="${d === S.data.today ? "td" : ""}"><b>${d.slice(8)}/${d.slice(5, 7)}</b></th>`).join("")}<th>${A("Statut")}</th></tr></thead>
      <tbody>${accs.map((a) => `<tr><td class="pa"><b>@${esc(a.pseudo)}</b> ${langPill(a.lang)}<span class="muted">J${dayNum(a)} · ${esc(a.geelarkProfile || "")}</span></td>${days.map((d) => { const n = (a.acts || []).filter((x) => x.day === d).length; return `<td class="${n ? "" : "hole0"}">${n || ""}</td>`; }).join("")}<td>${pill(a.status)}</td></tr>`).join("")}
      <tr><td class="pa"><b>${A("Total")}</b></td>${days.map((d) => `<td><b>${per(d) || ""}</b></td>`).join("")}<td></td></tr></tbody></table></div>
      <h3>${A("Aujourd'hui, dans l'ordre")}</h3>
      <div class="card list">${today.slice().reverse().slice(0, 60).map((x) => `<div class="task"><div class="task-text"><b>${hm(x.at)} · @${esc(x.pseudo)}</b><span>${esc(t("k_" + x.k))}${x.t ? " · " + esc(x.t) : ""}${x.m ? " · " + A("photo") : ""}</span></div></div>`).join("") || `<p class="muted" style="padding:16px">${A("Rien pour l'instant.")}</p>`}</div>`;
  },

  contenu() {
    const s = S.data.settings;
    const media = S.data.media || [];
    const grid = (g) => `<div class="thumbs">${media.filter((m) => m.group === g).map((m) => `<figure><img src="${mediaUrl(m)}" alt="" loading="lazy" /><button class="btn sm light" data-act="mediaDel" data-id="${m.id}">${A("Supprimer")}</button></figure>`).join("") || `<p class="muted">${A("Aucune photo.")}</p>`}</div>`;
    const area = (k, l) => {
      const list = k.split(".").reduce((o, x) => o?.[x], s) || [];
      return `<label class="f">${l} <small>(${A("{n} · une ligne = un texte", { n: list.length })})</small></label><textarea data-bank="${k}" rows="8">${esc(list.join("\n"))}</textarea>`;
    };
    return `<h2>${A("Textes et photos")}</h2><p class="lead">${A("Les commentaires et les posts qu'Emmy copie. Un compte ne reçoit jamais deux fois le même texte ni la même photo, et le CRM prend toujours le moins utilisé.")}</p>
      <div class="card"><h3>${A("Commentaires")}</h3>
        ${area("comments.fr", A("Français"))}
        ${area("comments.en", A("Anglais"))}
        <h3>${A("Posts (semaine 3 et plus)")}</h3>
        ${area("captions.fr", A("Français"))}
        ${area("captions.en", A("Anglais"))}
        <div class="row" style="margin-top:12px"><button class="btn" data-act="saveBanks" data-wait="${t("wait")}">${A("Enregistrer les textes")}</button></div>
      </div>
      <div class="card"><h3>${A("Photos pour les commentaires (semaine 2 et plus)")}</h3>
        <input type="file" accept="image/*" multiple data-upload="commentaires" />${grid("commentaires")}</div>
      <div class="card"><h3>${A("Photos pour les posts (semaine 3 et plus)")}</h3>
        <input type="file" accept="image/*" multiple data-upload="posts" />${grid("posts")}</div>`;
  },

  stock() {
    const st = S.data.stock || {};
    const list = st.list || [];
    const lbl = { dispo: A("Dispo"), pris: A("En cours"), utilise: A("Utilisé"), rate: A("Raté"), scam: A("Scam") };
    const scams = list.filter((x) => x.status === "scam");
    const scamTxt = scams.map((x) => [x.order ? "#" + x.order : "", x.user, x.reason].filter(Boolean).join(" · ")).join("\n");
    return `<h2>${A("Comptes achetés")}</h2><p class="lead">${A("Colle la liste reçue du vendeur (ou glisse le fichier .txt). Emmy les prend un par un dans « Ajouter un compte », tout se remplit seul.")}</p>
      <div class="stats"><div class="stat"><b>${st.dispo || 0}</b><span><i class="dot c-green"></i>${A("dispo")}</span></div><div class="stat"><b>${st.pris || 0}</b><span><i class="dot c-blue"></i>${A("en cours")}</span></div><div class="stat"><b>${st.utilise || 0}</b><span>${A("utilisés")}</span></div><div class="stat"><b>${st.rate || 0}</b><span><i class="dot c-red"></i>${A("ratés")}</span></div><div class="stat"><b>${st.scam || 0}</b><span><i class="dot c-red"></i>${A("scam")}</span></div></div>
      ${scams.length ? `<div class="card"><h3>${A("Comptes scam (à réclamer au vendeur)")}</h3><pre class="scamlist">${esc(scamTxt)}</pre><button class="btn light" data-act="copy" data-v="${esc(scamTxt)}">${A("Copier la liste pour le vendeur")}</button></div>` : ""}
      <div class="card"><h3>${A("Importer")}</h3>
        <p class="muted">${A("Une ligne par compte. Formats reconnus : identifiant mdp CLE2FA, identifiant:mdp:email:mdpmail:CLE2FA, identifiant mdp email mdpmail. Tab, espace, « : », « ; » ou « | ». Les lignes de pub sont ignorées, les doublons aussi.")}</p>
        <textarea data-stocktext rows="6" placeholder="julie.paris12	Mdp123!	julie@outlook.com	MailMdp	JBSW Y3DP EHPK 3PXP"></textarea>
        <input type="file" accept=".txt,.csv,text/plain" multiple data-stockfile style="margin-top:8px" />
        <div class="row" style="margin-top:10px"><button class="btn" data-act="stockImport" data-wait="${t("wait")}">${A("Importer")}</button></div></div>
      ${list.length ? `<div class="card" style="overflow-x:auto"><table class="tbl"><thead><tr><th>${A("Identifiant")}</th><th>${A("E-mail")}</th><th>${A("2FA")}</th><th>${A("Commande")}</th><th>${A("Statut")}</th><th>${A("Ajouté")}</th></tr></thead><tbody>${list.slice().reverse().map((x) => `<tr><td>${esc(x.user)}</td><td>${esc(x.email || "")}</td><td>${x.has2fa ? A("oui") : ""}</td><td>${esc(x.order || "")}</td><td>${esc(lbl[x.status] || x.status)}${x.takenBy ? " · " + esc(x.takenBy) : ""}${x.reason ? `<br><small class="muted">${esc(x.reason)}</small>` : ""}</td><td>${fmt(x.addedAt)}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  },

  reglages() {
    const s = S.data.settings;
    const c = S.data.configured;
    const P = prog();
    const tag = (ok) => `<span class="tag ${ok ? "ok" : "miss"}">${ok ? A("branché") : A("à faire")}</span>`;
    const p = parseProxy(s.proxy);
    const num = (k, l, min, max) => `<div><label class="f">${A(l)}</label><input type="number" min="${min}" max="${max}" data-prog="${k}" value="${esc(P[k])}" /></div>`;
    return `<h2>${A("Réglages")}</h2><p class="lead">${A("Tout ce qui se branche une fois. Les clés restent côté serveur : personne ne peut les relire (champ vide = inchangé).")}</p>
      <div class="card"><h3>1. ${A("Proxy")} ${tag(c.proxy && !!p)}</h3>
        <p class="muted">${A("Recopie les cases de ton panel proxy. Le CRM lit l'IP par le port HTTP, et donne le port SOCKS5 pour GeeLark.")}</p>
        <div class="grid3">
          <div><label class="f">${A("Hôte")}</label><input data-px="host" value="${esc(p?.host || "")}" placeholder="ex. abc123.cn.fxdx.in" autocomplete="off" /></div>
          <div><label class="f">${A("Port HTTP")}</label><input data-px="port" value="${esc(p?.port || "")}" inputmode="numeric" placeholder="14953" /></div>
          <div><label class="f">${A("Port SOCKS5")} <small>(GeeLark)</small></label><input data-px="socks" value="${esc(s.socksPort || "")}" inputmode="numeric" placeholder="17157" /></div>
          <div><label class="f">${A("Utilisateur")}</label><input data-px="user" value="${esc(p?.user || "")}" autocomplete="off" /></div>
          <div><label class="f">${A("Mot de passe")}</label><input data-px="pass" value="${esc(p?.pass || "")}" autocomplete="off" /></div>
        </div>
        ${s.proxy && !p ? `<div class="alert c-red">${esc(A("Le proxy enregistré est incomplet (« {x} ») : remplis les 5 cases et enregistre.", { x: s.proxy }))}</div>` : ""}
        <label class="f">${A("Lien de rotation d'IP")} ${tag(c.rotationOk)} <small>(${A("secret")})</small></label>
        <input data-sec="rotationUrl" placeholder="${c.rotation ? A("déjà branché, colle pour remplacer") : "https://..."}" />
        ${c.rotation && !c.rotationOk ? `<div class="alert c-red">${esc(A("Ce lien de rotation a été enregistré pour un autre proxy ({x}). Colle ici le lien de rotation de ce proxy.", { x: c.rotationFor || "?" }))}</div>` : ""}
        <div class="row" style="margin-top:12px"><button class="btn" data-act="saveConn" data-wait="${t("wait")}">${A("Enregistrer le proxy")}</button><button class="btn light" data-act="testIp" data-wait="${t("wait")}">${A("Tester l'IP")}</button></div>
        ${S.ipTest ? `<div class="alert ${S.ipTest.ok ? "c-green" : "c-red"}">${esc(S.ipTest.msg)}</div>` : ""}
      </div>
      <div class="card"><h3>2. ${A("Numéros et e-mails (vérifications)")} ${tag(c.sms)}</h3>
        <label class="f">${A("Hero SMS : clé API")} ${tag(c.smsHero)} <small>(${A("numéros + e-mails temporaires")})</small></label><input data-sec="heroToken" placeholder="${c.smsHero ? A("déjà branché") : A("clé API")}" />
        <label class="f">${A("SMSPool : clé API")} ${tag(c.smsPool)}</label><input data-sec="spKey" placeholder="${c.smsPool ? A("déjà branché") : A("clé API")}" />
        <label class="f">${A("SMSOnline : User ID et clé")} ${tag(c.smsOnline)}</label><div class="inrow"><input data-sec="soUserId" placeholder="User ID" /><input data-sec="soKey" placeholder="${A("clé API")}" /></div>
        <label class="f">${A("Pays des numéros")}</label>
        <div class="row">${[[78, "France"], [187, "USA"], [16, "Royaume-Uni"]].map(([id, n]) => `<label class="ck"><input type="checkbox" data-cty="${id}" ${(s.smsCountries || [78, 187]).map(Number).includes(id) ? "checked" : ""} /> ${A(n)}</label>`).join("")}</div>
        <div class="row" style="margin-top:12px"><button class="btn" data-act="saveSms" data-wait="${t("wait")}">${A("Enregistrer")}</button></div>
      </div>
      <div class="card"><h3>3. ${A("Programme de warm-up")}</h3>
        <div class="grid3">
          ${num("perDay", "Actions par jour et par compte", 1, 20)}
          ${num("gapMin", "Minutes mini entre 2 actions d'un compte", 0, 600)}
          ${num("w2Photo", "Semaine 2 : commentaires photo / jour", 0, 20)}
          ${num("w3Photo", "Semaine 3 : commentaires photo / jour", 0, 20)}
          ${num("w3PostEvery", "Semaine 3 : 1 post tous les N jours", 1, 7)}
          ${num("w4Posts", "Semaine 4+ : posts / jour", 0, 5)}
          ${num("w4Photo", "Semaine 4+ : commentaires photo / jour", 0, 20)}
          ${num("activeAfterDay", "Compte « prêt » à partir du jour", 8, 120)}
        </div>
        <label class="f">${A("Warm-up juste après l'ajout (minutes)")}</label><input type="number" min="0" max="60" step="1" data-s="warmupMinutes" value="${esc(s.warmupMinutes ?? 10)}" />
        <label class="f">${A("Part des comptes en français (le reste en anglais)")}</label><input type="number" min="0" max="100" data-s="langFr" value="${esc(s.langFr ?? 70)}" />
        <label class="ck" style="margin-top:12px"><input type="checkbox" data-s="rotateEachPass" ${s.rotateEachPass !== false ? "checked" : ""} /> ${A("Changer l'IP avant chaque passage sur un compte")}</label>
        <label class="f">${A("Fuseau horaire (changement de jour)")}</label><input data-s="timezone" value="${esc(s.timezone || "Asia/Bangkok")}" />
        <div class="row" style="margin-top:12px"><button class="btn" data-act="saveProg" data-wait="${t("wait")}">${A("Enregistrer le programme")}</button></div>
      </div>
      <div class="card"><h3>4. ${A("Accès")}</h3>
        <table class="tbl"><tbody>${(S.data.users || []).map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${u.role === "admin" ? A("admin") : A("VA")}</td><td style="text-align:right">${u.name !== S.data.me.name ? `<button class="btn sm bad" data-act="userDel" data-name="${esc(u.name)}">${A("Retirer")}</button>` : ""}</td></tr>`).join("")}</tbody></table>
        <div class="inrow" style="margin-top:12px"><input data-u="name" placeholder="${A("Prénom (ex. Emmy)")}" value="Emmy" /><input data-u="pin" placeholder="${A("Code 4 à 8 chiffres")}" inputmode="numeric" /><select data-u="role"><option value="va">${A("VA")}</option><option value="admin">${A("admin")}</option></select><button class="btn" data-act="userAdd">${A("Ajouter")}</button></div>
        <p class="muted">${A("En VA, on voit seulement le travail (pas les réglages, pas le journal).")}</p>
      </div>`;
  },

  journal() {
    const logs = S.data.logs || [];
    return `<h2>${A("Journal")}</h2><p class="lead">${A("Tout ce qui se passe, du plus récent au plus ancien.")}</p>
      <div class="card list">${logs.slice(0, 300).map((l) => `<div class="task"><div class="task-text"><b>${fmt(l.at)} · ${esc(l.who)} · ${esc(LOGS[l.action] ? A(LOGS[l.action]) : l.action)}</b><span>${esc(logDetails(l))}</span></div></div>`).join("") || `<p class="muted" style="padding:16px">${A("Vide.")}</p>`}</div>`;
  },
};
const LOGS = {
  premier_acces: "Premier accès", connexion: "Connexion", code_faux: "Code faux", ip_changee: "IP changée", ip_pas_changee: "IP pas changée",
  compte_cree: "Compte ajouté", creation_ratee: "Ajout raté", action_faite: "Action faite", action_annulee: "Action annulée", statut_change: "Statut changé",
  numero_achete: "Numéro pris", code_recu: "Code reçu", numero_annule: "Numéro annulé", email_achete: "E-mail pris", email_annule: "E-mail annulé",
  compte_modifie: "Compte modifié", compte_supprime: "Compte supprimé", photo_ajoutee: "Photo ajoutée", reglages_modifies: "Réglages modifiés",
  secrets_modifies: "Connexions modifiées", import_hq: "Connexions récupérées", utilisateur_modifie: "Accès modifié", utilisateur_supprime: "Accès retiré", stock_importe: "Stock importé", stock_pris: "Compte pris du stock", stock_rendu: "Compte rendu au stock", stock_scam: "Compte scam", warmup_10min: "Warm-up 10 min fait",
};
function logDetails(l) {
  const out = [];
  if (l.pseudo) out.push("@" + l.pseudo);
  if (l.kind) out.push(t("k_" + l.kind));
  if (l.text) out.push("« " + l.text + " »");
  if (l.ip) out.push((l.before ? `${l.before} > ` : "IP ") + l.ip + (l.country ? ` (${l.country})` : ""));
  if (l.status) out.push(L["status_" + l.status] ? t("status_" + l.status) : l.status);
  if (l.note) out.push(l.note);
  if (l.phone) out.push(l.phone);
  if (l.email) out.push(l.email);
  if (l.reason) out.push(l.reason);
  if (l.geelarkProfile) out.push("GeeLark " + l.geelarkProfile);
  if (l.ajoutes != null) out.push(A("{a} ajouté(s), {b} doublon(s)", { a: l.ajoutes, b: l.doublons }));
  if (l.user) out.push(l.user);
  if (l.name) out.push(l.name);
  return out.join(", ");
}

function accCard(a) {
  const pl = planOf(a);
  const dn = doneOf(a);
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.parse(S.data.today + "T00:00:00Z") - i * 864e5).toISOString().slice(0, 10);
    last7.push((a.acts || []).filter((x) => x.day === d).length);
  }
  return `<div class="card acc ${a.status === "saute" ? "dead" : ""}">
    <div class="head"><span class="num">#${a.num}</span><a class="ps" href="${threadsUrl(a.pseudo)}" target="_blank" rel="noopener">@${esc(a.pseudo)}</a>${langPill(a.lang)}<span class="spacer"></span>${pill(a.status)}</div>
    <div class="muted">${t("dayW", { d: pl.d, w: pl.w })} · ${esc(weekLabel(pl.w))}</div>
    ${WORKING.includes(a.status) ? `<div class="muted">${t("colToday")} : ${dn.total}/${pl.total} ${dots({ plan: pl, done: dn })}</div>` : ""}
    <div class="muted">${t("geelark")} : <b>${esc(a.geelarkProfile || "-")}</b>${a.geelarkProfile ? ` <button class="btn sm ghost" data-act="copy" data-v="${esc(a.geelarkProfile)}">${t("copy")}</button>` : ""}</div>
    <div class="spark" title="${t("last7")}">${last7.map((n) => `<i style="height:${4 + Math.min(n, 8) * 3}px" class="${n ? "on" : ""}"></i>`).join("")}</div>
    ${a.notes ? `<div class="accnote">${esc(a.notes)}</div>` : ""}
    <div class="row">
      <button class="btn sm" data-act="showLogin" data-id="${a.id}">${t("loginInfo")}</button>
      <button class="btn sm light" data-act="editAcc" data-id="${a.id}">${t("edit")}</button>
      <button class="btn sm light" data-act="stateMenu" data-id="${a.id}">${t("setStatus")}</button>
    </div>
  </div>`;
}

function videoEmbed(url) {
  if (!url) return "";
  return `<div class="video"><video src="${esc(url)}#t=1" controls playsinline preload="metadata"></video></div>`;
}

// --- blocs numéro / e-mail (page Numéro & e-mail + étape 3 de l'ajout)
function codeBlocks() {
  const c = S.data.configured;
  const sms = S.data.sms && S.data.sms.status === "attente" ? S.data.sms : S.data.sms && S.data.sms.code && S.data.sms.status !== "fini" ? S.data.sms : null;
  const em = S.data.emailAct && (S.data.emailAct.status === "attente" || S.data.emailAct.code) ? S.data.emailAct : null;
  const forA = S.forAcc && accById(S.forAcc);
  const codeBox = (code, kind) => `<div class="alert c-green codebig">${t("codeIs", { c: esc(code) })} <button class="btn sm light" data-act="copy" data-v="${esc(code)}">${t("copy")}</button></div>`;
  // numéro
  let num;
  if (!c.sms) num = `<div class="alert c-yellow">${t("noProv")}</div>`;
  else if (sms) {
    const left = Math.max(0, Math.round((new Date(sms.expiredAt).getTime() - Date.now()) / 1000));
    num = `<div class="alert c-blue"><b>${esc(sms.countryName || "")}</b> · ${t("numLeft")} <span data-smsleft>${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}</span></div>
      ${copyLine(t("phone"), sms.phone)}
      <p>${t("numHow", { d: esc(sms.dial || "+") })}</p>
      ${sms.code ? codeBox(sms.code) : `<div class="alert c-yellow" data-smswait>${t("numWait")}</div>`}
      <div class="row">${sms.code ? `${forA ? `<button class="btn sm light" data-act="noteNum" data-wait="...">${t("noteOnAcc", { p: esc(forA.pseudo) })}</button>` : ""}<button class="btn sm light" data-act="smsDone" data-wait="...">${t("numDone")}</button>` : `<button class="btn sm light" data-act="smsCode" data-wait="...">${t("checkNow")}</button><button class="btn sm bad" data-act="smsCancel" data-wait="...">${t("numCancel")}</button>`}</div>`;
  } else {
    const offers = S.smsPrices && S.smsPrices.length ? S.smsPrices : (S.data.configured.smsProvs || []).flatMap((p) => (S.data.smsCountries || []).map((x) => ({ ...x, prov: p.k, provName: p.name })));
    const many = (S.data.configured.smsProvs || []).length > 1;
    const info = (o) => (o.error ? "!" : o.stock === 0 ? "0" : [o.price != null ? `${Number(o.price).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} $` : o.maxPrice ? `max ${o.maxPrice} $` : "", o.stock ? `${o.stock}` : ""].filter(Boolean).join(" · "));
    num = `<div class="row">${offers.map((o, i) => `<button class="btn ${i === 0 ? "" : "light"}" data-act="smsBuy" data-v="${o.id}" data-prov="${esc(o.prov || "")}" data-wait="${t("wait")}" ${o.stock === 0 || o.error ? "disabled" : ""}>${t("numBtn", { c: esc(o.name) })}${many ? ` · ${esc(o.provName || "")}` : ""}${S.smsPrices ? ` <small style="opacity:.7">${esc(info(o))}</small>` : ""}</button>`).join("")}</div>
      <p class="muted">${t("numTip")} · <a href="#" data-act="smsPrices">${t("refresh")}</a></p>`;
  }
  // e-mail
  let mail;
  if (!c.smsHero) mail = `<div class="alert c-yellow">${t("noHero")}</div>`;
  else if (em) {
    mail = `${copyLine(t("email"), em.email)}<p>${t("mailHow")}</p>
      ${em.code ? codeBox(em.code) : `<div class="alert c-yellow" data-emailwait>${t("mailWait")}</div>`}
      <div class="row">${em.code ? `${forA ? `<button class="btn sm light" data-act="noteMail" data-wait="...">${t("noteOnAcc", { p: esc(forA.pseudo) })}</button>` : ""}<button class="btn sm light" data-act="emailDone" data-wait="...">${t("numDone")}</button>` : `<button class="btn sm light" data-act="emailCode" data-wait="...">${t("checkNow")}</button><button class="btn sm bad" data-act="emailCancel" data-wait="...">${t("mailCancel")}</button>`}</div>`;
  } else mail = `<button class="btn" data-act="emailBuy" data-wait="${t("wait")}">${t("mailBtn")}</button>`;
  return `<div class="grid2"><div class="card"><h3>${t("numTitle")}</h3>${num}</div><div class="card"><h3>${t("mailTitle")}</h3>${mail}</div></div>`;
}

// ------------------------------------------------------------ passage sur un compte
function passView() {
  const P = S.pass;
  const a = accById(P.id);
  const pl = planOf(a);
  const dn = doneOf(a);
  const kind = P.kind;
  const rotOn = S.data.settings.rotateEachPass !== false;
  const rotConf = S.data.configured.rotationOk;
  const ipOk = !rotOn || (S.data.lastIp && new Date(S.data.lastIp.at).getTime() >= P.startedAt - 1000);
  const lang = a.lang || "fr";
  const text = P.own ? P.ownOut || "" : P.text;
  const media = P.mediaId ? (S.data.media || []).find((m) => m.id === P.mediaId) : null;
  const needPhoto = kind !== "c";
  let task = "";
  if (needPhoto && !media) task = `<div class="alert c-yellow">${t("s_noPhoto")}</div>`;
  task += `<p class="muted">${kind === "post" ? t("s_postHow") : t("s_where")}</p>
    ${!P.own ? `<label class="f">${t("s_text", { l: langName(lang) })}</label>
      <div class="bigtext">${esc(text || "-")}</div>
      ${text ? `<div class="frtr"><span class="frk">TH</span><span class="frv" data-mean="${esc(text)}">${esc(S.tr.th?.[text] || "...")}</span></div>` : ""}
      <div class="row"><button class="btn" data-act="copy" data-v="${esc(text)}" ${text ? "" : "disabled"}>${t("copy")}</button><button class="btn light" data-act="passOther">${t("s_other")}</button><button class="btn ghost" data-act="passOwn">${t("s_own")}</button></div>`
    : `<label class="f">${t("s_own")}</label><textarea data-own rows="3" placeholder="${t("s_ownPh")}">${esc(P.ownIn || "")}</textarea>
      <div class="row" style="margin-top:8px"><button class="btn light" data-act="passOwnTr" data-wait="...">${t("s_trTo", { l: langName(lang) })}</button><button class="btn ghost" data-act="passOwnOff">${t("s_other")}</button></div>
      ${P.ownOut ? `<div class="bigtext">${esc(P.ownOut)}</div><div class="row"><button class="btn" data-act="copy" data-v="${esc(P.ownOut)}">${t("copy")}</button></div>` : ""}`}
    ${needPhoto && media ? `<label class="f">${t("s_photo")}</label><div class="passimg"><img src="${mediaUrl(media)}" alt="" /></div>
      <div class="row"><a class="btn" href="${mediaUrl(media)}" download="${esc((a.pseudo || "photo") + "-" + media.id + ".jpg")}">${t("s_dl")}</a><button class="btn light" data-act="passOtherPhoto">${t("s_other")}</button></div>
      <p class="muted">${t("s_photoHow")}</p>` : ""}`;
  return `<div class="row passhead"><button class="btn sm light" data-act="passClose">${t("back")}</button><span class="spacer"></span><button class="btn sm bad" data-act="problemMenu" data-id="${a.id}">${t("problem")}</button></div>
    <h2>@${esc(a.pseudo)} ${langPill(lang)}</h2>
    <p class="lead">${t("dayW", { d: pl.d, w: pl.w })} · ${esc(weekLabel(pl.w))} · ${dn.total}/${pl.total} ${dots({ plan: pl, done: dn })}</p>
    ${rotOn ? `<div class="card step ${ipOk ? "ok" : ""}"><h3>${t("s_ip")}</h3>
      ${!rotConf ? `<div class="alert c-yellow">${t("s_ipOff")}</div>` : ipOk ? `<div class="alert c-green">${t("s_ipOk")} · ${esc(S.data.lastIp.ip)}</div>` : `<p class="muted">${t("s_ipWhy")}</p><button class="btn accent" data-act="rotate" data-wait="${t("changingIp")}">${icon("rotate")}${t("changeIp")}</button>`}</div>` : ""}
    <div class="card step"><h3>${rotOn ? t("s_phone") : t("s_phone").replace(/^2/, "1")}</h3>
      ${a.geelarkProfile ? `<p>${t("s_phoneTxt", { g: `<b class="gname">${esc(a.geelarkProfile)}</b>` })} <button class="btn sm light" data-act="copy" data-v="${esc(a.geelarkProfile)}">${t("copy")}</button></p>` : `<div class="alert c-yellow">${t("s_phoneNone")}</div>`}
      <div class="hint"><span class="hint-t">${t("s_scroll")}</span></div>
      <details><summary>${t("loginBox")}</summary>${loginBlock(a)}</details></div>
    <div class="card step"><h3>${t("s_task", { k: t("k_" + kind) })}</h3>${task}<p class="muted">${t("rules")}</p></div>
    <div class="card step"><h3>${t("s_finish")}</h3>
      <div class="row"><button class="btn big ok" data-act="passDone" data-wait="${t("wait")}" ${(rotOn && rotConf && !ipOk) || (!text) ? "disabled" : ""}>${t("done")}</button></div>
      <div class="row" style="margin-top:10px"><button class="btn sm ghost" data-act="passClose">${t("skip")}</button>${dn.total ? `<button class="btn sm ghost" data-act="undoAct" data-id="${a.id}" data-wait="...">${t("undo")}</button>` : ""}</div></div>`;
}
function startPass(id) {
  const a = accById(id);
  let kind = nextKind(a) || "c";
  // pas de photo en stock : on retombe sur un commentaire texte (on ne bloque jamais Emmy)
  let media = kind !== "c" ? pickMedia(a, kind) : null;
  if (kind === "p" && !media) kind = "c";
  const text = pickText(a, kind);
  S.pass = { id, kind, text, mediaId: media ? media.id : "", startedAt: Date.now(), seen: [text], seenM: media ? [media.id] : [] };
  S.tab = "today";
  window.scrollTo(0, 0);
  render();
}

// ------------------------------------------------------------ après rendu
let smsPoll = null;
let emailPoll = null;
function afterRender() {
  if (document.querySelector('[data-act="smsPrices"]') && !S.smsPrices && !S.smsPricesLoading && S.data.configured.sms) {
    S.smsPricesLoading = true;
    api("sms/prices").then((p) => { S.smsPrices = p; render(); }).catch(() => {}).finally(() => (S.smsPricesLoading = false));
  }
  clearInterval(emailPoll);
  if (document.querySelector("[data-emailwait]") && S.data.emailAct && S.data.emailAct.status === "attente") {
    emailPoll = setInterval(async () => {
      if (!document.querySelector("[data-emailwait]")) return clearInterval(emailPoll);
      try {
        const act = await api(`email/${S.data.emailAct.id}/code`, {});
        if (act.code || act.status !== "attente") {
          clearInterval(emailPoll);
          if (act.code) toast(t("codeIs", { c: act.code }));
          await refresh();
        }
      } catch {}
    }, 5000);
  }
  clearInterval(smsPoll);
  if (document.querySelector("[data-smswait]") && S.data.sms && S.data.sms.status === "attente") {
    smsPoll = setInterval(async () => {
      if (!document.querySelector("[data-smswait]")) return clearInterval(smsPoll);
      try {
        const act = await api(`sms/${S.data.sms.id}/code`, {});
        const left = document.querySelector("[data-smsleft]");
        if (left) {
          const l = Math.max(0, Math.round((new Date(act.expiredAt).getTime() - Date.now()) / 1000));
          left.textContent = `${String(Math.floor(l / 60)).padStart(2, "0")}:${String(l % 60).padStart(2, "0")}`;
        }
        if (act.code || act.status !== "attente") {
          clearInterval(smsPoll);
          if (act.code) toast(t("codeIs", { c: act.code }));
          await refresh();
        }
      } catch {}
    }, 5000);
  }
  // sens du texte à copier, dans la langue d'Emmy (thaï par défaut)
  const means = [...document.querySelectorAll("[data-mean]")];
  if (means.length) {
    const target = "th";
    const texts = means.map((el) => el.dataset.mean);
    translate(texts, target).then((r) => means.forEach((el) => { if (r[el.dataset.mean]) el.textContent = r[el.dataset.mean]; }));
  }
  tickTotp();
}

// ------------------------------------------------------------ actions
const ACT = {
  copy: (b) => copy(b.dataset.v),
  async copyTotp(b) {
    const sec = totpSecret(b.dataset.id);
    if (!sec) return toast(t("badKey"), true);
    copy(await totpCode(sec));
  },
  copyField(b) {
    const el = document.querySelector(`input[data-f="${b.dataset.cf}"]`);
    if (el && el.value) copy(el.value);
  },
  logout,
  closeModal,
  async rotateGuard(b) {
    if (waitingCode()) {
      return modal(`<h3>${t("changeIp")}</h3><p>${t("ipLockQ")}</p><div class="row"><button class="btn light" data-act="closeModal">${t("cancel")}</button><button class="btn bad" data-act="rotateForce" data-wait="${t("changingIp")}">${t("ipLockYes")}</button></div>`);
    }
    await ACT.rotate(b);
  },
  async rotateForce(b) {
    closeModal();
    await ACT.rotate(null);
  },
  async rotate(b) {
    if (S.wiz) readWiz();
    await run(b, async () => {
      const r = await api("rotate", {});
      toast(t("ipChanged", { ip: `${r.ip} ${r.country || ""}` }));
      if (r.usedBy && S.tab === "add") toast(t("a1used", { p: r.usedBy }), true);
      await refresh();
    });
  },
  async testIp(b) {
    S.ipTest = null;
    await run(b, async () => {
      await ipCheck("");
      render();
    });
  },
  // --- passage
  passStart: (b) => startPass(b.dataset.id),
  passClose() {
    S.pass = null;
    render();
  },
  passOther() {
    const a = accById(S.pass.id);
    const x = pickText(a, S.pass.kind, S.pass.seen);
    if (x) {
      S.pass.text = x;
      S.pass.seen.push(x);
    }
    render();
  },
  passOtherPhoto() {
    const a = accById(S.pass.id);
    const m = pickMedia(a, S.pass.kind, S.pass.seenM);
    if (m) {
      S.pass.mediaId = m.id;
      S.pass.seenM.push(m.id);
    }
    render();
  },
  passOwn() {
    S.pass.own = true;
    render();
  },
  passOwnOff() {
    S.pass.own = false;
    S.pass.ownOut = "";
    render();
  },
  async passOwnTr(b) {
    const inp = $("[data-own]");
    const txt = (inp?.value || "").trim();
    S.pass.ownIn = txt;
    if (!txt) return;
    const lang = accById(S.pass.id).lang || "fr";
    await run(b, async () => {
      const r = await translate([txt], lang, true);
      if (!r[txt]) throw new Error(t("trFail"));
      // commentaire de fille jeune : minuscules, sans point final
      S.pass.ownOut = r[txt].replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase());
      render();
    });
  },
  async passDone(b) {
    const P = S.pass;
    const text = P.own ? P.ownOut || "" : P.text;
    await run(b, async () => {
      await api(`accounts/${P.id}/act`, { kind: P.mediaId || P.kind === "post" ? P.kind : "c", text, mediaId: P.mediaId || "" });
      S.pass = null;
      await refresh();
      toast(t("saved"));
    });
  },
  async undoAct(b) {
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/undo`, {});
      await refresh();
      toast(t("undone"));
    });
  },
  // --- problèmes / statut
  problemMenu(b) {
    const a = accById(b.dataset.id);
    modal(`<h3>${t("pbTitle", { p: esc(a.pseudo) })}</h3>
      <details class="card"><summary>${t("pb_logout")}</summary><p class="muted">${t("pb_logoutTxt")}</p>${loginBlock(a)}</details>
      <label class="f">${t("pb_note")}</label><input data-pbnote />
      <div class="pbbtns">
        <button class="btn light" data-act="setState" data-id="${a.id}" data-st="verif">${t("pb_verif")}</button>
        <button class="btn light" data-act="setState" data-id="${a.id}" data-st="restreint">${t("pb_restr")}</button>
        <button class="btn bad" data-act="setState" data-id="${a.id}" data-st="saute">${t("pb_dead")}</button>
      </div>
      <p class="muted">${t("pb_verifTxt")}</p>`);
    tickTotp();
  },
  stateMenu(b) {
    const a = accById(b.dataset.id);
    modal(`<h3>@${esc(a.pseudo)}</h3><label class="f">${t("pb_note")}</label><input data-pbnote />
      <div class="pbbtns">${["warmup", "verif", "restreint", "saute"].map((s) => `<button class="btn ${s === "saute" ? "bad" : "light"}" data-act="setState" data-id="${a.id}" data-st="${s}" ${a.status === s ? "disabled" : ""}>${t("status_" + s)}</button>`).join("")}</div>`);
  },
  async setState(b) {
    const note = $("[data-pbnote]")?.value || "";
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/state`, { status: b.dataset.st, note });
      closeModal();
      if (S.pass && S.pass.id === b.dataset.id) S.pass = null;
      await refresh();
      toast(t("pb_saved"));
      if (b.dataset.st === "verif") {
        S.forAcc = b.dataset.id;
        S.tab = "verify";
        lsSet("em_tab", S.tab);
        render();
      }
    });
  },
  goVerify(b) {
    S.forAcc = b.dataset.id;
    S.tab = "verify";
    render();
  },
  showLogin(b) {
    const a = accById(b.dataset.id);
    modal(`<h3>@${esc(a.pseudo)} · ${t("loginInfo")}</h3>${loginBlock(a)}${a.geelarkProfile ? copyLine(t("geelark"), a.geelarkProfile) : ""}`);
    tickTotp();
  },
  editAcc(b) {
    const a = accById(b.dataset.id);
    const fld = (k, l, v) => `<label class="f">${l}</label><input data-e="${k}" value="${esc(v ?? "")}" autocomplete="off" />`;
    modal(`<h3>@${esc(a.pseudo)} · ${t("edit")}</h3>
      ${fld("pseudo", t("user"), a.pseudo)}${fld("password", t("pass"), a.password)}${fld("totp", t("key2fa"), a.totp)}
      ${fld("email", t("email"), a.email)}${fld("emailPassword", t("emailPass"), a.emailPassword)}${fld("phone", t("phone"), a.phone)}
      ${fld("geelarkProfile", t("geelark"), a.geelarkProfile)}
      <label class="f">${t("lang")}</label><select data-e="lang"><option value="fr" ${a.lang !== "en" ? "selected" : ""}>FR</option><option value="en" ${a.lang === "en" ? "selected" : ""}>EN</option></select>
      ${isAdmin() ? fld("startDay", t("startDay") + " (AAAA-MM-JJ)", a.startDay) : ""}
      <label class="f">${t("notes")}</label><textarea data-e="notes" rows="3">${esc(a.notes || "")}</textarea>
      <div class="row" style="margin-top:14px">${isAdmin() ? `<button class="btn bad" data-act="delAcc" data-id="${a.id}">${A("Supprimer")}</button>` : ""}<span class="spacer"></span><button class="btn" data-act="saveAcc" data-id="${a.id}" data-wait="...">${t("save")}</button></div>`);
  },
  async saveAcc(b) {
    const body = {};
    document.querySelectorAll("[data-e]").forEach((el) => (body[el.dataset.e] = el.value));
    if (body.totp && !cleanTotpC(body.totp)) return toast(t("badKey"), true);
    await run(b, async () => {
      await api(`accounts/${b.dataset.id}/edit`, body);
      closeModal();
      await refresh();
      toast(t("editSaved"));
    });
  },
  delAcc(b) {
    if (b.dataset.sure !== "1") {
      b.dataset.sure = "1";
      b.textContent = A("Sûr ? Reclique");
      return;
    }
    run(b, async () => {
      await api(`accounts/${b.dataset.id}/delete`, {});
      closeModal();
      await refresh();
    });
  },
  // --- ajout d'un compte
  wizBack() {
    readWiz();
    if (S.wiz.step > 1) S.wiz.step--;
    render();
  },
  async wizNext(b) {
    const w = S.wiz;
    readWiz();
    if (w.step === 1) {
      const f = freshIp();
      if (!f) return toast(t("a1old"), true);
      const used = S.data.accounts.find((a) => a.ip === f.ip);
      if (used) return toast(t("a1used", { p: used.pseudo }), true);
    }
    if (w.step === 2) {
      const gp = String(w.f.geelarkProfile || "").trim().toLowerCase();
      if (!gp) return toast(t("phoneNameNeed"), true);
      const used = (S.data.geelarkBurned || []).includes(gp) || S.data.accounts.some((a) => String(a.geelarkProfile || "").trim().toLowerCase() === gp);
      if (used) return toast(t("phoneUsed"), true);
      w.step = 3;
      // un compte du stock est pris et rempli tout seul
      if (!w.f.stockId && S.data.stock?.dispo) {
        await run(b, async () => {
          const it = await api("stock/take", {});
          Object.assign(w.f, { stockId: it.id, stockOrder: it.order || "", pseudo: it.user, password: it.pass, totp: it.totp || "", email: it.email || "", emailPassword: it.emailPass || "" });
        });
      } else if (!w.f.stockId && S.data.stock?.mine) {
        const it = S.data.stock.mine;
        Object.assign(w.f, { stockId: it.id, stockOrder: it.order || "", pseudo: it.user, password: it.pass, totp: it.totp || "", email: it.email || "", emailPassword: it.emailPass || "" });
      }
      return render();
    }
    if (w.step === 3) {
      if (!w.f.pseudo || !w.f.password) return toast(t("a3need"), true);
      if (w.f.totp && !cleanTotpC(w.f.totp)) return toast(t("badKey"), true);
      w.f.pseudo = w.f.pseudo.trim().replace(/^@/, "");
    }
    w.step++;
    render();
  },
  async wizCreate(b) {
    const w = S.wiz;
    readWiz();
    await run(b, async () => {
      const acc = await api("accounts/create", { bought: true, pseudo: w.f.pseudo, password: w.f.password, totp: w.f.totp || "", email: w.f.email || "", emailPassword: w.f.emailPassword || "", geelarkProfile: w.f.geelarkProfile, stockId: w.f.stockId || undefined, lang: w.f.lang || undefined, phone: w.f.phone || "" });
      // pas fini : warm-up de 10 min tout de suite, même téléphone, même IP
      S.wiz = { step: 5, f: {}, accId: acc.id };
      await refresh();
      toast(t("warmAdded", { p: acc.pseudo, m: warmMin() }));
    });
  },
  warmStart(b) {
    lsSet("warm10_" + b.dataset.id, String(Date.now()));
    render();
  },
  warmResume(b) {
    S.wiz = { step: 5, f: {}, accId: b.dataset.id };
    S.tab = "add";
    lsSet("em_tab", "add");
    render();
  },
  async warmFinish(b) {
    if ([...document.querySelectorAll("[data-warmck]")].some((x) => !x.checked)) return toast(t("warmWait"), true);
    const id = b.dataset.id;
    await run(b, async () => {
      const a = await api(`accounts/${id}/warm10`, { startedAt: Number(lsGet("warm10_" + id) || 0) });
      lsSet("warm10_" + id, "");
      S.wiz = { step: 1, f: {}, done: t("added", { p: a.pseudo }) };
      await refresh();
    });
  },
  wizFail() {
    readWiz();
    const r = ["r_pass", "r_2fa", "r_verif", "r_ban", "r_other"];
    modal(`<h3>${t("a4reason")}</h3><div class="pbbtns">${r.map((k) => `<button class="btn light" data-act="wizFailGo" data-r="${k}">${t(k)}</button>`).join("")}</div><label class="f">${t("pb_note")}</label><input data-pbnote />`);
  },
  scamAsk() {
    readWiz();
    const r = ["r_pass", "r_2fa", "r_ban"];
    modal(`<h3>${t("scamWhy")}</h3><div class="pbbtns">${r.map((k) => `<button class="btn light" data-act="scamGo" data-r="${k}">${t(k)}</button>`).join("")}</div>`);
  },
  async scamGo(b) {
    const w = S.wiz;
    await run(b, async () => {
      // raison en anglais : la liste scam part chez le vendeur
      const r = await api("stock/scam", { id: w.f.stockId, reason: L[b.dataset.r][1] });
      closeModal();
      // même téléphone GeeLark, même IP : on garde l'étape 3 et on remplit le compte suivant
      const keep = { geelarkProfile: w.f.geelarkProfile };
      if (r.next) {
        const it = r.next;
        w.f = { ...keep, stockId: it.id, stockOrder: it.order || "", pseudo: it.user, password: it.pass, totp: it.totp || "", email: it.email || "", emailPassword: it.emailPass || "" };
        toast(t("scamDone", { p: it.user }));
      } else {
        w.f = keep;
        toast(t("scamEmpty"), true);
      }
      w.step = 3;
      await refresh();
    });
  },
  async wizFailGo(b) {
    const w = S.wiz;
    // la faute du vendeur (mauvais identifiants, 2FA fausse, compte déjà banni) : scam + compte suivant sur le même téléphone
    if (w.f.stockId && ["r_pass", "r_2fa", "r_ban"].includes(b.dataset.r)) return ACT.scamGo(b);
    const reason = [L[b.dataset.r][2], $("[data-pbnote]")?.value || ""].filter(Boolean).join(" : ");
    await run(b, async () => {
      await api("accounts/failed", { bought: true, reason: `@${w.f.pseudo || "?"} : ${reason}`, geelarkProfile: w.f.geelarkProfile || "", stockId: w.f.stockId || undefined });
      closeModal();
      S.wiz = { step: 1, f: {}, done: t("failedSaved") };
      await refresh();
    });
  },
  wizReset() {
    S.wiz = { step: 1, f: {} };
    render();
  },
  async stockRelease(b) {
    await run(b, async () => {
      await api("stock/release", { id: S.wiz.f.stockId });
      S.wiz.f = { geelarkProfile: S.wiz.f.geelarkProfile };
      await refresh();
      toast(t("released"));
    });
  },
  // --- numéros / e-mails
  async smsPrices(b) {
    S.smsPrices = null;
    await run(b, async () => {
      S.smsPrices = await api("sms/prices");
      render();
    });
  },
  async smsBuy(b) {
    if (S.wiz) readWiz();
    await run(b, async () => {
      const act = await api("sms/buy", { country: Number(b.dataset.v) || 78, prov: b.dataset.prov || undefined });
      if (S.wiz && S.tab === "add") S.wiz.f.phone = act.phone;
      await refresh();
    });
  },
  async smsCode(b) {
    await run(b, async () => {
      await api(`sms/${S.data.sms.id}/code`, {});
      await refresh();
    });
  },
  async smsCancel(b) {
    await run(b, async () => {
      await api(`sms/${S.data.sms.id}/cancel`, {});
      if (S.wiz) S.wiz.f.phone = "";
      await refresh();
      toast(t("numRefunded"));
    });
  },
  async smsDone(b) {
    await run(b, async () => {
      await api(`sms/${S.data.sms.id}/finish`, {});
      await refresh();
    });
  },
  async noteNum(b) {
    await run(b, async () => {
      await api(`accounts/${S.forAcc}/edit`, { phone: S.data.sms.phone });
      await refresh();
      toast(t("noted"));
    });
  },
  async emailBuy(b) {
    if (S.wiz) readWiz();
    await run(b, async () => {
      await api("email/buy", {});
      await refresh();
    });
  },
  async emailCode(b) {
    await run(b, async () => {
      await api(`email/${S.data.emailAct.id}/code`, {});
      await refresh();
    });
  },
  async emailCancel(b) {
    await run(b, async () => {
      await api(`email/${S.data.emailAct.id}/cancel`, {});
      await refresh();
    });
  },
  async emailDone(b) {
    await run(b, async () => {
      await api(`email/${S.data.emailAct.id}/finish`, {});
      await refresh();
    });
  },
  async noteMail(b) {
    const a = accById(S.forAcc);
    await run(b, async () => {
      await api(`accounts/${S.forAcc}/edit`, { notes: [a.notes, `${S.data.today} : e-mail de vérification ${S.data.emailAct.email}`].filter(Boolean).join("\n") });
      await refresh();
      toast(t("noted"));
    });
  },
  // --- traduction
  async trRun(b) {
    const txt = ($("[data-trin]")?.value || "").trim();
    S.trTool = { text: txt, out: "", tl: b.dataset.tl };
    if (!txt) return render();
    await run(b, async () => {
      const r = await translate([txt], b.dataset.tl, true);
      if (!r[txt]) throw new Error(t("trFail"));
      S.trTool.out = r[txt];
      render();
    });
  },
  async trCheck(b) {
    await run(b, async () => {
      const r = await translate([S.trTool.out], "th", true);
      S.trTool.check = r[S.trTool.out] || "";
      render();
    });
  },
  // --- admin
  async saveConn(b) {
    const v = (k) => ($(`[data-px="${k}"]`)?.value || "").trim();
    let host = v("host").replace(/^(https?|socks5h?):\/\//i, "");
    let port = v("port");
    let user = v("user");
    let pass = v("pass");
    // une ligne entière collée dans « Hôte » : on la découpe
    const whole = parseProxy(host.includes(":") ? host : "");
    if (whole) ({ host, port, user, pass } = { host: whole.host, port: whole.port, user: whole.user || user, pass: whole.pass || pass });
    if (!host || !/^\d{2,5}$/.test(port)) return toast(A("Il faut au moins l'hôte et le port HTTP (un nombre)."), true);
    const body = { proxy: [host, port, user, pass].join(":").replace(/:+$/, ""), socksPort: v("socks").replace(/\D/g, "") };
    const rot = $('[data-sec="rotationUrl"]').value.trim();
    await run(b, async () => {
      await api("settings", body);
      if (rot) await api("secrets", { rotationUrl: rot });
      // test tout de suite : une faute de frappe dans l'hôte se voit à l'enregistrement, pas le jour où Emmy bloque
      await ipCheck(A("Enregistré") + ". ");
      await refresh();
    });
  },
  async saveSms(b) {
    const sec = {};
    document.querySelectorAll("[data-sec]").forEach((el) => { if (el.dataset.sec !== "rotationUrl" && el.value.trim()) sec[el.dataset.sec] = el.value.trim(); });
    const smsCountries = [...document.querySelectorAll("[data-cty]")].filter((x) => x.checked).map((x) => Number(x.dataset.cty));
    await run(b, async () => {
      if (Object.keys(sec).length) await api("secrets", sec);
      await api("settings", { smsCountries: smsCountries.length ? smsCountries : [78] });
      S.smsPrices = null;
      await refresh();
      toast(A("Enregistré"));
    });
  },
  async saveProg(b) {
    const program = {};
    document.querySelectorAll("[data-prog]").forEach((el) => (program[el.dataset.prog] = Number(el.value)));
    await run(b, async () => {
      await api("settings", { program, warmupMinutes: Math.max(0, Math.min(60, Number($('[data-s="warmupMinutes"]').value) || 0)), langFr: Number($('[data-s="langFr"]').value), rotateEachPass: $('[data-s="rotateEachPass"]').checked, timezone: $('[data-s="timezone"]').value.trim() || "Asia/Bangkok" });
      await refresh();
      toast(A("Programme enregistré"));
    });
  },
  async saveBanks(b) {
    const get = (k) => ($(`[data-bank="${k}"]`).value || "").split("\n").map((x) => x.trim()).filter(Boolean);
    await run(b, async () => {
      await api("settings", { comments: { fr: get("comments.fr"), en: get("comments.en") }, captions: { fr: get("captions.fr"), en: get("captions.en") } });
      await refresh();
      toast(A("Textes enregistrés"));
    });
  },
  async mediaDel(b) {
    await run(b, async () => {
      await api(`media/${b.dataset.id}/delete`, {});
      await refresh();
    });
  },
  async stockImport(b) {
    let text = $("[data-stocktext]").value;
    const files = $("[data-stockfile]").files;
    for (const f of files) text += "\n" + (await f.text());
    if (!text.trim()) return toast(A("Colle la liste ou choisis un fichier."), true);
    await run(b, async () => {
      const r = await api("stock/import", { text });
      await refresh();
      toast(A("{a} compte(s) ajouté(s), {b} doublon(s) ignoré(s)", { a: r.added, b: r.skipped }));
    });
  },
  async userAdd(b) {
    const body = { name: $('[data-u="name"]').value.trim(), pin: $('[data-u="pin"]').value.trim(), role: $('[data-u="role"]').value };
    await run(b, async () => {
      await api("users", body);
      await refresh();
      toast(A("Accès créé pour {x}", { x: body.name }));
    });
  },
  async userDel(b) {
    await run(b, async () => {
      await api("users", { name: b.dataset.name, remove: true });
      await refresh();
    });
  },
};
async function ipCheck(prefix) {
  try {
    const r = await api("ip");
    const fr = r.country === "FR";
    S.ipTest = { ok: fr, msg: prefix + A("IP vue par le proxy : {ip} · {c} {city} {org}", { ip: r.ip, c: r.country || "?", city: r.city || "", org: r.org || "" }) + " · " + (fr ? A("OK pour GeeLark") : A("pas en France, vérifie le proxy")) };
  } catch (e) {
    S.ipTest = { ok: false, msg: A("Proxy enregistré, mais il ne répond pas : {x} Vérifie chaque case (une lettre en trop ou en moins dans l'hôte suffit).", { x: e.message }) };
  }
}
const warmMin = () => Number(S.data?.settings?.warmupMinutes ?? 10);
// chrono du warm-up (le départ est gardé dans le navigateur : un rechargement ne remet pas à zéro)
setInterval(() => {
  const el = document.querySelector("[data-warmend]");
  if (!el || !el.dataset.warmend) return;
  const left = Math.max(0, Math.round((Number(el.dataset.warmend) - Date.now()) / 1000));
  el.textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  const btn = document.querySelector('[data-act="warmFinish"]');
  if (btn && !left && btn.disabled) {
    btn.disabled = false;
    const hint = btn.closest(".card")?.querySelector(".muted:last-child");
    if (hint) hint.remove();
  }
}, 1000);
function readWiz() {
  if (!S.wiz) return;
  document.querySelectorAll("input[data-f],select[data-f],textarea[data-f]").forEach((el) => (S.wiz.f[el.dataset.f] = el.value));
}
async function compress(file) {
  const img = await createImageBitmap(file);
  const max = 1600;
  const r = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * r);
  c.height = Math.round(img.height * r);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.88);
}

// ------------------------------------------------------------ événements
document.addEventListener("click", (e) => {
  const lang = e.target.closest("[data-lang]");
  if (lang) {
    if (S.wiz) readWiz();
    S.lang = lang.dataset.lang;
    lsSet("em_lang", S.lang);
    return render();
  }
  const pin = e.target.closest("[data-pin]");
  if (pin) return onPin(pin.dataset.pin);
  const tab = e.target.closest("[data-tab]");
  if (tab) {
    if (S.wiz) readWiz();
    S.tab = tab.dataset.tab;
    if (S.tab !== "today") S.pass = null;
    if (S.tab === "add" && S.wiz?.done) S.wiz = { step: 1, f: {} };
    lsSet("em_tab", S.tab);
    closeModal();
    window.scrollTo(0, 0);
    return render();
  }
  const f = e.target.closest("[data-filter]");
  if (f) {
    S.filter = f.dataset.filter;
    return render();
  }
  const b = e.target.closest("[data-act]");
  if (b && ACT[b.dataset.act]) {
    if (b.tagName === "A") e.preventDefault();
    ACT[b.dataset.act](b);
  }
  if (e.target.id === "modal") closeModal();
});
document.addEventListener("input", (e) => {
  if (e.target.matches("[data-search]")) {
    S.search = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const el = $("[data-search]");
    el.focus();
    el.setSelectionRange(pos, pos);
  }
  if (e.target.matches("[data-own]") && S.pass) S.pass.ownIn = e.target.value;
  if (e.target.matches("[data-trin]")) S.trTool.text = e.target.value;
});
document.addEventListener("change", async (e) => {
  if (e.target.matches("[data-foracc]")) {
    S.forAcc = e.target.value;
    return render();
  }
  if (e.target.matches("[data-upload]")) {
    const g = e.target.dataset.upload;
    let ok = 0;
    for (const f of e.target.files) {
      try {
        const dataUrl = await compress(f);
        await api("media/upload", { group: g, dataUrl, filename: f.name });
        ok++;
      } catch (err) {
        toast(`${f.name} : ${err.message}`, true);
      }
    }
    await refresh();
    toast(A("{n} photo(s) ajoutée(s)", { n: ok }));
  }
});
document.addEventListener("keydown", (e) => {
  if (!S.data && /^\d$/.test(e.key)) onPin(e.key);
  if (!S.data && e.key === "Backspace") onPin("del");
  if (!S.data && e.key === "Enter") onPin("go");
  if (e.key === "Escape") closeModal();
});
async function onPin(k) {
  if (k === "del") S.pin = S.pin.slice(0, -1);
  else if (k === "go") {
    try {
      const name = $("#firstname")?.value;
      const r = await api("login", { pin: S.pin, name });
      S.token = r.token;
      lsSet("em_token", r.token);
      S.pin = "";
      await refresh();
      return;
    } catch (err) {
      S.pin = "";
      toast(err.message, true);
    }
  } else if (S.pin.length < 8) S.pin += k;
  renderLogin();
}

// ------------------------------------------------------------ démarrage
(async () => {
  try {
    if (S.token) await refresh();
    else {
      S.firstRun = (await api("status")).firstRun;
      render();
    }
  } catch {
    try { S.firstRun = (await api("status")).firstRun; } catch {}
    render();
  }
  // compteurs rafraîchis chaque minute, jamais pendant une saisie, un passage ou un ajout
  setInterval(() => {
    const working = S.pass || ["add", "contenu", "reglages", "tr"].includes(S.tab);
    const watching = [...document.querySelectorAll("video")].some((v) => !v.paused && !v.ended);
    if (S.token && S.data && !S.busy && !working && !watching && $("#modal").classList.contains("hidden") && !document.activeElement?.matches("input,textarea,select")) refresh().catch(() => {});
  }, 60000);
})();
