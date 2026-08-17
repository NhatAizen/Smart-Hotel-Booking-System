import ErrorState from "../ui/ErrorState";

export default function ErrorMessage({
  message,
  onRetry,
  retryLabel = "Thử lại",
  className = "",
  ...props
}) {
  return (
    <ErrorState
      message={message}
      onRetry={onRetry}
      retryLabel={retryLabel}
      className={`admin-error ${className}`.trim()}
      compact
      {...props}
    />
  );
}
