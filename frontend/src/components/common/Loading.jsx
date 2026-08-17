import LoadingState from "../ui/LoadingState";

export default function Loading({
  label = "Đang tải dữ liệu...",
  message,
  className = "",
  ...props
}) {
  return (
    <LoadingState
      message={message ?? label}
      className={`admin-loading ${className}`.trim()}
      spinnerClassName="admin-spinner"
      {...props}
    />
  );
}
