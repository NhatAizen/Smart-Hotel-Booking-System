import { AlertTriangle } from "lucide-react";

import Button from "./Button";
import classNames from "./classNames";
import { humanizeUserMessage } from "../../utils/userFacingText";

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

  const displayMessage = message ? humanizeUserMessage(message) : "";

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
        {displayMessage ? <span>{displayMessage}</span> : null}
      </div>
      {onRetry ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>{retryLabel}</Button>
      ) : null}
    </div>
  );
}
