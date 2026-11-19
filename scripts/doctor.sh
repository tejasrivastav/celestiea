#!/usr/bin/env bash
# Checks the tools the README needs. Local development needs the first group; deploying and
# benchmarking need the second. Exits non-zero if anything required locally is missing.
set -uo pipefail

missing=0

version_at_least() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]; }

check() {
  local group=$1 name=$2 minimum=$3 version=$4
  if [ -z "$version" ]; then
    printf '  %-16s missing%s\n' "$name" "$([ -n "$minimum" ] && echo " (need $minimum+)")"
    [ "$group" = local ] && missing=1
  elif [ -n "$minimum" ] && ! version_at_least "$version" "$minimum"; then
    printf '  %-16s %s (need %s+)\n' "$name" "$version" "$minimum"
    [ "$group" = local ] && missing=1
  else
    printf '  %-16s %s\n' "$name" "$version"
  fi
}

first_version() { grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1; }

echo "Local development"
check local git "" "$(git --version 2>/dev/null | first_version)"
check local make "" "$(make --version 2>/dev/null | first_version)"
check local docker "" "$(docker version --format '{{.Server.Version}}' 2>/dev/null)"
check local "docker compose" 2.1 "$(docker compose version --short 2>/dev/null | first_version)"
check local node 22 "$(node --version 2>/dev/null | first_version)"
check local pnpm 10 "$(cd app 2>/dev/null && pnpm --version 2>/dev/null | first_version)"
for port in 5432 6379 8080; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    printf '  %-16s in use (stop whatever listens on it, or the stack will not start)\n' "port $port"
  fi
done

echo "Deploy and benchmark (optional)"
check deploy aws 2.0 "$(aws --version 2>/dev/null | first_version)"
check deploy terraform 1.11 "$(terraform version 2>/dev/null | first_version)"
check deploy "docker buildx" "" "$(docker buildx version 2>/dev/null | first_version)"
check deploy jq "" "$(jq --version 2>/dev/null | first_version)"
check deploy zip "" "$(zip -v 2>/dev/null | sed -n 2p | first_version)"
check deploy curl "" "$(curl --version 2>/dev/null | first_version)"
check deploy k6 "" "$(k6 version 2>/dev/null | first_version)"
profile=${AWS_PROFILE:-celestiea}
if aws configure list-profiles 2>/dev/null | grep -qx "$profile"; then
  printf '  %-16s %s\n' "AWS profile" "$profile"
else
  printf '  %-16s "%s" not configured (set AWS_PROFILE to yours)\n' "AWS profile" "$profile"
fi

exit $missing
