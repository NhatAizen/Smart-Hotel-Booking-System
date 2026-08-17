import Button from "./Button";
import Modal from "./Modal";

export default function ConfirmDialog({
  open,
  title = "Xác nhận thao tác",
  description,
  children,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  confirmTone = "danger",
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onCancel}
      title={title}
      description={description}
      size="sm"
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      hideCloseButton={busy}
      footer={(
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmTone}
            onClick={onConfirm}
            loading={busy}
            loadingLabel="Đang xử lý..."
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </>
      )}
    >
      {children}
    </Modal>
  );
}
