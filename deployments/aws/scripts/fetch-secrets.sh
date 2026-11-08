#!/usr/bin/env bash
# Render env/api.env and env/live.env from AWS SSM Parameter Store so secrets never live in git.
# Store each variable as a SecureString under a prefix, e.g.:
#   aws ssm put-parameter --type SecureString --name /velora/prod/api/SECRET_KEY --value '...'
#   aws ssm put-parameter --type SecureString --name /velora/prod/live/LIVE_SERVER_SECRET_KEY --value '...'
# Then on the server:  ./scripts/fetch-secrets.sh /velora/prod
set -euo pipefail

PREFIX="${1:?usage: fetch-secrets.sh /velora/prod}"
imds_region() {
  # IMDSv2 (token required on hardened instances)
  local token
  token="$(curl -sf -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')" || return 0
  curl -sf -H "X-aws-ec2-metadata-token: ${token}" http://169.254.169.254/latest/meta-data/placement/region || true
}
REGION="${AWS_REGION:-$(imds_region)}"
: "${REGION:?could not determine AWS region; set AWS_REGION}"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
umask 077

render() {
  local service="$1" out="env/${1}.env"
  aws ssm get-parameters-by-path --region "$REGION" --path "${PREFIX}/${service}" --with-decryption --recursive \
    --query 'Parameters[].[Name,Value]' --output text |
    while IFS=$'\t' read -r name value; do
      printf '%s=%s\n' "${name##*/}" "$value"
    done >"${out}.tmp"
  [ -s "${out}.tmp" ] || { echo "No parameters found under ${PREFIX}/${service}" >&2; rm -f "${out}.tmp"; exit 1; }
  mv "${out}.tmp" "$out"
  echo "Wrote ${out} ($(wc -l <"$out") variables)"
}

render api
render live
