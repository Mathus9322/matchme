# MatchMe

Plateforme de compétitions de génie en herbe : comptes, compétitions, équipes et joueurs, matchs en direct et administration. API Laravel (Sanctum) et interface Angular.

## Prérequis

- PHP 8.3 ou plus récent avec SQLite
- Composer
- Node.js 20.19 ou plus récent et npm

## Démarrage

Dans un premier terminal :

```sh
cd backend
php artisan serve --host=127.0.0.1 --port=8000
```

Dans un second terminal :

```sh
cd frontend
npm start
```

Ouvrir <http://localhost:4200>. Le serveur de développement Angular transmet les requêtes `/api` à Laravel sur le port 8000.

Pour les rappels de match (toutes les minutes), dans un troisième terminal :

```sh
cd backend
php artisan schedule:work
```

Les photos et logos sont servis depuis `backend/storage/app/public` via le lien `public/storage` (créé avec `php artisan storage:link`) ; le proxy Angular relaie `/api` et `/storage` vers Laravel. Après une modification de `proxy.conf.json`, relancez `npm start`.

Pour repartir d'une base de démonstration :

```sh
cd backend
php artisan migrate:fresh --seed
```

Comptes créés par le seeder (mot de passe `password`) :

- `admin@matchme.test` — administrateur
- `spectateur@matchme.test` — simple utilisateur : pages publiques uniquement
- `awa@matchme.test` — manager de la « Coupe régionale » (4 équipes, un match en direct)
- 20 managers, chacun organisateur d'une compétition : `fatou.sarr@matchme.test`, `moussa.ndiaye@matchme.test`, `aminata.fall@matchme.test`… (prénom.nom, sans accents)
- `capitaine1@matchme.test` à `capitaine12@matchme.test` — managers des 48 équipes du vivier

Les 21 compétitions couvrent tous les statuts (brouillon, inscriptions ouvertes, en cours, terminée), avec 4 à 8 équipes aux noms sénégalais, des poules A et B pour les plus grandes, des matchs terminés, en direct et programmés.

## Fonctionnalités

- **Deux espaces** : les **managers et administrateurs** arrivent après connexion dans l'**espace de gestion** (`/gestion` : tableau de bord, compétitions, équipes, matchs amicaux, arbitrage, dossiers documents, administration pour les admins). Un portail **« Vue publique »** leur montre le site comme les visiteurs, avec un bandeau pour revenir. Les **autres utilisateurs** n'ont que les **pages publiques**, en lecture seule (compétitions, classements, matchs en direct, équipes, à propos, profil). Sur la vue publique, aucun outil de gestion n'apparaît ; un manager y voit un lien « Gérer » vers la même page dans son espace.

- **Comptes et rôles** : inscription, connexion par jeton (Sanctum). Trois rôles : `user` (crée des équipes, des matchs amicaux, inscrit son équipe aux compétitions ouvertes), `manager` (crée et gère ses propres compétitions) et `admin` (gère tout). Seul un administrateur peut nommer un manager.
- **Équipes** : chaque utilisateur crée ses équipes et gère leurs joueurs (4 à 12, ordre modifiable).
- **Feuille de match et mi-temps** : pour chaque match, une équipe aligne 4 titulaires et jusqu'à 2 remplaçants (par défaut les 4 premiers joueurs puis les 2 suivants ; le capitaine ou l'arbitre peut composer la feuille avant le coup d'envoi). Le match se joue en deux mi-temps : seuls les joueurs sur le terrain marquent, les points sont suspendus pendant la mi-temps, et les remplacements (un remplaçant à la place d'un titulaire) ne sont possibles qu'à ce moment-là. Le match se termine en seconde mi-temps. Sur la page du match, on fait un remplacement en sélectionnant les deux joueurs puis « Remplacer », ou en glissant le remplaçant sur le joueur qui sort ; glisser un joueur sur un autre du même groupe échange leurs places (l'entrant reprend la place du sortant). Dans le formulaire d'équipe, glisser un joueur sur un autre échange leurs positions.
- **Cycle de vie d'une compétition** : « Publier » la fait passer « En cours » (2 équipes minimum), « Terminer » la clôture (aucun match en direct) et fige le classement ; « Rouvrir » annule une clôture.
- **Icônes** : l'interface utilise les icônes Lucide (aucun emoji).
- **Compétitions** : création, dates, statut (brouillon, inscriptions ouvertes, en cours, terminée). L'organisateur inscrit n'importe quelle équipe ; quand les inscriptions sont ouvertes, un capitaine peut inscrire la sienne.
- **Matchs** : l'organisateur programme des matchs entre équipes inscrites, les démarre, attribue des points (±10 à ±40) à un joueur ou à l'équipe, annule le dernier point et clôt le match. Le classement (3 pts victoire, 1 pt nul) se calcule automatiquement.
- **Page de compétition en onglets** : Informations, Équipes, Matchs (à venir et en direct), Résultats, Classement, Poules ou Calendrier selon le format, Barème & rubriques. L'onglet est conservé dans l'URL (`?onglet=classement`). Modification de la compétition, programmation d'un match et inscription d'équipes (sélection multiple) se font dans des fenêtres modales.
- **Formats** : « Poules » ou « Championnat ». En championnat, le calendrier se génère par journées (tous contre tous, aller simple ou aller-retour, dates espacées au choix) et le classement est unique.
- **Barème et rubriques** : l'organisateur définit un barème par défaut (valeurs de points, pénalités autorisées ou non) et compose le programme de ses matchs en rubriques (nom, description, barème propre), à partir d'un catalogue de 13 rubriques prédéfinies qu'il peut adapter, ou de rubriques personnalisées. Pendant le direct, l'arbitre choisit la rubrique en cours ; les points hors barème sont refusés et le score est détaillé par rubrique.
- **Poules** : l'organisateur crée des poules (A, B, C…) une par une ou par tirage au sort équilibré, affecte les équipes, puis génère en un clic les matchs « chacun contre chacun » de chaque poule. Chaque poule a son classement, en plus du classement général. Le tirage est bloqué dès qu'un match de poule a commencé.
- **Matchs amicaux** (`/amical`) : hors compétition, créés par n'importe quel utilisateur connecté avec des équipes existantes ou des « équipes rapides » (nom + joueurs saisis sur place). Le créateur arbitre le score.
- **Fiches équipes et joueurs (publiques)** : `/equipes/:id` présente le bilan de l'équipe (matchs, victoires, nuls, défaites, taux de victoire, points marqués et encaissés, forme sur les 5 derniers matchs), son effectif avec les statistiques de chaque joueur (matchs joués, points, moyenne, bonnes réponses, pénalités), le meilleur marqueur, les compétitions, les derniers résultats et les prochains matchs. Un clic sur un joueur ouvre sa fiche : points par rubrique, meilleur match et historique match par match. Un remplaçant resté sur le banc ne compte pas de match joué.
- **Statistiques dans les matchs (amicaux compris)** : chaque match affiche, dans un dépliant « Statistiques des équipes et des joueurs », le bilan importé des deux équipes (V/N/D, taux de victoire, moyennes, forme, dont matchs amicaux), les stats de chaque joueur (cliquables vers sa fiche) et le face-à-face des deux équipes (victoires, nuls, dernières rencontres). À la création d'un amical, choisir une équipe existante affiche son bilan. Les matchs amicaux comptent dans les statistiques.
- **Pop-ups du match** : sur la page d'un match, grandes annonces pour le coup d'envoi, la mi-temps, le début de la 2e mi-temps et la fin (score, vainqueur) ; notifications pour chaque point marqué et chaque pénalité ; les remplacements faits à la mi-temps sont annoncés au début de la 2e mi-temps. Un bouton coupe les pop-ups (réglage mémorisé dans le navigateur).
- **Questions du match (import PDF)** : le manager importe le PDF de ses questions et réponses (modèle téléchargeable : « Rubrique : … », « 1. Question … (20 pts) », « Réponse : … ») ; le texte est transformé en une liste de questions qu'il peut corriger, compléter ou réordonner. Pendant le match, il affiche les questions une à une et révèle les réponses ; les points attribués sont rattachés à la question en cours. Les spectateurs voient la question en cours, la réponse une fois révélée et les joueurs qui ont répondu, ainsi que les questions déjà posées dans un dépliant. Les questions non posées et les réponses non révélées ne sont jamais envoyées au public. Les questions posées figurent sur la feuille de score. Le PDF doit contenir du texte (pas un scan).
- **Feuilles de score** : à la fin de chaque match de compétition, une feuille de score virtuelle (instantané figé : équipes, feuille de match, points par joueur et par rubrique, remplacements, déroulé, vainqueur, signatures) est rangée dans le sous-dossier « Résultats » des dossiers documents, et accessible depuis la page du match. Elle s'exporte en PDF (A4) ou en PNG, générés dans le navigateur. `php artisan result-sheets:generate` crée les feuilles manquantes des matchs déjà terminés.
- **Dossiers documents** : dans chaque compétition, chaque utilisateur dispose d'un dossier privé (`storage/app/private/competitions/{compétition}/users/{utilisateur}`). L'organisateur et les administrateurs voient tous les dossiers. 10 Mo maximum par fichier.
- **Photos et logos** : chaque utilisateur choisit sa photo de profil (page « Mon profil »), chaque équipe son logo et une photo par joueur (formulaire d'équipe). La page d'un match affiche les logos dans le tableau de score, la photo de chaque joueur et la carte du manager (organisateur de la compétition ou créateur de l'amical). JPG, PNG, WebP ou GIF, 2 Mo maximum ; les fichiers sont supprimés quand l'image, le joueur ou l'équipe est supprimé.
- **Rappels avant match** : 10 minutes avant le coup d'envoi d'un match programmé, les managers des deux équipes (propriétaires des équipes) reçoivent un e-mail et une notification dans la plateforme (cloche dans la barre de navigation). Un match reprogrammé déclenche un nouveau rappel. Les comptes de démonstration en `.test` ne reçoivent que la notification.
- **Direct** : les pages d'accueil et de match se rafraîchissent toutes les 3 à 5 secondes, sans connexion requise pour les spectateurs.
- **Administration** (`/admin`) : statistiques, gestion des utilisateurs (nom, e-mail, rôle, mot de passe, suppression), des compétitions, des équipes et des matchs.

### E-mails

L'envoi passe par le SMTP configuré dans `backend/.env` (`MAIL_MAILER=smtp`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`). Avec Gmail ou Google Workspace : `smtp.gmail.com`, port `587`, et un mot de passe d'application. `FRONTEND_URL` sert aux liens des e-mails. Ne commitez jamais `.env`.

### Taille des fichiers

PHP limite les envois à 2 Mo par défaut. Pour accepter des documents jusqu'à 10 Mo, relevez `upload_max_filesize` et `post_max_size` dans votre `php.ini` (par exemple `upload_max_filesize = 10M` et `post_max_size = 110M`).

## API

Lecture publique : `GET /api/games/{id}/matchup`, `GET /api/teams/{id}/stats`, `GET /api/players/{id}/stats`, `GET /api/rubric-presets`, `GET /api/competitions/{id}/result-sheets`, `GET /api/result-sheets/{id}`, `GET /api/competitions`, `/api/competitions/{id}` (avec classement), `/api/teams`, `/api/games?status=live`, `/api/games/{id}`.

Authentifié (`Authorization: Bearer <token>`) : `POST|DELETE /api/auth/me/avatar`, `POST|DELETE /api/teams/{id}/logo`, `POST|DELETE /api/players/{id}/photo`, `GET /api/notifications`, `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all`, `POST /api/teams`, `PUT|DELETE /api/teams/{id}`, `POST /api/competitions`, `PUT|DELETE /api/competitions/{id}`, `POST|DELETE /api/competitions/{id}/teams`, `POST /api/competitions/{id}/games`, `PUT|DELETE /api/games/{id}`, `POST /api/games/{id}/start|finish|events`, `DELETE /api/games/{id}/events/last`, `POST /api/games/friendly`, `PUT /api/games/{id}/lineup`, `POST /api/games/{id}/halftime`, `POST /api/games/{id}/second-half`, `POST /api/games/{id}/substitutions`, `POST /api/games/{id}/swap`, `POST /api/games/{id}/questions/import`, `POST /api/games/{id}/questions`, `PUT|DELETE /api/questions/{id}`, `POST /api/questions/{id}/show|reveal`, `POST /api/competitions/{id}/publish|finish|reopen`, `PUT /api/competitions/{id}/scoring`, `POST /api/competitions/{id}/rubrics`, `POST /api/competitions/{id}/rubrics/presets`, `PUT|DELETE /api/rubrics/{id}`, `POST /api/rubrics/{id}/move`, `POST /api/competitions/{id}/league/schedule`, `POST /api/competitions/{id}/groups`, `POST /api/competitions/{id}/groups/draw`, `PUT /api/competitions/{id}/teams/{team}/group`, `PUT|DELETE /api/groups/{id}`, `POST /api/groups/{id}/schedule`, `GET|POST /api/competitions/{id}/documents`, `GET /api/documents/{id}/download`, `DELETE /api/documents/{id}`.

Managers et administrateurs : `GET /api/manage/overview`, `POST /api/teams`, `POST /api/games/friendly`, dossiers documents.

Administrateurs : `GET /api/admin/stats`, `GET /api/admin/users`, `PUT|DELETE /api/admin/users/{id}`.

## Tests

```sh
cd backend
php artisan test
```

```sh
cd frontend
npm test -- --watch=false
```