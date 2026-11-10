#!/usr/bin/env bash
# Roda o k6 dentro da rede do compose, contra o Toxiproxy (sem o encaminhamento de portas do Docker).
# `--user 0:0`: no Docker rootless, o root do container é o seu usuário (e grava em bench/results).
#   bash bench/run.sh legada|nova [usuario|carga]   (VUS, DURATION, ITERATIONS, THINK por variável)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p bench/results
docker run --rm --network budgets_default --user 0:0 \
  -v "$PWD/bench/k6:/scripts:ro" -v "$PWD/bench/results:/results" \
  -e MODE="${2:-usuario}" -e VUS="${VUS:-16}" -e DURATION="${DURATION:-90s}" \
  -e ITERATIONS="${ITERATIONS:-10}" -e THINK="${THINK:-0.5}" -e OUT="${OUT:-}" \
  grafana/k6:1.4.2 run --quiet "/scripts/$1.js"
