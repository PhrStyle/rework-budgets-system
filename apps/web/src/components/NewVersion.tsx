import { useNewVersion } from '../version.js';

/**
 * Aviso de versão nova, no lugar do Ctrl+F5 da legada. Recarregar é seguro: as alterações não
 * salvas estão no rascunho, no servidor, e voltam com a página.
 */
export function NewVersion() {
  const outdated = useNewVersion();
  if (!outdated) return null;
  return (
    <div className="info versao" role="status">
      Uma versão nova do sistema foi publicada. Suas alterações não salvas estão guardadas no
      rascunho.{' '}
      <button
        type="button"
        className="primary"
        onClick={() => {
          location.reload();
        }}
      >
        Recarregar
      </button>
    </div>
  );
}
