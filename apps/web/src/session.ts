import { useSyncExternalStore } from 'react';
import type { Ref } from '@budgets/contracts';

import { setReportedUser } from './observability.js';

/**
 * Login simulado, como na legada: o usuário escolhido fica no navegador e vai no cabeçalho
 * `x-user-id`. Não é dado do orçamento (esse fica no servidor): é só "quem está usando esta aba".
 */
const KEY = 'budgets.user';
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function currentUser(): Ref | null {
  const raw = read();
  return raw ? (JSON.parse(raw) as Ref) : null;
}

export function setUser(user: Ref | null): void {
  try {
    if (user) localStorage.setItem(KEY, JSON.stringify(user));
    else localStorage.removeItem(KEY);
  } catch {
    // navegador sem armazenamento: o login vale só até recarregar
  }
  for (const l of listeners) l();
  setReportedUser(user?.id ?? null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Trocou de usuário em outra aba: esta acompanha.
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** Usuário atual, reativo (o snapshot é a string, para comparar sem criar objeto a cada render). */
export function useUser(): Ref | null {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  return raw ? (JSON.parse(raw) as Ref) : null;
}
