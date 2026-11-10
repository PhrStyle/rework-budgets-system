-- Um banco por versão: os mesmos dados, cada um no modelo da sua versão
-- (decimal e coluna "aberto" na legada; inteiros e versão por grupo na nova).
CREATE DATABASE budgets_legacy;
CREATE DATABASE budgets_v2;
-- Rastreamento de erros (GlitchTip, perfil opcional "observabilidade").
CREATE DATABASE glitchtip;
