#!/usr/bin/env bash
# Rede entre o usuário e a VPS, no Toxiproxy. SUPOSIÇÕES (não medidas no sistema real):
#   - 150 ms de ida e volta Brasil ↔ US Central (75 ms em cada sentido, ±10 ms);
#   - 50 Mbit/s de download e 10 Mbit/s de upload do lado do usuário.
# O usuário entra por aqui:  legada → toxiproxy:15081 (front Razor)   nova → toxiproxy:18080 (nginx)
set -euo pipefail
T=http://127.0.0.1:8474
curl -sf -X POST $T/reset >/dev/null
for p in "legada 15081 legacy-web:5081" "nova 18080 web:8088"; do
  set -- $p
  curl -sf -X DELETE "$T/proxies/$1" >/dev/null 2>&1 || true
  curl -sf -X POST $T/proxies -d "{\"name\":\"$1\",\"listen\":\"0.0.0.0:$2\",\"upstream\":\"$3\"}" >/dev/null
  t="$T/proxies/$1/toxics"
  curl -sf -X POST $t -d '{"name":"ida","type":"latency","stream":"upstream","attributes":{"latency":75,"jitter":10}}' >/dev/null
  curl -sf -X POST $t -d '{"name":"volta","type":"latency","stream":"downstream","attributes":{"latency":75,"jitter":10}}' >/dev/null
  curl -sf -X POST $t -d '{"name":"upload","type":"bandwidth","stream":"upstream","attributes":{"rate":1250}}' >/dev/null
  curl -sf -X POST $t -d '{"name":"download","type":"bandwidth","stream":"downstream","attributes":{"rate":6250}}' >/dev/null
  echo "$1: toxiproxy:$2 → $3 (150 ms ida e volta, 10/50 Mbit/s)"
done
