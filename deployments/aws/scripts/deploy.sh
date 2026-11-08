#!/usr/bin/env bash
# Deploy (or upgrade) Velora on the EC2 host. Safe to re-run.
#   cd /opt/velora/deployments/aws && ./scripts/deploy.sh [IMAGE_TAG]
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

[ -f .env ] || { echo "Missing deployments/aws/.env (copy .env.example)" >&2; exit 1; }
[ -f env/api.env ] || { echo "Missing env/api.env (copy env/api.env.example)" >&2; exit 1; }
[ -f env/live.env ] || { echo "Missing env/live.env (copy env/live.env.example)" >&2; exit 1; }

if [ "${1:-}" != "" ]; then
  sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$1/" .env
fi

set -a; . ./.env; set +a
: "${ECR_REGISTRY:?ECR_REGISTRY missing in .env}"
: "${IMAGE_TAG:?IMAGE_TAG missing in .env}"

# Guard against the most common production misconfigurations.
grep -qE '^BILLING_DEV_MODE=1' env/api.env && { echo "BILLING_DEV_MODE=1 is not allowed in production" >&2; exit 1; }
grep -qE '^DEBUG=1' env/api.env && { echo "DEBUG=1 is not allowed in production" >&2; exit 1; }
grep -qE '^SECRET_KEY=$' env/api.env && { echo "SECRET_KEY is empty in env/api.env" >&2; exit 1; }
grep -qE '^AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)=$' env/api.env &&
  { echo "Remove empty AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY lines so the instance role is used" >&2; exit 1; }

COMPOSE=(docker compose --env-file .env -f docker-compose.aws.yml)

echo "==> Logging in to ECR"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"

echo "==> Pulling ${IMAGE_TAG}"
"${COMPOSE[@]}" --profile migrate pull

echo "==> Running database migrations"
"${COMPOSE[@]}" --profile migrate run --rm migrator

echo "==> Starting services"
"${COMPOSE[@]}" up -d --remove-orphans

echo "==> Waiting for the API to become healthy"
for _ in $(seq 1 30); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$("${COMPOSE[@]}" ps -q api)" 2>/dev/null || true)"
  [ "$status" = "healthy" ] && { echo "API healthy."; break; }
  sleep 5
done
[ "${status:-}" = "healthy" ] || { echo "API did not become healthy; check: docker compose logs api" >&2; exit 1; }

docker image prune -f >/dev/null
"${COMPOSE[@]}" ps
echo "Deployed ${IMAGE_TAG}."
