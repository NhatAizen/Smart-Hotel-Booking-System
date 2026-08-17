import classNames from "./classNames";

export default function PageHeader({
  as: HeaderTag = "header",
  titleAs: HeadingTag = "h1",
  eyebrow,
  title,
  description,
  icon,
  meta,
  actions,
  className = "",
  children,
  ...props
}) {
  return (
    <HeaderTag className={classNames("ui-page-header", className)} {...props}>
      <div className="ui-page-header__main">
        {icon ? <span className="ui-page-header__icon" aria-hidden="true">{icon}</span> : null}
        <div className="ui-page-header__copy">
          {eyebrow ? <span className="ui-page-header__eyebrow">{eyebrow}</span> : null}
          <HeadingTag className="ui-page-header__title">{title}</HeadingTag>
          {description ? <p className="ui-page-header__description">{description}</p> : null}
          {meta ? <div className="ui-page-header__meta">{meta}</div> : null}
          {children}
        </div>
      </div>
      {actions ? <div className="ui-page-header__actions">{actions}</div> : null}
    </HeaderTag>
  );
}
