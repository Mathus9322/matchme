# MatchMe

Application de suivi des scores de matchs de génie en herbe, avec une API Laravel et une interface Angular.

## Prérequis

- PHP 8.3 ou plus récent avec SQLite
- Composer
- Node.js 20.19 ou plus récent et npm

## Démarrage

Dans un premier terminal :

```sh
cd backend
php artisan serve --host=127.0.0.1 --port=8001
```

Dans un second terminal :

```sh
cd frontend
npm start
```

Ouvrir <http://localhost:4200>. Le serveur de développement Angular transmet les requêtes `/api` à Laravel sur le port 8001. La base SQLite et sa clé d'application sont initialisées par Composer lors de la création du backend.

## API

- `POST /api/matches` crée un match; chaque équipe doit avoir un nom et quatre joueurs.
- `GET /api/matches/{id}` renvoie les équipes d'un match.

Les noms des équipes et des joueurs sont sauvegardés dans SQLite. Le score évolue dans l'interface pendant le match.

## Tests

```sh
cd backend
php artisan test
```

```sh
cd frontend
npm test -- --watch=false
```