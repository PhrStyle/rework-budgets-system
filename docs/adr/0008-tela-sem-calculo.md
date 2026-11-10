# ADR 0008 · A tela não calcula e não faz atualização otimista

**Status:** aceito

## Contexto

Na legada, o navegador calculava uma prévia em float para responder na hora, e o servidor recalculava em decimal ao salvar. A prévia e o salvo divergiam (R$ 0,13 no pior caso, em 3 edições).

## Decisão

- A tela (React) **não calcula**: cada edição vira uma operação no rascunho, e a tela mostra os totais que a API devolveu, calculados pelo mesmo `budget-calc` do salvar.
- **Sem atualização otimista:** a tela espera a resposta antes de mostrar o total novo.
- Respostas fora de ordem são resolvidas pelo contador de alterações do rascunho.

## Alternativas

- **Otimista com o cálculo compartilhado:** possível, porque o cálculo é inteiro e determinístico; mas recriaria uma prévia que pode divergir quando o servidor discorda (limites, conflitos).

## Consequências

- A tela e o banco mostram sempre o mesmo total (conferido no navegador, Playwright).
- Cada edição custa uma ida ao servidor: ~157 ms com a rede da VPS emulada.
