import * as Sentry from '@sentry/node';

export const ERROR_REPORTER = Symbol('ERROR_REPORTER');

export interface ErrorContext {
  /** O mesmo ID dos logs e da resposta de erro: liga o aviso no Sentry à linha de log. */
  requestId?: string;
  userId?: number;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

/** Para onde vão os erros inesperados. Sem DSN, para lugar nenhum (desenvolvimento, testes). */
export interface ErrorReporter {
  capture(error: unknown, context?: ErrorContext): void;
  message(text: string, context?: ErrorContext): void;
  flush(): Promise<void>;
}

export const noopReporter: ErrorReporter = {
  capture: () => undefined,
  message: () => undefined,
  flush: () => Promise.resolve(),
};

/**
 * Sentry (ou GlitchTip, compatível). Só a captura de erros, sem a instrumentação automática do SDK
 * (que exige carregar o Sentry antes de tudo, com `--import`, e traria rastreamento de desempenho
 * que não usamos). Sem dados pessoais: o usuário vai só pelo id.
 */
export function createReporter(options: {
  dsn: string | undefined;
  release: string;
  environment: string;
  service: string;
}): ErrorReporter {
  if (!options.dsn) return noopReporter;
  Sentry.init({
    dsn: options.dsn,
    release: options.release,
    environment: options.environment,
    // Nada de dado pessoal automático (cookies, cabeçalhos, corpos): o usuário vai só pelo id.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    defaultIntegrations: false,
    integrations: [
      Sentry.linkedErrorsIntegration(),
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
    ],
    initialScope: { tags: { service: options.service } },
  });

  const withContext = (context: ErrorContext, send: () => void) => {
    Sentry.withScope((scope) => {
      if (context.requestId) scope.setTag('request_id', context.requestId);
      if (context.userId !== undefined) scope.setUser({ id: String(context.userId) });
      for (const [k, v] of Object.entries(context.tags ?? {})) scope.setTag(k, v);
      if (context.extra) scope.setExtras(context.extra);
      send();
    });
  };

  return {
    capture: (error, context = {}) => {
      withContext(context, () => Sentry.captureException(error));
    },
    message: (text, context = {}) => {
      withContext(context, () => Sentry.captureMessage(text, 'warning'));
    },
    flush: async () => {
      await Sentry.flush(2_000);
    },
  };
}
