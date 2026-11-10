import { Component, useEffect } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { useRouteError } from 'react-router';

import { report } from '../observability.js';

/**
 * Se uma tela quebrar (erro no React), mostra o aviso e envia o erro, em vez de uma página em branco.
 * Recarregar é seguro: as alterações não salvas estão no rascunho, no servidor.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    report(error, {
      origem: 'react',
      componente: info.componentStack?.split('\n')[1]?.trim() ?? '',
    });
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <Failure />;
  }
}

/** Erro dentro de uma rota: o React Router o captura antes da barreira acima; aqui ele é enviado. */
export function RouteError() {
  const error = useRouteError();
  useEffect(() => {
    report(error, { origem: 'rota' });
  }, [error]);
  return <Failure />;
}

function Failure() {
  return (
    <main>
      <div className="aviso" role="alert">
        <h3>Algo deu errado nesta tela.</h3>
        <p>O erro foi registrado. Suas alterações não salvas estão guardadas no rascunho.</p>
        <p>
          <button
            type="button"
            className="primary"
            onClick={() => {
              location.reload();
            }}
          >
            Recarregar
          </button>
        </p>
      </div>
    </main>
  );
}
