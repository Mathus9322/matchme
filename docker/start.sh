#!/bin/sh
# Démarrage du conteneur : configuration nginx, migrations, caches, puis tous les processus.
set -e
cd /var/www/backend

envsubst '${PORT}' < /etc/nginx/templates/matchme.conf.template > /etc/nginx/conf.d/matchme.conf

if [ -z "$APP_KEY" ]; then
  echo "APP_KEY manquante : générez-la avec « php artisan key:generate --show » et ajoutez-la dans Render." >&2
  exit 1
fi
# Valeur aléatoire générée par Render (base64 brut) : Laravel attend le préfixe « base64: ».
case "$APP_KEY" in base64:*) ;; *) export APP_KEY="base64:$APP_KEY" ;; esac

# Adresse publique fournie par Render (liens des logos et photos).
export APP_URL="${APP_URL:-$RENDER_EXTERNAL_URL}"

# Reverb (buzzer) : clés générées au démarrage si absentes ; les navigateurs les reçoivent de l'API.
export REVERB_APP_ID="${REVERB_APP_ID:-$(od -An -N4 -tu4 /dev/urandom | tr -d ' ')}"
export REVERB_APP_KEY="${REVERB_APP_KEY:-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')}"
export REVERB_APP_SECRET="${REVERB_APP_SECRET:-$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')}"

php artisan storage:link --force >/dev/null 2>&1 || true
php artisan migrate --force

# Base vide (première mise en ligne, ou nouvelle base Render gratuite) : jeu de données minimal.
if [ "${SEED_ON_EMPTY:-true}" = "true" ] && [ "$(php artisan tinker --execute='echo \App\Models\User::count();' 2>/dev/null | tail -n1)" = "0" ]; then
  echo "Base vide : chargement du jeu de données minimal."
  php artisan db:seed --force
fi

php artisan config:cache
php artisan route:cache
php artisan view:cache
chown -R www-data:www-data storage bootstrap/cache

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/matchme.conf
