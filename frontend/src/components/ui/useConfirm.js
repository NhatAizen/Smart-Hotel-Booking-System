import { createContext, useCallback, useContext, useEffect, useRef } from "react";

export const ConfirmationContext = createContext(null);

export default function useConfirm() {
  const service = useContext(ConfirmationContext);
  const owner = useRef(Symbol("confirmation-owner"));
  if (!service) throw new Error("ConfirmationProvider is required");
  useEffect(() => {
    const token = owner.current;
    return () => service.cancel(token);
  }, [service]);
  return useCallback((message, options = {}) => service.ask(owner.current, message, options), [service]);
}
