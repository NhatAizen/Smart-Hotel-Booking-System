import classNames from "./classNames";

export default function FilterBar({
  children,
  actions,
  resultCount,
  resultLabel = "kết quả",
  summary,
  ariaLabel = "Bộ lọc",
  className = "",
  ...props
}) {
  return (
    <section
      className={classNames("ui-filter-bar", className)}
      aria-label={ariaLabel}
      {...props}
    >
      <div className="ui-filter-bar__controls">{children}</div>
      {summary || resultCount !== undefined || actions ? (
        <div className="ui-filter-bar__end">
          {summary ? <span className="ui-filter-bar__summary">{summary}</span> : null}
          {resultCount !== undefined ? (
            <span className="ui-filter-bar__count" aria-live="polite">
              <strong>{resultCount}</strong> {resultLabel}
            </span>
          ) : null}
          {actions ? <div className="ui-filter-bar__actions">{actions}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
