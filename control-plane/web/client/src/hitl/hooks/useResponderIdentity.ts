import { useCallback, useState } from "react";

const KEY = "af.hitl.responder";

export function useResponderIdentity() {
  const [name, set] = useState<string>(() => localStorage.getItem(KEY) ?? "");

  const setName = useCallback((next: string) => {
    localStorage.setItem(KEY, next);
    set(next);
  }, []);

  return { name, setName };
}
