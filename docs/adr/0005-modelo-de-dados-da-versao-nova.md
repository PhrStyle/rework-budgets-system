# ADR 0005 · Modelo de dados da versão nova

**Status:** aceito

## Contexto

Na legada, o banco guarda `decimal`, aceita qualquer valor que a API mandar e regrava o orçamento inteiro a cada salvamento. Os limites das regras (desconto de 0% a 100%, unidade inteira sem fração) só existem no código, em dois lugares (JavaScript e C#). A versão nova precisa listar milhares de orçamentos sem ler itens, salvar só o que mudou e editar grupos diferentes ao mesmo tempo.

## Decisão

- **Inteiros em todas as colunas de valor** ([ADR 0001](0001-dinheiro-em-inteiros.md)): `price_cents` e `quantity` (centésimos) em `int`; **totais e subtotais em `bigint`**. O maior orçamento dos dados passa de R$ 245 milhões, e 2³¹ centavos são só R$ 21 milhões.
- **Totais guardados** no item, no grupo (`subtotal_cents`) e no orçamento (`groups_total_cents`, `children_total_cents`, `total_cents`). A listagem e a mudança de prazo ou margem não leem itens. Eles são regravados na mesma transação de cada salvamento, e uma conferência recalcula tudo a partir dos itens e compara (`verifyTotals`).
- **`version` por grupo:** sobe a cada gravação daquele grupo. Um salvamento que partiu de uma versão antiga do grupo é recusado, sem bloquear os outros grupos do mesmo orçamento.
- **Ordem com folga** (`position` = 1024, 2048…): inserir acima ou abaixo grava uma linha, sem renumerar a lista.
- **Nome, unidade e preço copiados para o item:** mudar o catálogo não altera orçamentos já feitos.
- **Limites também no banco**, como `CHECK`: prazo, margem, desconto, unidade e “`un` sem fração”. O Prisma não modela `CHECK`; eles ficam na migration inicial.

## Alternativas

- **Calcular os totais sempre na leitura:** sem risco de divergência, mas abrir a lista somaria 426 mil itens; a conferência cobre o risco do total guardado.
- **`numeric` no Postgres:** exato, mas volta ao mundo do `decimal` e exige conversão no Node, que não tem tipo decimal nativo.
- **`version` por orçamento:** qualquer gravação em um grupo invalidaria a edição de outra pessoa em outro grupo (conflito falso).
- **Validar só na API:** um bug ou um script de manutenção gravaria valores impossíveis sem ninguém perceber.

## Consequências

- Valores impossíveis falham no banco com o nome da regra (`items_discount_check`), não silenciosamente.
- Toda gravação precisa atualizar os totais acima dela (item → grupo → orçamento → pai) na mesma transação.
- A carga em massa remove as FKs durante a transação e as recria no fim: validar 426 mil linhas de uma vez em vez de uma por uma levou a carga completa de ~21,7 s para ~5,1 s (medido localmente).
