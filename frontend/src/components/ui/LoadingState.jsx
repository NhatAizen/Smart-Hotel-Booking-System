import classNames from "./classNames";

export default function LoadingState({
  message = "Đang tải...",
  label,
  inline = false,
  className = "",
  spinnerClassName = "",
  ...props
}) {
  const displayMessage = label ?? message;

  return (
    <div
      className={classNames("ui-loading-state", inline && "ui-loading-state--inline", className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      {...props}
    >
      <span className={classNames("ui-loading-state__spinner", spinnerClassName)} aria-hidden="true" />
      <span>{displayMessage}</span>
    </div>
  );
}
