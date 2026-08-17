import { getStatusMeta } from "../../utils/presentation";
import classNames from "./classNames";

export default function StatusBadge({
  status,
  label,
  tone,
  icon,
  dot = true,
  size = "md",
  className = "",
  ...props
}) {
  const meta = getStatusMeta(status);
  const displayLabel = label ?? meta.label;
  const displayTone = tone ?? meta.tone;

  if (!displayLabel) return null;

  return (
    <span
      className={classNames(
        "ui-badge",
        `ui-badge--${displayTone}`,
        `ui-badge--${size}`,
        className,
      )}
      {...props}
    >
      {icon ? <span className="ui-badge__icon" aria-hidden="true">{icon}</span> : null}
      {!icon && dot ? <span className="ui-badge__dot" aria-hidden="true" /> : null}
      <span>{displayLabel}</span>
    </span>
  );
}
