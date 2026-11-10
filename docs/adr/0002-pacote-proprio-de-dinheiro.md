# ADR 0002 · Pacote próprio de dinheiro, em vez de uma biblioteca pronta

**Status:** aceito

## Contexto

A [ADR 0001](0001-dinheiro-em-inteiros.md) define as regras: inteiros, pontos-base, quantidade com escala por unidade e arredondamento comercial por divisão. Faltava decidir se essas regras seriam implementadas sobre uma biblioteca existente ou num pacote do próprio projeto (`packages/money`).

## Decisão

Pacote próprio, pequeno (cerca de 200 linhas), sem dependências, compartilhado pela API e pelo front, com testes de propriedade contra aritmética exata (`BigInt`).

## Alternativas

- **Dinero.js:** resolve dinheiro em unidades inteiras com escala e moeda, mas pontos-base, quantidade fracionária por unidade, a regra de uma divisão por item e o parse/formatação em pt-BR teriam que ser escritos em volta dela. Seria uma dependência a mais sem eliminar o código específico.
- **decimal.js / big.js:** precisão decimal arbitrária, mas trazem de volta o modelo decimal que a ADR 0001 descartou.
- **currency.js:** usa `number` com arredondamento interno em float; não garante o resultado exato que a regra exige.

## Consequências

Facilita o desenvolvimento porque:
- **Uma porta só para dinheiro:** API, front e testes chamam as mesmas funções (`itemTotal`, `applyRate`, `parseMoney`, `formatBRL`); não há regra de cálculo espalhada.
- **Erros aparecem cedo:** tipos marcados pegam troca de argumentos na compilação, e entrada inválida vira `ParseError` com mensagem pronta para a tela.
- **Testável isolado:** funções puras, sem banco nem DOM; os testes rodam em milissegundos e cobrem o que no sistema antigo não tinha teste.
- **Sem surpresas de terceiros:** nenhuma atualização de biblioteca muda um arredondamento.

Em troca, o projeto é responsável pela correção da matemática. Por isso os testes comparam cada operação com o cálculo exato em `BigInt` em milhares de casos gerados (fast-check), e a cobertura do pacote é de 100% das linhas.
