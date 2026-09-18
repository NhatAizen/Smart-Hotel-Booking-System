import classNames from "./classNames";

export default function EmptyState({
  icon,
  title = "Chưa có thông tin",
  description,
  actions,
  compact = false,
  className = "",
  ...props
}) {
  return (
    <div
      className={classNames("ui-empty-state", compact && "ui-empty-state--compact", className)}
      {...props}
    >
      {icon ? <span className="ui-empty-state__icon" aria-hidden="true">{icon}</span> : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {actions ? <div className="ui-empty-state__actions">{actions}</div> : null}
    </div>
  );
}
