# ADR 0001 · Dinheiro em inteiros, com arredondamento comercial

**Status:** aceito

## Contexto

No sistema antigo, o navegador calculava em `float` (JavaScript) e o servidor em `decimal` (C#), e os valores divergiam em centavos. O paliativo foi arredondar sempre para cima em todo cálculo, o que ainda falhava em float (`1.1 * 100 = 110.00000000000001` → 111) e enviesava os totais.

## Decisão

- **Dinheiro em centavos inteiros** (`Cents`), **percentuais em pontos-base** (`Bp`, 7,5% = 750) e **quantidades em centésimos da unidade** (`Qty`, 2,5 m = 250). Nenhum float em nenhuma etapa.
- **Arredondamento comercial** (meio para cima), só onde há divisão: aplicar desconto, prazo e margem. Uma divisão por operação; o item é `preço × qtd × (10000 − desconto) / 1.000.000`.
- **Representação em `number`**, com `BigInt` só no produto intermediário (`mulDivRoundHalfUp`).
- **Tipos marcados:** `Cents`, `Bp` e `Qty` são `number` em tempo de execução, mas o compilador não deixa trocar um pelo outro.
- Texto é convertido em inteiro por manipulação de string, sem `parseFloat`, e entrada ambígua é recusada com mensagem.

## Alternativas

- **`decimal` (decimal.js, big.js):** exato, mas mantém duas noções de número entre front e back. Com inteiros, a conta é a mesma nos dois lados.
- **`bigint` em tudo:** não serializa em JSON (`JSON.stringify` lança erro), exigiria conversão para texto na API, no Redis e no front, e não se mistura com `number` (`1n + 1` lança erro). O limite de `number` (2^53 centavos ≈ R$ 90 trilhões) não é atingido por nenhum valor final; só o produto intermediário pode passar, e ele já usa `BigInt`.
- **`number` sem marca:** `750` poderia ser R$ 7,50, 7,5% ou 7,5 unidades. A marca transforma essa confusão em erro de compilação.
- **Manter o “sempre para cima”:** era um paliativo para a divergência float × decimal; sem divergência, não há o que compensar.

## Consequências

- Front e back calculam exatamente igual; a divergência tela × banco deixa de existir.
- O erro máximo é de meio centavo por divisão, sempre pela mesma regra.
- Os totais mudam alguns centavos em relação ao sistema antigo (sem o viés para cima); precisa ser comunicado ao cliente.
- Toda entrada e saída de dinheiro passa pelas funções do pacote: é preciso disciplina para não fazer conta “na mão”.
