import EnziuPageLoader from "./EnziuPageLoader";

export default function Loading({
  label = "Đang tải...",
  message,
  className = "",
  ...props
}) {
  return (
    <EnziuPageLoader
      label={message ?? label}
      fullscreen={false}
      className={className}
      {...props}
    />
  );
}
