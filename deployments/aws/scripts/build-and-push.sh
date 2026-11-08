#!/usr/bin/env bash
# Build all Velora images and push them to Amazon ECR.
# Run from anywhere on a machine (or CI runner) with Docker + AWS CLI v2 configured.
#
#   AWS_REGION=us-east-1 ./deployments/aws/scripts/build-and-push.sh            # tag = git SHA
#   AWS_REGION=us-east-1 IMAGE_TAG=v1.0.0 ./deployments/aws/scripts/build-and-push.sh
#   PLATFORM=linux/arm64 ...   # for Graviton (t4g/m7g) instances
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
AWS_REGION="${AWS_REGION:?set AWS_REGION}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
IMAGE_TAG="${IMAGE_TAG:-$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD)}"
PLATFORM="${PLATFORM:-linux/amd64}"

if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ] && [ "${ALLOW_DIRTY:-0}" != "1" ]; then
  echo "Refusing to build from a dirty working tree (set ALLOW_DIRTY=1 to override)." >&2
  exit 1
fi

# name | build context | dockerfile
IMAGES=(
  "velora-web|.|apps/web/Dockerfile.web"
  "velora-admin|.|apps/admin/Dockerfile.admin"
  "velora-space|.|apps/space/Dockerfile.space"
  "velora-live|.|apps/live/Dockerfile.live"
  "velora-api|apps/api|apps/api/Dockerfile.api"
  "velora-proxy|apps/proxy|apps/proxy/Dockerfile.ce"
)

echo "Logging in to ${ECR_REGISTRY}"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"

for entry in "${IMAGES[@]}"; do
  IFS="|" read -r name context dockerfile <<<"$entry"

  aws ecr describe-repositories --region "$AWS_REGION" --repository-names "$name" >/dev/null 2>&1 ||
    aws ecr create-repository --region "$AWS_REGION" --repository-name "$name" \
      --image-scanning-configuration scanOnPush=true --image-tag-mutability IMMUTABLE >/dev/null

  echo "==> Building ${name}:${IMAGE_TAG} (${PLATFORM})"
  docker buildx build \
    --platform "$PLATFORM" \
    -f "${REPO_ROOT}/${dockerfile}" \
    -t "${ECR_REGISTRY}/${name}:${IMAGE_TAG}" \
    --push \
    "${REPO_ROOT}/${context}"
done

echo
echo "Pushed tag ${IMAGE_TAG}. On the server set IMAGE_TAG=${IMAGE_TAG} in deployments/aws/.env and run scripts/deploy.sh"
