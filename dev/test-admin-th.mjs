// Pages admin en thaï : aucun texte français visible (à lancer après test-ui.mjs, même serveur).
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE || "http://localhost:8789";
const OUT = new URL("./shots/", import.meta.url).pathname;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto(BASE);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem("em_lang", "th"); });
await p.goto(BASE);
await p.waitForSelector(".keypad");
for (const k of "1234") await p.keyboard.press(k);
await p.keyboard.press("Enter");
await p.waitForSelector(".shell");
let fails = 0;
// mots français qui ne doivent plus apparaître en thaï
const FR = /\b(Réglages|Enregistrer|Suivi|Comptes achetés|Textes et photos|Journal|Mot de passe|Utilisateur|Hôte|Programme|Accès|branché|à faire|Importer|Supprimer|Commentaires|aujourd'hui|dernière|Statut|Ajouter)\b/;
for (const tab of ["suivi", "contenu", "stock", "reglages", "journal"]) {
  await p.click(`.side [data-tab="${tab}"]`);
  await p.waitForTimeout(300);
  // le contenu des banques (commentaires FR/EN) est en français exprès : on ne regarde que l'interface
  const txt = await p.evaluate(() => { const c = document.querySelector(".shell").cloneNode(true); c.querySelectorAll("textarea,input").forEach((x) => x.remove()); return c.innerText; });
  const m = txt.match(FR);
  console.log((m ? "FAIL " : "OK   ") + `admin ${tab} en thaï` + (m ? ` : « ${m[0]} » encore en français` : ""));
  if (m) fails++;
  await p.screenshot({ path: OUT + `th-admin-${tab}.png`, fullPage: true });
}
await b.close();
console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nTOUT PASSE");
process.exit(fails ? 1 : 0);
