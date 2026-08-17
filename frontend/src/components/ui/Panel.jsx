import classNames from "./classNames";

export default function Panel({
  as: PanelTag = "section",
  title,
  description,
  icon,
  actions,
  footer,
  children,
  padding = "md",
  className = "",
  bodyClassName = "",
  ...props
}) {
  const hasHeader = title || description || icon || actions;

  return (
    <PanelTag className={classNames("ui-panel", `ui-panel--padding-${padding}`, className)} {...props}>
      {hasHeader ? (
        <header className="ui-panel__header">
          <div className="ui-panel__heading">
            {icon ? <span className="ui-panel__icon" aria-hidden="true">{icon}</span> : null}
            <div>
              {title ? <h2 className="ui-panel__title">{title}</h2> : null}
              {description ? <p className="ui-panel__description">{description}</p> : null}
            </div>
          </div>
          {actions ? <div className="ui-panel__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className={classNames("ui-panel__body", bodyClassName)}>{children}</div>
      {footer ? <footer className="ui-panel__footer">{footer}</footer> : null}
    </PanelTag>
  );
}
