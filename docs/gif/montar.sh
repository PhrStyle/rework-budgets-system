#!/usr/bin/env bash
# Junta os vídeos de gravar-comparativo.mjs lado a lado, com o nome de cada versão, num GIF.
set -euo pipefail
cd "$(dirname "$0")"
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
L=$(dur out/legada.webm); N=$(dur out/nova.webm)
MAX=$(python3 -c "print(max($L, $N))")
# O mais curto fica parado no último quadro até o outro terminar.
pad() { python3 -c "print(round($MAX - $1 + 0.05, 2))"; }
label() { echo "drawbox=x=0:y=0:w=iw:h=52:color=$2@0.92:t=fill,drawtext=fontfile=$FONT:text='$1':fontcolor=white:fontsize=24:x=20:y=13"; }

ffmpeg -v error -y -i out/legada.webm -i out/nova.webm -filter_complex "\
[0]tpad=stop_mode=clone:stop_duration=$(pad "$L"),$(label 'LEGADA · Razor + jQuery · salva o orçamento inteiro' 0x7c2d12)[a];\
[1]tpad=stop_mode=clone:stop_duration=$(pad "$N"),$(label 'NOVA · React + API · salva só o que mudou' 0x312e81)[b];\
[a][b]hstack=inputs=2,fps=10,scale=1600:-1:flags=lanczos,split[s0][s1];\
[s0]palettegen=max_colors=160:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  ../img/comparativo-legada-nova.gif
ls -la ../img/comparativo-legada-nova.gif

# Painel do Grafana (gravar-monitoramento.sh): acelerado 6x, com um rótulo.
if [ -f out/grafana.webm ]; then
  ffmpeg -v error -y -i out/grafana.webm -filter_complex "\
setpts=PTS/6,crop=iw:1095:0:0,fps=5,scale=1100:-1:flags=lanczos,\
drawbox=x=0:y=ih-44:w=iw:h=44:color=0x111827@0.92:t=fill,\
drawtext=fontfile=$FONT:text='Prometheus + Grafana · 16 usuários no ambiente VPS · o Elasticsearch cai e volta no meio · 6x':fontcolor=white:fontsize=16:x=14:y=h-30,\
split[s0][s1];[s0]palettegen=max_colors=64:stats_mode=diff[p];[s1][p]paletteuse=dither=none:diff_mode=rectangle" \
    ../img/monitoramento-grafana.gif
  ls -la ../img/monitoramento-grafana.gif
fi
if [ -f out/alertas.png ]; then
  # Só o topo da página de alertas, onde está o alerta disparado.
  ffmpeg -v error -y -i out/alertas.png -vf "crop=iw:min(ih\,900):0:0" ../img/alertas-prometheus.png
  ls -la ../img/alertas-prometheus.png
fi
