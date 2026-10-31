# CLAUDE.md : Threads Emmy (CRM des comptes Threads achetés)

Lis ce fichier en entier avant de toucher au code.

## Le projet en 6 lignes
- Emmy (copine d'Awen, thaïlandaise) gère seule des comptes Threads ACHETÉS, chacun sur un téléphone GeeLark.
- Elle ne crée pas de compte : elle les ajoute (IP neuve, téléphone GeeLark + proxy, connexion avec 2FA), puis les réchauffe.
- Programme de warm-up : 5 actions par jour et par compte. Semaine 1 = commentaires texte. Semaine 2 = texte + photo. Semaine 3 = un post tous les 2 jours + commentaires. Semaine 4+ = 1 post/jour + commentaires.
- 70 % des comptes en français, 30 % en anglais (langue attribuée toute seule à l'ajout).
- Interface d'Emmy en thaï parlé (pas formel), boutons EN et FR. Pages admin (Awen) en français.
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

## Récupérer les connexions de Threads HQ
- Réglages > « Récupérer de Threads HQ » : Awen colle le code créé dans Threads HQ (Réglages > Créer un code de transfert). `import/hq` appelle `https://threads-hq-sa.netlify.app/api/transfer/pull` et range proxy + clés côté serveur. Profil IP forcé sur France.
- Test : `dev/test-transfer.mjs` (Threads HQ local sur 8795 + Threads Emmy local sur 8796).

## Proxy (31 oct., 17 h 30)
- Réglages > Proxy : 5 cases comme le panel du fournisseur (hôte, port HTTP, port SOCKS5, utilisateur, mot de passe). Une ligne entière collée dans « Hôte » est découpée toute seule.
- Le serveur refuse un proxy sans port (bug réel : seul l'hôte était enregistré, GeeLark n'avait ni utilisateur ni mot de passe). `currentIp` ne lit JAMAIS l'IP sans proxy : proxy vide ou incomplet = erreur claire (avant, il lisait l'IP du serveur et tout semblait marcher).
- `settings.proxyFrom` (posé par l'import Threads HQ) : la page affiche « Même proxy que Sandra » tant que l'hôte/port/utilisateur n'ont pas changé, sinon « Proxy propre à Emmy ».
- « Tester l'IP » : affiche l'IP, le pays et l'opérateur, vert seulement si FR.
