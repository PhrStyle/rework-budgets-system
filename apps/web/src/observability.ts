import type * as SentryBrowser from './sentry.js';

import { ApiFailure } from './api/client.js';

/**
 * Rastreamento de erros na tela (Sentry, ou GlitchTip compatível). O SDK só é baixado se houver
 * DSN (`VITE_SENTRY_DSN` no build): sem ele, a tela não carrega nem um byte a mais. Cada erro leva a
 * versão do build (`__APP_VERSION__`), para responder "isso começou depois do deploy de quando?".
 */
const dsn: string | undefined = import.meta.env.VITE_SENTRY_DSN || undefined;
let sentry: Promise<typeof SentryBrowser> | null = null;

export function initObservability(): void {
  if (!dsn || sentry) return;
  sentry = import('./sentry.js').then((S) => {
    S.init({
      dsn,
      release: __APP_VERSION__,
      environment: import.meta.env.MODE,
      // Erros não capturados e promessas rejeitadas já vêm por padrão; nada de rastrear desempenho
      // nem gravar a sessão do usuário.
      tracesSampleRate: 0,
    });
    return S;
  });
}

/** Envia um erro, com o ID da requisição quando ele veio da API (liga ao log do servidor). */
export function report(error: unknown, extra: Record<string, string> = {}): void {
  void sentry?.then((S) => {
    S.withScope((scope) => {
      if (error instanceof ApiFailure) {
        scope.setTag('request_id', error.body.requestId);
        scope.setTag('status', String(error.status));
      }
      for (const [k, v] of Object.entries(extra)) scope.setTag(k, v);
      S.captureException(error);
    });
  });
}

/** Quem está usando (só o id, nada de nome ou e-mail). */
export function setReportedUser(id: number | null): void {
  void sentry?.then((S) => {
    S.setUser(id === null ? null : { id: String(id) });
  });
}

/** Erro que vale reportar: falha de rede ou 5xx. 4xx é a API respondendo, não um defeito. */
export const isReportable = (error: unknown): boolean =>
  !(error instanceof ApiFailure) || error.status >= 500;
