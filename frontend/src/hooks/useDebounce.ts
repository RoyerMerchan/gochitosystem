import { useEffect, useRef, useState } from 'react';

/** Devuelve el valor con retardo: evita disparar una consulta en cada tecla. */
export function useDebounce<T>(valor: T, retardoMs = 350): T {
  const [diferido, setDiferido] = useState<T>(valor);

  useEffect(() => {
    const id = window.setTimeout(() => setDiferido(valor), retardoMs);
    return () => window.clearTimeout(id);
  }, [valor, retardoMs]);

  return diferido;
}

/** Version en callback: util para handlers que no dependen de un estado. */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  retardoMs = 350,
): (...args: A) => void {
  const refFn = useRef(fn);
  const refTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    refFn.current = fn;
  }, [fn]);

  useEffect(() => () => window.clearTimeout(refTimer.current), []);

  return (...args: A) => {
    window.clearTimeout(refTimer.current);
    refTimer.current = window.setTimeout(() => refFn.current(...args), retardoMs);
  };
}
