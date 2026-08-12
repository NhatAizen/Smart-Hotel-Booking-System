import { AlertTriangle } from "lucide-react";

export default function ErrorMessage({ message, onRetry }) {
  if (!message) {
    return null;
  }

  return (
    <div className="admin-error" role="alert">
      <AlertTriangle size={20} />
      <span>{message}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry}>
          Thử lại
        </button>
      ) : null}
    </div>
  );
}
