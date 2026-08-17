import { AlertTriangle } from "lucide-react";

import Button from "./Button";
import classNames from "./classNames";

export default function ErrorState({
  message,
  title,
  onRetry,
  retryLabel = "Thử lại",
  icon,
  compact = false,
  className = "",
  ...props
}) {
  if (!message && !title) return null;

  return (
    <div
      className={classNames("ui-error-state", compact && "ui-error-state--compact", className)}
      role="alert"
      {...props}
    >
      <span className="ui-error-state__icon" aria-hidden="true">
        {icon ?? <AlertTriangle size={20} />}
      </span>
      <div className="ui-error-state__copy">
        {title ? <strong>{title}</strong> : null}
        {message ? <span>{message}</span> : null}
      </div>
      {onRetry ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>{retryLabel}</Button>
      ) : null}
    </div>
  );
}
