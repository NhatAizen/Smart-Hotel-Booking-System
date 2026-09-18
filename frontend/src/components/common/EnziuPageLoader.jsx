import enziuLogo from "../../assets/enziu-logo.png";
import "./EnziuPageLoader.css";

export default function EnziuPageLoader({
  label = "Đang mở trang...",
  fullscreen = true,
  className = "",
}) {
  return (
    <div
      className={`enziu-page-loader ${fullscreen ? "enziu-page-loader--fullscreen" : "enziu-page-loader--inline"} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <span className="enziu-page-loader__visual" aria-hidden="true">
        <span className="enziu-page-loader__ring" />
        <span className="enziu-page-loader__logo-shell">
          <img className="enziu-page-loader__logo" src={enziuLogo} alt="" />
        </span>
      </span>
      <span className="enziu-page-loader__label">{label}</span>
    </div>
  );
}
