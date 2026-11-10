/** Versão do build desta tela (commit e hora), definida pelo Vite. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** DSN do Sentry/GlitchTip, no build. Vazio: nada é enviado e o SDK nem é baixado. */
  readonly VITE_SENTRY_DSN?: string;
}
