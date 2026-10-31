// Transfert des connexions Threads HQ -> Threads Emmy (deux serveurs locaux NEUFS).
//   (cd ../threads-hq && PORT=8795 node dev/server.mjs) & PORT=8796 node dev/server.mjs &
//   HQ=http://localhost:8795 BASE=http://localhost:8796 node dev/test-transfer.mjs
const HQ = process.env.HQ || "http://localhost:8795";
const BASE = process.env.BASE || "http://localhost:8796";
let fails = 0;
const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fails++; };
async function call(base, path, body, token) {
  const r = await fetch(base + "/api/" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", authorization: "Bearer " + (token || "") }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, j: await r.json().catch(() => ({})) };
}
// Sandra : connexions branchées
const hq = (await call(HQ, "login", { pin: "1111", name: "Awen" })).j.token;
await call(HQ, "settings", { socksPort: "17157", proxy: "fr.grid.test:8000:awen:pw" }, hq);
await call(HQ, "secrets", { rotationUrl: "https://rotate.test/x", heroToken: "HERO_TEST", spKey: "SP_TEST" }, hq);
await call(HQ, "users", { name: "Sandra", pin: "2222", role: "va" }, hq);
const va = (await call(HQ, "login", { pin: "2222" })).j.token;
let r = await call(HQ, "transfer/create", {}, va);
ok(r.s === 403, "la VA de Sandra ne peut pas créer de code");
r = await call(HQ, "transfer/pull", { code: "TE-" + "a".repeat(32) });
ok(r.s === 403, "code inventé refusé");
r = await call(HQ, "transfer/create", {}, hq);
ok(/^TE-[a-z0-9]{32}$/.test(r.j.code), "code de transfert créé : " + r.j.code);
const code = r.j.code;
// Emmy : récupère
const em = (await call(BASE, "login", { pin: "1234", name: "Awen" })).j.token;
let st = (await call(BASE, "state", null, em)).j;
ok(!st.configured.proxy && !st.configured.rotation && !st.configured.sms, "Threads Emmy vide au départ");
r = await call(BASE, "import/hq", { code, url: HQ }, em);
ok(r.s === 200 && ["proxy", "socksPort", "rotationUrl", "heroToken", "spKey"].every((k) => r.j.imported.includes(k)), "récupéré : " + JSON.stringify(r.j.imported || r.j));
st = (await call(BASE, "state", null, em)).j;
ok(st.configured.proxy && st.configured.rotation && st.configured.smsHero && st.configured.smsPool, "proxy + rotation + Hero + SMSPool branchés dans Threads Emmy");
ok(st.settings.proxy === "fr.grid.test:8000:awen:pw" && st.settings.socksPort === "17157", "proxy et port SOCKS5 identiques à Sandra");
r = await call(BASE, "rotate", {}, em);
ok(r.s === 200 && r.j.ip, "rotation d'IP qui marche avec le lien récupéré");
ok(st.settings.proxyFrom && st.settings.proxyFrom.src === "hq" && st.settings.proxyFrom.host === "fr.grid.test", "proxy marqué « même que Sandra »");
r = await call(BASE, "settings", { proxy: "emmy.proxy.test:9000:emmy:pw2" }, em);
st = (await call(BASE, "state", null, em)).j;
ok(st.settings.proxy.startsWith("emmy.proxy.test") && st.settings.proxyFrom.host === "fr.grid.test", "nouveau proxy d'Emmy : différent de celui de Sandra");

r = await call(BASE, "import/hq", { code, url: HQ }, em);
ok(r.s === 403, "le même code ne marche qu'une fois");
r = await call(BASE, "sms/prices", null, em);
ok(r.s === 200 && r.j.length > 0, "prix des numéros lus avec les clés récupérées");
const logs = (await call(HQ, "state", null, hq)).j.logs.map((l) => l.action);
ok(logs.includes("transfert_envoye") && logs.includes("transfert_refuse"), "journal de Sandra : transfert tracé");
console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nTOUT PASSE");
process.exit(fails ? 1 : 0);
