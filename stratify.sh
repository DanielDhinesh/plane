#!/usr/bin/env bash
# Stratify self-host helper — wraps docker compose for the single-file deployment.
set -euo pipefail

cd "$(dirname "$0")"
COMPOSE_FILE="docker-compose.selfhost.yml"
ENV_FILE=".env.selfhost"
compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

rand() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "${1:-48}"; }

setup() {
  if [[ -f "$ENV_FILE" ]]; then
    echo "$ENV_FILE already exists — leaving it untouched."
    return
  fi
  cp .env.selfhost.example "$ENV_FILE"
  read -r -p "Public URL (e.g. https://pm.example.com) [http://localhost]: " url
  url="${url:-http://localhost}"
  domain="$(echo "$url" | sed -E 's#^https?://##; s#/.*$##')"
  sed -i.bak \
    -e "s#^WEB_URL=.*#WEB_URL=${url}#" \
    -e "s#^APP_DOMAIN=.*#APP_DOMAIN=${domain}#" \
    -e "s#^SECRET_KEY=.*#SECRET_KEY=$(rand 64)#" \
    -e "s#^LIVE_SERVER_SECRET_KEY=.*#LIVE_SERVER_SECRET_KEY=$(rand 48)#" \
    -e "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=$(rand 32)#" \
    -e "s#^RABBITMQ_PASSWORD=.*#RABBITMQ_PASSWORD=$(rand 32)#" \
    -e "s#^STORAGE_SECRET_KEY=.*#STORAGE_SECRET_KEY=$(rand 40)#" \
    "$ENV_FILE"
  if [[ "$url" == https://* ]]; then
    read -r -p "Email for Let's Encrypt certificates: " cert_email
    sed -i.bak -e "s#^SITE_ADDRESS=.*#SITE_ADDRESS=${domain}#" -e "s#^CERT_EMAIL=.*#CERT_EMAIL=email ${cert_email}#" "$ENV_FILE"
  fi
  rm -f "$ENV_FILE.bak"
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE with random secrets. Add your SMTP details there (optional)."
}

usage() {
  cat <<USAGE
Usage: ./stratify.sh <command>

  setup      create .env.selfhost with random secrets
  up         build and start everything (first run takes a while)
  down       stop the stack (data is kept)
  restart    restart all services
  logs [svc] follow logs (optionally for one service, e.g. api)
  status     show service status
  update     git pull, rebuild and restart
  backup     dump the database to ./backups/
  shell      open a Django shell in the api container
USAGE
}

case "${1:-}" in
  setup) setup ;;
  up)
    [[ -f "$ENV_FILE" ]] || setup
    compose up -d --build
    echo "Stratify is starting. Open $(grep '^WEB_URL=' "$ENV_FILE" | cut -d= -f2-) in a minute; instance admin: /god-mode"
    ;;
  down) compose down ;;
  restart) compose restart ;;
  logs) shift; compose logs -f --tail=200 "$@" ;;
  status) compose ps ;;
  update) git pull --ff-only && compose up -d --build ;;
  backup)
    mkdir -p backups
    file="backups/stratify-$(date +%Y%m%d-%H%M%S).sql.gz"
    compose exec -T stratify-db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip >"$file"
    echo "Database saved to $file"
    ;;
  shell) compose exec api python manage.py shell ;;
  *) usage ;;
esac
