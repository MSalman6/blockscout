#!/bin/sh
# Build and deploy the subgraph from inside the compose network, so graph-node's
# admin API and the IPFS API never need to be published to the host.
#   docker compose ... --profile deploy run --rm subgraph-deployer
set -eu

: "${GRAPH_NODE_ADMIN:=http://graph-node:8020}"
: "${GRAPH_IPFS:=http://ipfs:5001}"
: "${DMD_GRAPH_NETWORK:=dmd}"
: "${DMD_SUBGRAPH_NAME:=dmd-subgraph}"

if ! touch ./.write-test 2>/dev/null; then
  echo "ERROR: cannot write to the subgraph directory as uid $(id -u):$(id -g)." >&2
  echo >&2
  echo "  The directory is owned by $(stat -c '%u:%g' . 2>/dev/null || echo '?')." >&2
  echo "  Set HOST_UID / HOST_GID in .env.local to YOUR ids and re-run:" >&2
  echo "      id -u   # -> HOST_UID" >&2
  echo "      id -g   # -> HOST_GID" >&2
  echo >&2
  echo "  If the tree is owned by root (a previous run as root), reclaim it:" >&2
  echo "      sudo chown -R \$(id -u):\$(id -g) <path>/dmd-subgraph" >&2
  exit 1
fi
rm -f ./.write-test

echo "==> regenerating networks.json from environment"
sh ./scripts/gen-networks.sh

echo "==> installing dependencies"
npm install --no-audit --no-fund --silent

echo "==> codegen"
npm run codegen

echo "==> build (network: ${DMD_GRAPH_NETWORK})"
npx graph build --network "${DMD_GRAPH_NETWORK}"

echo "==> create subgraph (ignored if it already exists)"
npx graph create --node "${GRAPH_NODE_ADMIN}" "${DMD_SUBGRAPH_NAME}" || true

echo "==> deploy"
npx graph deploy \
  --node "${GRAPH_NODE_ADMIN}" \
  --ipfs "${GRAPH_IPFS}" \
  --network "${DMD_GRAPH_NETWORK}" \
  --version-label "$(date -u +%Y%m%d-%H%M%S)" \
  "${DMD_SUBGRAPH_NAME}"

echo "==> done"
