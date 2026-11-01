# CLAUDE.md : Threads Emmy (CRM des comptes Threads achetés)

Lis ce fichier en entier avant de toucher au code.

## Le projet en 6 lignes
- Emmy (copine d'Awen, thaïlandaise) gère seule des comptes Threads ACHETÉS, chacun sur un téléphone GeeLark.
- Elle ne crée pas de compte : elle les ajoute (IP neuve, téléphone GeeLark + proxy, connexion avec 2FA), puis les réchauffe.
- Programme de warm-up : 5 actions par jour et par compte. Semaine 1 = commentaires texte. Semaine 2 = texte + photo. Semaine 3 = un post tous les 2 jours + commentaires. Semaine 4+ = 1 post/jour + commentaires.
- 70 % des comptes en français, 30 % en anglais (langue attribuée toute seule à l'ajout).
- TOUTE l'interface (Emmy ET pages admin) en thaï parlé (pas formel), boutons EN et FR. Pages admin : `A("phrase française")` traduite par `ADM` dans i18n.js. Aucun texte en dur. Tests : `dev/test-admin-th.mjs` et `dev/test-langs.mjs` (17 pages × 3 langues, à lancer après test-ui).
- Copie allégée de Threads HQ (repo `threads-hq`, CRM de la VA Sandra) : même serveur, sans Metricool dans l'interface.

## Où sont les choses
- `public/app.js` : toute l'interface (vues, passage sur un compte, ajout d'un compte, admin).
- `public/i18n.js` : TOUS les textes d'Emmy, `L[clé] = [thaï, anglais, français]`. Un texte d'Emmy ne s'écrit jamais en dur dans app.js.
- `public/style.css` : base Threads HQ + bloc « Threads Emmy » + thème ROSE en bas (dégradé rose, demandé par Awen le 31/10). Garder le rose.
- `lib/core.mjs` : logique serveur (routes `/api/*`), reprise de Threads HQ. Ajouts Emmy repérés par « Emmy » dans les commentaires.
- `lib/seeds.mjs` : banques de départ (commentaires FR/EN, textes de posts FR/EN).
- `netlify/functions/api.mjs` : branche le serveur sur Netlify (stockage Netlify Blobs, propre à ce site).
- `dev/` : serveur local avec faux proxy / faux Hero / faux SMSPool, et les tests.

## Commandes
```bash
npm install
node dev/server.mjs                                   # http://localhost:8788
node dev/test-api.mjs                                 # toute l'API (serveur NEUF)
PORT=8789 node dev/server.mjs & BASE=http://localhost:8789 node dev/test-ui.mjs   # parcours complet Playwright, captures dans dev/shots/
```
Ne dis jamais « c'est fait » sans les deux tests au vert.

## Règles métier
- 1 compte = 1 téléphone GeeLark = 1 IP à l'ajout. Le serveur refuse un nom de téléphone déjà pris ou grillé, et une IP déjà vue.
- Ajout : IP changée il y a moins de 15 min pour commencer (navigateur), acceptée jusqu'à 4 h à l'enregistrement.
- Compte raté à l'ajout (`accounts/failed`) : téléphone GeeLark grillé, compte du stock marqué « raté » avec le motif.
- Passage (`accounts/:id/act`) : kinds `c` (commentaire texte), `p` (commentaire photo), `post`. Écart mini entre 2 actions d'un même compte : `program.gapMin` (60 min). Option `rotateEachPass` : changer l'IP avant chaque passage (bouton « เสร็จแล้ว » bloqué sinon, sauf si la rotation n'est pas branchée).
- Le type de la prochaine action = celui le plus en retard sur le plan du jour ; le post n'est jamais la 1re action du jour. Pas de photo en stock = commentaire texte (Emmy n'est jamais bloquée).
- Un compte ne reçoit jamais deux fois le même texte ni la même photo ; le CRM prend le moins utilisé de tous les comptes.
- Statuts : `warmup` (en cours), `verif` (vérification demandée), `restreint`, `saute`, `actif`. Seuls `warmup` et `actif` sont dans la file du jour.
- Le jour change selon `settings.timezone` (Asia/Bangkok par défaut). Jour 1 = `startDay` du compte (modifiable par l'admin).

## Comptes achetés (stock)
- Réglages admin > Comptes achetés : coller la liste ou glisser le .txt. `parseBoughtList` lit `identifiant mdp CLE2FA`, `identifiant:mdp:email:mdpmail:CLE2FA`, `identifiant mdp email mdpmail` (tab, espace, `:`, `;`, `|`). La clé 2FA peut être coupée en groupes de 4.
- À l'étape 3 de l'ajout, `stock/take` réserve un compte et remplit tout (identifiant, mdp, 2FA, e-mail, mdp du mail).

## Vérifications (numéro / e-mail)
- Page « Numéro & e-mail » : numéros SMSPool / SMSOnline / Hero (pays dans Réglages, France + USA par défaut) et e-mails temporaires Hero. Le code arrive tout seul (toutes les 5 s). « Noter sur @compte » enregistre le numéro sur le compte.
- E-mail du compte acheté : bouton « Ouvrir la boîte mail » (webmail selon le domaine, à ouvrir dans le téléphone GeeLark du compte). Pas de lecture IMAP (Outlook l'a coupée pour les mots de passe simples).

## Traduction
- `POST /api/tr2 {texts, tl}` : Google Translate (gtx) vers th / fr / en, cache `tr2/<langue>/<sha1>`. Si Google refuse le serveur, le navigateur traduit et renvoie au cache.
- Sous chaque texte à copier : son sens en thaï. Page « แปลภาษา » : thaï vers FR/EN et l'inverse. Les erreurs du serveur (en français) sont traduites pour Emmy.

## Sécurité (non négociable)
- Repo PUBLIC (Netlify gratuit ne déploie un repo privé que pour les commits du compte AwenTarget). Donc AUCUN secret dans le code : proxy, lien de rotation, clés SMS se collent dans Réglages. Site : https://threads-emmy.netlify.app
- Le navigateur ne relit jamais les secrets. Emmy (rôle VA) ne voit ni Réglages, ni Journal, ni Accès.

## Déploiement
- Netlify, site relié à ce repo (branche `main`) : push = redéploiement en ~30 s. Stockage Netlify Blobs du site (séparé de Threads HQ).
- Premier code tapé sur le site neuf = admin (Awen). Ensuite Réglages > Accès pour créer le code d'Emmy.

## Plus rien de Sandra dans l'interface (31 oct., 17 h 45)
- Demande d'Awen : retirer le bloc « Récupérer de Threads HQ (Sandra) » et le badge « même proxy que Sandra » pour éviter les malentendus. La route serveur `import/hq` reste (test `dev/test-transfer.mjs`) mais n'est plus affichée.
- Un lien de rotation appartient à UN proxy : `secrets.rotationFor` = hôte du proxy au moment où le lien est collé. Hôte différent ou propriétaire inconnu = `configured.rotationOk` faux, « à faire » en rouge dans Réglages, et `rotate` refusé (409) avec le nom du proxy. Évite de faire tourner l'IP du proxy de Sandra.
- Enregistrer le proxy lance « Tester l'IP » tout seul (une faute de frappe dans l'hôte se voit tout de suite).

## Proxy (31 oct., 17 h 30)
- Réglages > Proxy : 5 cases comme le panel du fournisseur (hôte, port HTTP, port SOCKS5, utilisateur, mot de passe). Une ligne entière collée dans « Hôte » est découpée toute seule.
- Le serveur refuse un proxy sans port (bug réel : seul l'hôte était enregistré, GeeLark n'avait ni utilisateur ni mot de passe). `currentIp` ne lit JAMAIS l'IP sans proxy : proxy vide ou incomplet = erreur claire (avant, il lisait l'IP du serveur et tout semblait marcher).
- « Tester l'IP » : affiche l'IP, le pays et l'opérateur, vert seulement si FR.

## Compte scam (31 oct., 18 h)
- Étape 3 de l'ajout (compte du stock) : bouton « บัญชีเสีย (Scam) » (mot de passe faux, 2FA refusée, compte déjà banni). `stock/scam` range le compte en statut `scam` (raison en anglais, pour le vendeur) et donne TOUT DE SUITE le compte suivant du stock. Le téléphone GeeLark et l'IP restent : la faute vient du vendeur, pas du téléphone (il n'est PAS grillé).
- « ใช้ไม่ได้ » à l'étape 4 avec ces 3 raisons = même chose (scam + compte suivant). Vérification impossible / autre = échec classique (téléphone grillé, compte « raté »).
- Admin > Comptes achetés : compteur scam + liste « à réclamer au vendeur » (n° de commande · identifiant · raison) avec bouton Copier. Un compte scam ne revient jamais par un nouvel import.

## Étape GeeLark : langue du téléphone
- Après les cases du proxy, encadré jaune avec l'image `public/help/cloud-phone-language.png` : « Cloud phone language » (et Location) sur « Based on IP ». Demandé par Awen.

## Warm-up de 10 min après l'ajout (31 oct., 18 h 10)
- Demandé par Awen (« il doit y être », comme chez Sandra). Étape 5 de l'ajout : chrono `settings.warmupMinutes` (10 par défaut, réglable dans Réglages > Programme), même téléphone, même IP, scroll + 5-10 likes + 3-5 abonnements, zéro post / lien / changement de profil, 3 cases à cocher.
- Le compte est créé avec `needWarm10: true` : il n'entre PAS dans la file du jour tant que `accounts/:id/warm10` n'est pas validé (refusé avant la fin du chrono). Le départ du chrono est gardé dans le navigateur (`warm10_<id>`) : un rechargement ne le remet pas à zéro.
- Warm-up pas fini (page fermée) : section « ต้องวอร์ม 10 นาทีก่อน » dans Aujourd'hui, bouton pour le reprendre.

## Comptes à suivre pendant le warm-up (1er nov.)
- Liste donnée par Awen (19 comptes) dans `lib/seeds.mjs` (`FOLLOW_ACCOUNTS`), modifiable dans Textes et photos (`settings.followBank`, `followPerWarmup` = 4).
- Étape 5 : le CRM tire 4 comptes, les moins suivis par les autres comptes d'abord (tirage gardé dans le navigateur, `follow_<id>`), avec boutons Copier et la marche à suivre (loupe, coller, 1-2 likes, Suivre). À la fin du warm-up, la liste est notée sur le compte (`acc.follows`) : jamais la même liste partout.
- « Rendre au stock » remet le compte à la FIN de la file (avant, le « Prendre » suivant redonnait le même compte). Même règle dans Threads HQ (1er nov.).
