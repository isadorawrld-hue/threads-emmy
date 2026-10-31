// Test de toute l'API d'Emmy sur un serveur local NEUF : node dev/server.mjs puis node dev/test-api.mjs
const BASE = process.env.BASE || "http://localhost:8788";
let fails = 0;
const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fails++; };
async function call(path, body, token, method) {
  const r = await fetch(BASE + "/api/" + path, { method: method || (body ? "POST" : "GET"), headers: { "content-type": "application/json", authorization: "Bearer " + (token || "") }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { s: r.status, j };
}
const dev = (p) => fetch(BASE + p).then((r) => r.text());

const st0 = await call("status");
ok(st0.j.firstRun === true, "site neuf : premier accès");
const adm = (await call("login", { pin: "1234", name: "Awen" })).j.token;
ok(!!adm, "Awen admin connecté");
let r = await call("settings", { proxy: "ydgnjl5mqn.cn.fxdx.in" }, adm);
ok(r.s === 400, "proxy sans port refusé (hôte seul)");
r = await call("ip", null, adm);
ok(r.s === 400 && /Proxy pas réglé/.test(r.j.error), "pas de proxy = pas de lecture d'IP en direct : " + r.j.error);
r = await call("settings", { proxy: "proxy.test:8000:user1:pw1", socksPort: "17157" }, adm);
ok(r.s === 200, "proxy enregistré");
r = await call("secrets", { rotationUrl: "https://rotate.test/go", heroToken: "HERO_TEST", spKey: "SP_TEST" }, adm);
ok(r.j.rotation && r.j.smsHero && r.j.smsPool, "rotation + Hero + SMSPool branchés");
r = await call("users", { name: "Emmy", pin: "5678", role: "va" }, adm);
ok(r.s === 200 && r.j.some((u) => u.name === "Emmy" && u.role === "va"), "accès Emmy créé (VA)");
const list = `Order: 4242
julie.paris12	Pa55word!	JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP
lea_x99:pw123:lea@outlook.com:mailpw!:JBSWY3DPEHPK3PXP
mia.cool pw9 mia@firstmail.ltd Mpw9 JBSW Y3DP EHPK 3PXP
sophie.en pw7 sophie@gmail.com gpw7
pub : achetez nos comptes !!!`;
r = await call("stock/import", { text: list }, adm);
ok(r.j.added === 4, "stock : 4 comptes importés (formats mélangés) : " + JSON.stringify(r.j));
r = await call("stock/import", { text: list }, adm);
ok(r.j.added === 0, "stock : doublons ignorés");

const emmy = (await call("login", { pin: "5678" })).j.token;
ok(!!emmy, "Emmy connectée");
r = await call("settings", { proxy: "x" }, emmy);
ok(r.s === 403, "Emmy ne peut pas toucher aux réglages");
let s = (await call("state", null, emmy)).j;
ok(!s.logs && !s.users, "Emmy ne voit ni journal ni accès");
ok(s.settings.comments.fr.length > 100 && s.settings.comments.en.length > 60, "banques de commentaires FR/EN chargées");
ok(s.settings.program.perDay === 5 && s.settings.timezone === "Asia/Bangkok", "programme 5/jour, fuseau Bangkok");
ok(s.stock.dispo === 4, "4 comptes dispo en stock");

// --- ajout de 4 comptes : langues 70/30
const made = [];
for (let i = 0; i < 4; i++) {
  r = await call("rotate", {}, emmy);
  ok(r.s === 200 && r.j.ip, `IP changée (${r.j.ip})`);
  const it = (await call("stock/take", {}, emmy)).j;
  ok(!!it.user, `compte pris du stock : ${it.user} ${it.email || ""}`);
  if (it.user === "lea_x99") ok(it.email === "lea@outlook.com" && it.emailPass === "mailpw!" && it.totp === "JBSWY3DPEHPK3PXP", "e-mail + mdp mail + 2FA bien lus");
  r = await call("accounts/create", { bought: true, pseudo: it.user, password: it.pass, totp: it.totp, email: it.email, emailPassword: it.emailPass, geelarkProfile: "emmy-0" + (i + 1), stockId: it.id }, emmy);
  ok(r.s === 200 && r.j.status === "warmup", `compte @${it.user} ajouté (${r.j.lang}, jour ${r.j.startDay})`);
  made.push(r.j);
}
const langs = made.map((a) => a.lang);
ok(langs.filter((l) => l === "fr").length === 3 && langs.filter((l) => l === "en").length === 1, "langues réparties : " + langs.join(","));
r = await call("rotate", {}, emmy);
r = await call("accounts/create", { bought: true, pseudo: "autre", password: "x", geelarkProfile: "emmy-01" }, emmy);
ok(r.s === 400, "même téléphone GeeLark refusé ? " + (r.j.error || "(accepté)"));

// --- actions
const a = made[0];
r = await call(`accounts/${a.id}/act`, { kind: "c", text: "mdr trop vrai" }, emmy);
ok(r.s === 200 && r.j.acts.length === 1 && r.j.acts[0].k === "c", "action commentaire notée");
r = await call(`accounts/${a.id}/act`, { kind: "p", text: "trop mignon 🥹", mediaId: "abc" }, emmy);
ok(r.j.acts.length === 2 && r.j.acts[1].m === "abc", "commentaire photo noté avec la photo");
r = await call(`accounts/${a.id}/undo`, {}, emmy);
ok(r.j.acts.length === 1, "annuler la dernière action");
r = await call(`accounts/${a.id}/act`, { kind: "zz" }, emmy);
ok(r.s === 400, "type d'action inconnu refusé");
r = await call(`accounts/${a.id}/state`, { status: "verif", note: "demande un numéro" }, emmy);
ok(r.j.status === "verif" && /demande un numéro/.test(r.j.notes), "statut vérification + note");
r = await call(`accounts/${a.id}/state`, { status: "warmup" }, emmy);
ok(r.j.status === "warmup", "réglé : retour en warm-up");
r = await call(`accounts/${a.id}/edit`, { lang: "en", geelarkProfile: "emmy-01b" }, emmy);
ok(r.j.lang === "en" && r.j.geelarkProfile === "emmy-01b", "modifier langue + téléphone");
r = await call(`accounts/${made[3].id}/state`, { status: "saute" }, emmy);
r = await call(`accounts/${made[3].id}/act`, { kind: "c", text: "x" }, emmy);
ok(r.s === 400, "compte sauté : plus d'action possible");

// --- numéro (SMSPool en premier) + code
r = await call("sms/buy", { country: 78, prov: "smspool" }, emmy);
ok(r.s === 200 && r.j.phone, "numéro France pris : " + (r.j.phone || r.j.error));
const sid = r.j.id;
await dev("/__dev/sp?code=482913");
r = await call(`sms/${sid}/code`, {}, emmy);
ok(r.j.code === "482913", "code SMS reçu : " + r.j.code);
r = await call(`sms/${sid}/finish`, {}, emmy);
ok(r.s === 200, "numéro fermé");
// --- e-mail temporaire (Hero) + code
r = await call("email/buy", {}, emmy);
ok(r.s === 200 && /@/.test(r.j.email || ""), "e-mail temporaire pris : " + (r.j.email || r.j.error));
await dev("/__dev/email?code=771204");
r = await call(`email/${r.j.id}/code`, {}, emmy);
ok(r.j.code === "771204", "code e-mail reçu : " + r.j.code);
r = await call(`email/${r.j.id}/finish`, {}, emmy);

// --- traduction thaï
r = await call("tr2", { texts: ["mdr trop vrai"], tl: "th" }, emmy);
ok(!!r.j["mdr trop vrai"], "traduction vers le thaï : " + r.j["mdr trop vrai"]);

// --- programme modifiable, bornes
r = await call("settings", { program: { perDay: 99, gapMin: 45 }, langFr: 150 }, adm);
ok(r.j.program.perDay === 20 && r.j.program.gapMin === 45 && r.j.langFr === 100, "programme borné (20 max, 100 % max)");
r = await call("settings", { program: { perDay: 5, gapMin: 60 }, langFr: 70 }, adm);
r = await call("settings", { comments: { fr: ["a", "a", " b "], en: [] } }, adm);
ok(JSON.stringify(r.j.comments.fr) === '["a","b"]', "banque nettoyée (doublons, espaces)");

s = (await call("state", null, adm)).j;
ok(s.stock.utilise === 4 && s.stock.dispo === 0, "stock : 4 utilisés");
ok(s.logs.some((l) => l.action === "action_faite") && s.logs.some((l) => l.action === "statut_change"), "journal : actions et statuts tracés");

console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nTOUT PASSE");
process.exit(fails ? 1 : 0);
