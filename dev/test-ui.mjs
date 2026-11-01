// Parcours complet d'Emmy dans un vrai navigateur (Playwright), sur un serveur local NEUF.
//   PORT=8789 node dev/server.mjs   puis   BASE=http://localhost:8789 node dev/test-ui.mjs
// Captures dans dev/shots/.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:8789";
const OUT = new URL("./shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fails++; };
async function call(path, body, token) {
  const r = await fetch(BASE + "/api/" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", authorization: "Bearer " + (token || "") }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}
const dev = (p) => fetch(BASE + p).then((r) => r.text());

// --- données de départ (comme Awen le fera)
const adm = (await call("login", { pin: "1234", name: "Awen" })).token;
await call("settings", { proxy: "fr.proxy-grid.test:8000:awen_user:secretpw", socksPort: "17157" }, adm);
await call("secrets", { rotationUrl: "https://rotate.test/go", heroToken: "HERO_TEST", spKey: "SP_TEST" }, adm);
await call("users", { name: "Emmy", pin: "5678", role: "va" }, adm);
await call("settings", { warmupMinutes: 0.05 }, adm); // warm-up de 3 s pour le test (10 min en vrai)
await call("stock/import", { text: "lea_x99:pw123:lea@outlook.com:mailpw!:JBSWY3DPEHPK3PXP\nmia.cool pw9 mia@gmail.com Mpw9 JBSW Y3DP EHPK 3PXP\nnina.rose pw5 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ\nzoe.lune pw6 JBSWY3DPEHPK3PXP" }, adm);

const browser = await chromium.launch();
// photos de test (dessinées dans le navigateur)
{
  const p = await browser.newPage({ viewport: { width: 400, height: 400 } });
  for (const [g, color, label] of [["commentaires", "#f7c6d9", "photo 1"], ["commentaires", "#c6e2f7", "photo 2"], ["posts", "#d9f7c6", "post 1"]]) {
    await p.setContent(`<div style="width:400px;height:400px;background:${color};display:grid;place-items:center;font:700 40px Arial">${label}</div>`);
    const buf = await p.screenshot();
    await call("media/upload", { group: g, dataUrl: "data:image/png;base64," + buf.toString("base64"), filename: label + ".png" }, adm);
  }
  await p.close();
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/translate\.googleapis|fonts\.g|Failed to load resource/.test(m.text()) && errors.push(m.text()));
const shot = (n) => page.screenshot({ path: OUT + n + ".png", fullPage: true });
const click = (sel) => page.click(sel);

// --- connexion d'Emmy (thaï par défaut)
await page.goto(BASE);
await page.waitForSelector(".keypad");
await shot("01-connexion-thai");
ok((await page.textContent(".login-card")).includes("ใส่รหัสเข้าใช้งาน"), "écran de connexion en thaï");
for (const k of "5678") await page.keyboard.press(k);
await page.keyboard.press("Enter");
await page.waitForSelector(".shell");
ok((await page.textContent("main")).includes("งานวันนี้"), "accueil en thaï");
ok(!(await page.textContent(".side")).includes("Réglages"), "Emmy ne voit pas les réglages");
await shot("02-aujourdhui-vide");

// --- ajouter 2 comptes
for (let n = 1; n <= 2; n++) {
  await click('[data-tab="add"]');
  await page.waitForSelector('[data-act="rotate"]');
  await click('main [data-act="rotate"]');
  await page.waitForSelector(".alert.c-green");
  if (n === 1) await shot("03-ajout-1-ip");
  await click('[data-act="wizNext"]');
  await page.waitForSelector('[data-f="geelarkProfile"]');
  ok((await page.textContent("main")).includes("fr.proxy-grid.test") && (await page.textContent("main")).includes("17157"), "étape GeeLark : hôte + port SOCKS5 affichés");
  await page.fill('[data-f="geelarkProfile"]', "emmy-0" + n);
  if (n === 1) await shot("04-ajout-2-geelark-proxy");
  await click('[data-act="wizNext"]');
  await page.waitForSelector('[data-f="pseudo"]');
  await page.waitForTimeout(1200);
  const user = await page.inputValue('[data-f="pseudo"]');
  ok(!!user, `étape connexion : compte du stock rempli tout seul (@${user})`);
  const code = await page.textContent('[data-totp="__wiz"]');
  const expect = await page.evaluate((k) => window.totpCodeForTest(k), "JBSWY3DPEHPK3PXP");
  ok(/^\d{6}$/.test(code) && code === expect, `code 2FA en direct (${code})`);
  if (n === 1) {
    ok((await page.inputValue('[data-f="email"]')) === "lea@outlook.com" && (await page.inputValue('[data-f="emailPassword"]')) === "mailpw!", "e-mail + mot de passe du mail remplis");
    await shot("05-ajout-3-connexion-2fa");
  }
  await click('[data-act="wizNext"]');
  await page.waitForSelector('[data-act="wizCreate"]');
  if (n === 1) await shot("06-ajout-4-ca-marche");
  await click('[data-act="wizCreate"]');
  // étape 5 : warm-up obligatoire avant la file du jour
  await page.waitForSelector('[data-act="warmStart"]');
  ok((await page.textContent(".stepnum")).includes("5"), `@${user} : étape 5, warm-up affiché`);
  let st0 = await call("state", null, adm);
  ok(st0.accounts.find((a) => a.pseudo === user).needWarm10 === true, `@${user} : pas encore dans la file (warm-up à faire)`);
  const fl = await page.$$eval(".followbox .copyline .v", (els) => els.map((e) => e.textContent.trim()));
  ok(fl.length === 4, `warm-up : 4 comptes à suivre affichés (${fl.join(", ")})`);
  if (n === 1) await shot("06c-warmup-10min");
  await click('[data-act="warmStart"]');
  await page.waitForTimeout(3600);
  for (const c of await page.$$("[data-warmck]")) await c.check();
  await page.waitForFunction(() => !document.querySelector('[data-act="warmFinish"]').disabled);
  await click('[data-act="warmFinish"]');
  await page.waitForSelector("main .alert.c-green");
  ok((await page.textContent("main")).includes(user), `compte @${user} ajouté après le warm-up`);
}
{
  const st1 = await call("state", null, adm);
  const [f1, f2] = st1.accounts.slice(0, 2).map((a) => a.follows || []);
  ok(f1.length === 4 && f2.length === 4 && f1.every((u) => !f2.includes(u)), "comptes suivis notés, et le 2e compte n'a pas la même liste que le 1er");
}
// 3e compte : mauvais mot de passe = scam, un autre compte arrive tout de suite sur le même téléphone
await click('[data-act="wizReset"]');
await click('main [data-act="rotate"]');
await page.waitForSelector(".alert.c-green");
await click('[data-act="wizNext"]');
ok((await page.locator(".langip img").count()) === 1, "étape GeeLark : rappel « Cloud phone language : Based on IP » avec l'image");
await page.fill('[data-f="geelarkProfile"]', "emmy-03");
await click('[data-act="wizNext"]');
await page.waitForTimeout(800);
const bad = await page.inputValue('[data-f="pseudo"]');
await click('[data-act="scamAsk"]');
await page.waitForSelector('[data-act="scamGo"]');
await click('[data-act="scamGo"][data-r="r_pass"]');
await page.waitForFunction((u) => document.querySelector('[data-f="pseudo"]') && document.querySelector('[data-f="pseudo"]').value && document.querySelector('[data-f="pseudo"]').value !== u, bad);
const good = await page.inputValue('[data-f="pseudo"]');
ok(good && good !== bad && (await page.textContent(".stepnum")).includes("3"), `scam : @${bad} remplacé tout de suite par @${good}, toujours à l'étape 3`);
let st = await call("state", null, adm);
ok(st.stock.scam === 1 && !st.geelarkBurned.includes("emmy-03"), "scam : rangé dans Scam, téléphone GeeLark PAS grillé");
await shot("06b-scam-nouveau-compte");
// ce compte-là demande une vérification impossible : échec normal, téléphone grillé
await click('[data-act="wizNext"]');
await click('[data-act="wizFail"]');
await page.waitForSelector('[data-act="wizFailGo"]');
await click('[data-act="wizFailGo"][data-r="r_verif"]');
await page.waitForSelector("main .alert.c-green");
st = await call("state", null, adm);
ok(st.stock.rate === 1 && st.geelarkBurned.includes("emmy-03"), "vérification impossible : compte raté, téléphone GeeLark grillé");

// --- journée : passage sur un compte
await click('[data-tab="today"]');
await page.waitForSelector('[data-act="passStart"]');
await shot("07-aujourdhui");
await click('main .btn.big[data-act="passStart"]');
await page.waitForSelector(".bigtext");
const txt = await page.textContent(".bigtext");
ok(txt.length > 1, `passage : texte proposé « ${txt} »`);
ok((await page.locator('[data-act="passDone"]').isDisabled()), "« เสร็จแล้ว » bloqué tant que l'IP n'est pas changée");
await click('main [data-act="rotate"]');
await page.waitForSelector(".card.step.ok");
await page.waitForTimeout(600);
await shot("08-passage-commentaire");
const t2 = await page.textContent(".bigtext");
await click('[data-act="passOther"]');
ok((await page.textContent(".bigtext")) !== t2, "« เอาอันอื่น » change le texte");
await click('[data-act="passDone"]');
await page.waitForSelector('main .btn.big[data-act="passStart"], main .done-all');
st = await call("state", null, adm);
const doneAcc = st.accounts.find((a) => (a.acts || []).length === 1);
ok(!!doneAcc && doneAcc.acts[0].k === "c", "action enregistrée sur le compte");
// l'écart de 60 min : le même compte n'est pas reproposé tout de suite
const next = await page.getAttribute('main .btn.big[data-act="passStart"]', "data-id");
ok(next && next !== doneAcc.id, "le compte suivant est un autre compte (écart de 60 min respecté)");

// --- semaine 2 : commentaire photo / semaine 3 : post
const [acc1, acc2] = st.accounts.filter((a) => a.status === "warmup");
const ago = (n) => new Date(Date.parse(st.today + "T00:00:00Z") - n * 864e5).toISOString().slice(0, 10);
await call(`accounts/${acc1.id}/edit`, { startDay: ago(7) }, adm); // jour 8
await call(`accounts/${acc2.id}/edit`, { startDay: ago(14) }, adm); // jour 15
await page.reload();
await page.waitForSelector(".shell");
await page.click(`main .task [data-act="passStart"][data-id="${acc1.id}"]`);
await page.waitForSelector(".bigtext");
ok((await page.textContent("main")).includes("สัปดาห์ 2"), "jour 8 = semaine 2");
const hasImg = await page.locator(".passimg img").count();
ok(hasImg === 1, "semaine 2 : premier passage = commentaire avec photo");
await shot("09-passage-semaine2-photo");
await click('[data-act="passClose"]');
// semaine 3 : 1er passage = photo ou texte, le post vient ensuite
await call(`accounts/${acc2.id}/act`, { kind: "c", text: "x1" }, adm);
await page.reload();
await page.waitForSelector(".shell");
await page.click(`main .task [data-act="passStart"][data-id="${acc2.id}"]`).catch(() => {});
await page.waitForSelector(".bigtext");
ok((await page.textContent("main h3:has-text('3.')")).includes("โพสต์ใหม่"), "jour 15, 2e passage : nouveau post");
await shot("10-passage-semaine3-post");
await click('[data-act="passClose"]');

// --- souci sur un compte
await page.click(`main .task [data-act="passStart"][data-id="${acc1.id}"]`);
await page.waitForSelector('[data-act="problemMenu"]');
await click('[data-act="problemMenu"]');
await page.waitForSelector(".modal:not(.hidden)");
await page.fill("[data-pbnote]", "ขอเบอร์โทร");
await shot("11-souci");
await click('[data-act="setState"][data-st="verif"]');
await page.waitForSelector("[data-foracc]");
ok((await page.inputValue("[data-foracc]")) === acc1.id, "vérification : page Numéro & e-mail ouverte sur le bon compte");
// numéro + code
await page.waitForSelector('[data-act="smsBuy"]');
await page.click('[data-act="smsBuy"]');
await page.waitForSelector("[data-smswait]");
await dev("/__dev/sp?code=553311");
await page.waitForSelector(".codebig", { timeout: 12000 });
ok((await page.textContent(".codebig")).includes("553311"), "code SMS affiché tout seul");
await click('[data-act="noteNum"]');
await page.waitForTimeout(500);
await shot("12-numero-code");
// e-mail temporaire
await click('[data-act="emailBuy"]');
await page.waitForSelector("[data-emailwait]");
await dev("/__dev/email?code=660022");
await page.waitForFunction(() => document.querySelectorAll(".codebig").length >= 2, null, { timeout: 12000 });
ok((await page.textContent("main")).includes("660022"), "code e-mail affiché tout seul");
st = await call("state", null, adm);
ok(st.accounts.find((a) => a.id === acc1.id).phone, "numéro noté sur le compte");
await page.click('[data-act="smsDone"]');
await page.waitForTimeout(400);
await page.click('[data-act="emailDone"]');
await page.waitForTimeout(400);
// réglé
await click('[data-tab="today"]');
await page.waitForSelector('[data-act="setState"][data-st="warmup"]');
await shot("13-aujourdhui-a-regler");
await click('[data-act="setState"][data-st="warmup"]');
await page.waitForTimeout(500);

// --- comptes : identifiants + 2FA
await click('[data-tab="accounts"]');
await page.waitForSelector(".acc");
await page.click(".acc [data-act='showLogin']");
await page.waitForSelector(".modal:not(.hidden) [data-totp]");
await page.waitForTimeout(1200);
ok(/^\d{6}$/.test(await page.textContent(".modal [data-totp]")), "fiche compte : code 2FA en direct");
ok((await page.textContent(".modal")).includes("outlook.live.com") || (await page.locator('.modal a[href*="outlook.live.com"]').count()) === 1, "lien de la boîte mail (Outlook)");
await shot("14-comptes-identifiants");
await page.keyboard.press("Escape");
await shot("15-comptes");

// --- traduction
await click('[data-tab="tr"]');
await page.fill("[data-trin]", "น่ารักมาก");
await click('[data-act="trRun"][data-tl="fr"]');
await page.waitForSelector(".trout");
ok((await page.textContent(".trout")).length > 0, "traduction thaï → français");
await shot("16-traduire");

// --- guide + langues
await click('[data-tab="guide"]');
await page.waitForSelector(".sop");
await shot("17-guide-thai");
await page.click('.side [data-lang="en"]');
ok((await page.textContent("main h2")).trim() === "Guide" && (await page.textContent(".side")).includes("Today"), "bouton EN");
await page.click('.side [data-lang="fr"]');
await click('[data-tab="today"]');
ok((await page.textContent("main h2")).includes("Le travail du jour"), "bouton FR");
await shot("18-aujourdhui-fr");
await page.click('.side [data-lang="th"]');

// --- mobile
const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
await m.goto(BASE);
await m.evaluate((tok) => localStorage.setItem("em_token", tok), await page.evaluate(() => localStorage.getItem("em_token")));
await m.goto(BASE);
await m.waitForSelector(".shell");
await m.screenshot({ path: OUT + "19-mobile.png", fullPage: true });
await m.close();

// --- admin
await page.evaluate(() => localStorage.clear());
await page.goto(BASE);
await page.waitForSelector(".keypad");
for (const k of "1234") await page.keyboard.press(k);
await page.keyboard.press("Enter");
await page.waitForSelector(".shell");
await page.click('.side [data-lang="fr"]');
for (const [tab, n] of [["suivi", "20-admin-suivi"], ["reglages", "21-admin-reglages"], ["contenu", "22-admin-textes-photos"], ["stock", "23-admin-stock"], ["journal", "24-admin-journal"]]) {
  await click(`.side [data-tab="${tab}"]`);
  await page.waitForTimeout(300);
  await shot(n);
}
ok((await page.textContent("main")).includes("Action faite"), "journal lisible");

ok(errors.length === 0, "aucune erreur JS" + (errors.length ? " : " + errors.slice(0, 3).join(" | ") : ""));
await browser.close();
console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nTOUT PASSE");
process.exit(fails ? 1 : 0);
