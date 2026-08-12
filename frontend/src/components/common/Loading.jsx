export default function Loading({ label = "Đang tải dữ liệu..." }) {
  return (
    <div className="admin-loading" role="status" aria-live="polite">
      <span className="admin-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
