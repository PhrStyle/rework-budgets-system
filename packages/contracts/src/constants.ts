// Valores fixos do domínio, sem dependências: usados pela API, pela tela e pelos schemas.

export const BUDGET_STATUSES = ['Rascunho', 'Enviado', 'Aprovado', 'Perdido'] as const;
export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

export const UNITS = ['un', 'm', 'l', 'kg'] as const;
export type Unit = (typeof UNITS)[number];
