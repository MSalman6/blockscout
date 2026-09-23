#!/bin/sh
# Regenerates networks.json from the environment. graph-cli substitutes these
# addresses and start blocks into subgraph.yaml when built with --network,
# so contract addresses live in the env file, not in tracked YAML.
set -eu

: "${DMD_GRAPH_NETWORK:=dmd}"
for v in DMD_REGISTRY_ADDRESS DMD_REGISTRY_START_BLOCK \
         DMD_NAMES_ADDRESS DMD_NAMES_START_BLOCK \
         DMD_RESOLVER_ADDRESS DMD_RESOLVER_START_BLOCK \
         DMD_CONTROLLER_ADDRESS DMD_CONTROLLER_START_BLOCK; do
  eval "val=\${$v:-}"
  [ -n "$val" ] || { echo "error: $v is not set" >&2; exit 1; }
done

cat > networks.json <<JSON
{
  "${DMD_GRAPH_NETWORK}": {
    "DMDRegistry":            { "address": "${DMD_REGISTRY_ADDRESS}",   "startBlock": ${DMD_REGISTRY_START_BLOCK} },
    "DMDNames":               { "address": "${DMD_NAMES_ADDRESS}",      "startBlock": ${DMD_NAMES_START_BLOCK} },
    "DMDResolver":            { "address": "${DMD_RESOLVER_ADDRESS}",   "startBlock": ${DMD_RESOLVER_START_BLOCK} },
    "DMDRegistrarController": { "address": "${DMD_CONTROLLER_ADDRESS}", "startBlock": ${DMD_CONTROLLER_START_BLOCK} }
  }
}
JSON
echo "networks.json written for network '${DMD_GRAPH_NETWORK}'"
