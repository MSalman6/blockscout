#!/bin/sh
# Build and deploy the subgraph from inside the compose network, so graph-node's
# admin API and the IPFS API never need to be published to the host.
#   docker compose ... --profile deploy run --rm subgraph-deployer
set -eu

: "${GRAPH_NODE_ADMIN:=http://graph-node:8020}"
: "${GRAPH_IPFS:=http://ipfs:5001}"
: "${DMD_GRAPH_NETWORK:=dmd}"
: "${DMD_SUBGRAPH_NAME:=dmd-subgraph}"

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
