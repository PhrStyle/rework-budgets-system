import { useEffect, useState } from 'react';

const EVERY_MS = 5 * 60 * 1000;

/** Pergunta qual versão está publicada. Sem cache: é justamente o que pode ter mudado. */
export async function publishedVersion(): Promise<string | null> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown };
    return typeof body.version === 'string' ? body.version : null;
  } catch {
    return null; // sem rede agora: tenta na próxima
  }
}

/**
 * `true` quando uma versão nova da tela foi publicada depois que esta aba abriu. Confere ao voltar
 * para a aba e a cada 5 minutos. Em desenvolvimento (Vite dev) não há `version.json`: nunca avisa.
 */
export function useNewVersion(current: string = __APP_VERSION__): boolean {
  const [outdated, setOutdated] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const published = await publishedVersion();
      if (!cancelled && published !== null && published !== current) setOutdated(true);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    void check();
    const timer = setInterval(() => void check(), EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [current]);
  return outdated;
}
