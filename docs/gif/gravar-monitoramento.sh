#!/usr/bin/env bash
# Roteiro do GIF do monitoramento: grava o painel do Grafana enquanto 16 usuários usam a versão nova
# e, no meio, o Elasticsearch cai e volta. Precisa do ambiente "VPS" e da observabilidade no ar.
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p docs/gif/out
node docs/gif/gravar-grafana.mjs 165 > docs/gif/out/grafana.log 2>&1 &
GRAVADOR=$!
sleep 10
VUS=16 DURATION=140s bash bench/run.sh nova carga > docs/gif/out/k6.log 2>&1 &
sleep 65
docker stop budgets-elasticsearch-1 > /dev/null && echo "$(date +%T) elasticsearch desligado"
sleep 55
docker start budgets-elasticsearch-1 > /dev/null && echo "$(date +%T) elasticsearch religado"
wait $GRAVADOR
echo "gravado: docs/gif/out/grafana.webm e docs/gif/out/alertas.png"
