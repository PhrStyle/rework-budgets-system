# ADR 0003 · Arredondar a cada passo do cálculo

**Status:** aceito

## Contexto

Com inteiros ([ADR 0001](0001-dinheiro-em-inteiros.md)), soma e multiplicação são exatas, mas aplicar um percentual é uma divisão e pode gerar fração de centavo (R$ 10,01 com +5% = 1051,05 centavos). Era preciso decidir **onde** arredondar no caminho `itens → grupos → (grupos + filhos) → prazo → margem`.

## Decisão

Arredondar (comercial, meio para cima) **em cada passo que divide**: no total de cada item, depois de aplicar o prazo e depois de aplicar a margem. Os valores exibidos de prazo e de margem são as diferenças entre passos já arredondados.

## Alternativas

- **Uma única divisão para prazo e margem** (`subtotal × (1 + prazo) × (1 + margem)` de uma vez): erro máximo menor (meio centavo em vez de um), mas a linha da margem deixa de ser “margem % sobre o subtotal com prazo” e passa a ser um ajuste para fechar o total.
- **Arredondar só o total do orçamento:** os itens e subtotais precisariam ser guardados com mais precisão (`bigint` e `NUMERIC`), e as linhas exibidas, arredondadas só para a tela, deixariam de somar o total.

## Consequências

- Cada número exibido é um valor real, e **as linhas sempre somam o total**: qualquer pessoa reproduz a conta linha por linha na calculadora.
- O total pode diferir do valor matematicamente exato em até cerca de 1 centavo por passo; a diferença é pequena, determinística e igual em qualquer lugar que use `packages/budget-calc`.
