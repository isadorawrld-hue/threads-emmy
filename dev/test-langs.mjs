// Les 3 langues : en EN et en FR, aucun caractère thaï ; en TH, aucun mot français. Toutes les pages (Emmy + admin).
// À lancer après test-ui.mjs, sur le même serveur.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE || "http://localhost:8789";
const THAI = /[฀-๿]/;
const FR = /\b(Réglages|Enregistrer|Suivi|Comptes achetés|Mot de passe|Utilisateur|Hôte|Programme|Accès|branché|à faire|Importer|Supprimer|Commentaires|Statut|Ajouter|Aujourd'hui|compte suivant|Étape)\b/;
const b = await chromium.launch();
let fails = 0;
for (const [pin, tabs] of [["5678", ["today", "accounts", "add", "verify", "tr", "guide"]], ["1234", ["today", "accounts", "add", "verify", "tr", "guide", "suivi", "contenu", "stock", "reglages", "journal"]]]) {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(BASE);
  await p.evaluate(() => localStorage.clear());
  await p.goto(BASE);
  await p.waitForSelector(".keypad");
  for (const k of pin) await p.keyboard.press(k);
  await p.keyboard.press("Enter");
  await p.waitForSelector(".shell");
  for (const lang of ["th", "en", "fr"]) {
    await p.click(`.side [data-lang="${lang}"]`);
    for (const tab of tabs) {
      await p.click(`.side [data-tab="${tab}"]`);
      await p.waitForTimeout(250);
      // l'interface seulement : pas le contenu (commentaires FR/EN, pseudos, notes tapées par Emmy) ni les champs
      const txt = await p.evaluate(() => { const c = document.querySelector(".shell").cloneNode(true); c.querySelectorAll("textarea,input,select,.bigtext,.frtr,.copyline .v,.task-text span,.ps,.langs,.accnote").forEach((x) => x.remove()); return c.innerText; });
      const bad = lang === "th" ? txt.match(FR) : txt.match(THAI) ? [txt.match(new RegExp(".{0,20}" + THAI.source + ".{0,20}"))[0]] : null;
      if (bad) { fails++; console.log(`FAIL ${pin === "1234" ? "admin" : "Emmy"} ${lang} ${tab} : « ${bad[0]} »`); }
    }
  }
  console.log(`OK   ${pin === "1234" ? "admin" : "Emmy"} : ${tabs.length} pages × 3 langues vérifiées`);
  await p.close();
}
await b.close();
console.log(fails ? `\n${fails} ÉCHEC(S)` : "\nTOUT PASSE");
process.exit(fails ? 1 : 0);
