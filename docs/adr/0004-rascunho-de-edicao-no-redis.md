# ADR 0004 · Rascunho de edição no Redis, com salvar explícito

**Status:** aceito

## Contexto

Um orçamento é uma cotação: o usuário simula valores, e só parte deles deve virar oficial. O sistema antigo passou por uma cadeia de paliativos:

1. salvava a cada alteração, enviando o orçamento inteiro, o que ficou lento demais;
2. passou a editar em sessão (página + `localStorage`), com cálculo em JavaScript e lazy loading;
3. com isso, fechar o navegador ou uma queda de energia perdia o progresso;
4. entrou um salvamento automático a cada 5 minutos, que gravava simulações que o usuário não queria salvar.

## Decisão

- Ao abrir um orçamento para edição, a API cria um **rascunho** do usuário no Redis. Toda edição vai **só para o rascunho**; os totais são recalculados por delta ([ADR 0003](0003-arredondamento-a-cada-passo.md)).
- Nada vai para o Postgres até o clique em **“Salvar alterações”**, que grava numa transação **apenas o que mudou** (o *changeset*) e apaga o rascunho. **“Descartar”** apaga o rascunho sem gravar. Não há salvamento automático.
- O rascunho fica no servidor: sobrevive a navegador fechado, F5 e queda de energia, e **várias abas do mesmo usuário editam o mesmo rascunho**.
- **O rascunho segura o bloqueio de edição:** enquanto ele existir, outros usuários só visualizam. Rascunho e bloqueio têm o **mesmo TTL de 30 minutos**, renovado junto a cada edição. É uma rede de segurança curta para imprevistos, não um lugar para guardar trabalho por dias.
- Rascunhos ficam no **`redis-data`** (`noeviction` + AOF), com as filas, e não no `redis-cache`: não são reconstruíveis a partir do Postgres, então não podem ser despejados nem perdidos num reinício.

## Alternativas

- **Salvar a cada alteração (como no início do sistema antigo):** grava simulações e, sem `PATCH`, era lento. Com `PATCH` seria rápido, mas continuaria gravando o que o usuário não decidiu salvar.
- **Rascunho no navegador (`localStorage`):** por aba e por máquina; perde-se com a limpeza do navegador e não é compartilhado entre abas.
- **Salvamento automático periódico:** grava estados intermediários que ninguém escolheu gravar.
- **Rascunho que dura dias:** um rascunho esquecido manteria o orçamento bloqueado; 30 minutos cobre o imprevisto sem travar o trabalho dos outros.

## Consequências

- Simular é livre: só o “Salvar” torna a mudança oficial.
- Uma queda é recuperável por até 30 minutos; ao voltar, a tela avisa que há alterações não salvas.
- O `redis-data` passa a guardar trabalho do usuário: AOF e `noeviction` são obrigatórios, e a memória dele precisa ser monitorada.
- O salvamento é proporcional ao que mudou, não ao tamanho do orçamento.
