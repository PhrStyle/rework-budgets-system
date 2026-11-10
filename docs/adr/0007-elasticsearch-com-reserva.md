# ADR 0007 · Elasticsearch na busca, com o Postgres de reserva

**Status:** aceito

## Contexto

A busca da legada é `LIKE '%termo%'`: sem o acento exato não acha nada, não tolera erro de digitação e não ordena por relevância. Nesta escala (3 mil orçamentos, 5 mil produtos), o `LIKE` é rápido; o problema é o que ele não acha.

## Decisão

- Listagem e autocomplete no **Elasticsearch**: analisador sem acentos e cedilha (`asciifolding`), tolerância a erro (`fuzziness`) e prefixos (*edge n-gram*) para o autocomplete.
- Índices com a data no nome atrás de um alias: reindexar troca o alias numa operação só, sem tirar a busca do ar.
- **Elasticsearch fora do ar: a API cai para o `ILIKE` do Postgres**, com aviso no log, métrica e alerta. A busca piora, a tela não quebra.

## Alternativas

- **`pg_trgm` + `unaccent` no Postgres:** busca por trecho e sem acento sem outro serviço; boa opção para sistemas menores. Escolhido o Elasticsearch pela relevância e pelo autocomplete por prefixo.
- **Sem reserva:** com o Elasticsearch fora, a listagem quebraria.

## Consequências

- Acha o que o `LIKE` não acha (“farmacia”: 0 → 182 resultados); a velocidade empata nesta escala.
- Mais um serviço para operar (memória, disco, reindexação).
