import { useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { ConfirmationContext } from "./useConfirm";

export default function ConfirmationProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const pending = useRef(null);
  const service = useMemo(() => {
    function settle(accepted) {
      const current = pending.current;
      if (!current) return;
      pending.current = null;
      setDialog(null);
      current.resolve(accepted);
    }
    return {
      ask(owner, message, options) {
        // Ignore repeated clicks while a decision is already being requested.
        if (pending.current) return Promise.resolve(false);
        return new Promise((resolve) => {
          pending.current = { owner, resolve };
          setDialog({ message, ...options });
        });
      },
      cancel(owner) { if (pending.current?.owner === owner) settle(false); },
      settle,
    };
  }, []);
  useEffect(() => () => {
    pending.current?.resolve(false);
    pending.current = null;
  }, []);
  return (
    <ConfirmationContext.Provider value={service}>
      {children}
      <ConfirmDialog
        open={Boolean(dialog)}
        title={dialog?.title || "Xác nhận thao tác"}
        confirmLabel={dialog?.confirmLabel || "Xác nhận"}
        confirmTone={dialog?.confirmTone || "primary"}
        onConfirm={() => service.settle(true)}
        onCancel={() => service.settle(false)}
      >
        <p style={{ margin: 0, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{dialog?.message}</p>
      </ConfirmDialog>
    </ConfirmationContext.Provider>
  );
}
