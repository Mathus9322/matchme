# MatchMe : un seul conteneur pour Render (ou tout hébergeur Docker).
# nginx sert Angular, relaie /api vers Laravel (php-fpm) et /app vers Reverb (buzzer temps réel).

# ---- 1. Angular -------------------------------------------------------------------------
FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx ng build --configuration production --output-path /dist

# ---- 2. Dépendances PHP --------------------------------------------------------------------
FROM composer:2 AS vendor
WORKDIR /app
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction --ignore-platform-reqs

# ---- 3. Image finale -------------------------------------------------------------------------
FROM php:8.4-fpm-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx supervisor gettext-base libpq-dev \
    && docker-php-ext-install pdo_pgsql pcntl opcache \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY docker/php.ini /usr/local/etc/php/conf.d/zz-matchme.ini
COPY docker/php-fpm.conf /usr/local/etc/php-fpm.d/zz-matchme.conf

WORKDIR /var/www/backend
COPY backend/ ./
COPY --from=vendor /app/vendor ./vendor
RUN composer dump-autoload --optimize --no-dev --no-interaction \
    && rm -f .env database/database.sqlite \
    && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

COPY --from=frontend /dist/browser /var/www/frontend
COPY docker/nginx.conf.template /etc/nginx/templates/matchme.conf.template
COPY docker/supervisord.conf /etc/supervisor/conf.d/matchme.conf
COPY docker/start.sh /usr/local/bin/start-matchme
RUN chmod +x /usr/local/bin/start-matchme && rm -f /etc/nginx/sites-enabled/default

# Render fournit le port d'écoute dans $PORT (10000 par défaut).
ENV PORT=10000
EXPOSE 10000
CMD ["start-matchme"]
