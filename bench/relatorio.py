"""Compara os resumos do k6 das duas versões: bench/results/{legada,nova}-<modo>.json."""
import json
import sys

modo = sys.argv[1] if len(sys.argv) > 1 else 'usuario'
L = json.load(open(f'bench/results/legada-{modo}.json'))['metrics']
N = json.load(open(f'bench/results/nova-{modo}.json'))['metrics']
print(f"verificações ok: legada {L['checks']['values']['rate']:.0%} · nova {N['checks']['values']['rate']:.0%}")
print(f"{'ação':14} {'legada med':>10} {'p95':>6} {'n':>4} | {'nova med':>8} {'p95':>6} {'n':>4} | {'vezes':>5}")
for op in ['abrir', 'grupo', 'editar', 'salvar', 'margem', 'busca', 'autocomplete']:
    l, n = L['op_' + op]['values'], N['op_' + op]['values']
    x = f"{l['med'] / n['med']:.1f}" if n['med'] and l['med'] else '—'
    print(f"{op:14} {l['med']:8.0f}ms {l['p(95)']:6.0f} {l['count']:4.0f} | {n['med']:6.0f}ms {n['p(95)']:6.0f} {n['count']:4.0f} | {x:>5}")
for k in ['bytes_enviados_salvar', 'bytes_enviados_margem', 'bytes_recebidos_abrir', 'bytes_recebidos_salvar']:
    print(f"{k:24} legada {L[k]['values']['med']:9.0f} B · nova {N[k]['values']['med']:6.0f} B")
for name, m in (('legada', L), ('nova', N)):
    it = m.get('iterations', {}).get('values', {})
    req = m.get('http_reqs', {}).get('values', {})
    print(f"{name}: {it.get('count', 0):.0f} rodadas ({it.get('rate', 0):.2f}/s), {req.get('count', 0):.0f} requisições, falhas {m['http_req_failed']['values']['rate']:.1%}")
