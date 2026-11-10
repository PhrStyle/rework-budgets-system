import { useEffect, useRef, useState } from 'react';

/** O valor só muda depois de `ms` sem alterações (busca enquanto digita, sem uma requisição por tecla). */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [value, ms]);
  return debounced;
}

/** Chama `onVisible` quando o elemento aparece na tela (carregar a próxima página ao rolar). */
export function useOnVisible<T extends Element>(onVisible: () => void, enabled: boolean) {
  const ref = useRef<T>(null);
  const callback = useRef(onVisible);
  useEffect(() => {
    callback.current = onVisible;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    // Margem de 600 px: a próxima página começa a vir antes de o usuário chegar ao fim da lista.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) callback.current();
      },
      { rootMargin: '0px 0px 600px 0px' },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [enabled]);
  return ref;
}
