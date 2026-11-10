# ADR 0009 · Observabilidade: logs, Sentry e Prometheus

**Status:** aceito

## Contexto

Na legada, um erro depois do deploy só aparecia quando o usuário reclamava, e lentidão em produção não tinha medida.

## Decisão

- **Logs** (pino) de uma linha por requisição, com o `request_id`, que volta na resposta e no corpo dos erros.
- **Sentry** (SDK oficial) na API, no worker e na tela, com o `request_id` e a versão do build. Localmente, **GlitchTip** (compatível), sem conta externa. Só 5xx e tarefas que esgotam as tentativas; 4xx é a API funcionando.
- **Prometheus** coletando a API e o worker (latência por rota pelo modelo da rota, cache, busca, fila, outbox, atraso da busca, processo), **11 regras de alerta** e um painel no **Grafana**.

## Alternativas

- **Só logs:** respondem “o que aconteceu nesta requisição”, não “o que está quebrando” nem “como está a latência ao longo do tempo”.
- **Instrumentação automática do SDK do Sentry:** exige carregar o SDK antes de tudo e traz rastreamento de desempenho, que não usamos.

## Consequências

- Um erro na tela e o erro do servidor que o causou chegam com o mesmo `request_id`.
- Os alertas pegaram, nos testes de queda, um problema real (o orçamento de retentativas curto demais).
- Três serviços a mais no perfil opcional `observabilidade`.
