# ADR 0006 · Busca atualizada por outbox e fila (BullMQ)

**Status:** aceito

## Contexto

A busca (Elasticsearch) é uma cópia derivada do Postgres. Salvar grava no Postgres, e a busca precisa saber. São dois sistemas sem transação em comum: avisar antes do commit pode anunciar uma mudança que não aconteceu; avisar depois pode se perder se o processo cair entre os dois passos.

## Decisão

- O salvar grava um aviso numa tabela `outbox` **na mesma transação** da mudança.
- Um relay (`FOR UPDATE SKIP LOCKED`) leva os avisos para uma fila **BullMQ** no `redis-data`, com `jobId` igual ao id da linha: publicar de novo não duplica. A numeração do outbox nunca é reiniciada (é a chave anti-repetição).
- Um **worker separado da API** lê o orçamento como está agora e indexa com **versão externa** (a hora da última gravação): uma tarefa atrasada não sobrescreve um dado mais novo. Até 12 tentativas com espera crescente (~68 min).

## Alternativas

- **Indexar na própria requisição:** acopla o tempo e a disponibilidade do salvar ao Elasticsearch.
- **Avisar a fila depois do commit, sem outbox:** perde o aviso numa queda entre os dois passos.
- **Fila no próprio Postgres** (o BullMQ 6 tem esse backend): dispensaria o outbox; não avaliada, a fila ficou no Redis como planejado.

## Consequências

- Nenhuma alteração salva fica fora da busca; o pior caso é indexar duas vezes, o que é inofensivo.
- A busca é eventual: ~0,3 s de mediana do salvar até refletir (medido).
- Um processo a mais para operar (o worker), com métricas e alertas próprios.
