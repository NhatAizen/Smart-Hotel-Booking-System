import classNames from "./classNames";

export default function StatCard({
  label,
  value,
  icon,
  hint,
  trend,
  tone = "default",
  loading = false,
  className = "",
  ...props
}) {
  const trendContent = typeof trend === "object" && trend !== null
    ? trend.label
    : trend;
  const trendTone = typeof trend === "object" && trend !== null
    ? trend.tone
    : "neutral";

  return (
    <article
      className={classNames("ui-stat-card", `ui-stat-card--${tone}`, className)}
      aria-busy={loading || undefined}
      {...props}
    >
      <div className="ui-stat-card__topline">
        <span className="ui-stat-card__label">{label}</span>
        {icon ? <span className="ui-stat-card__icon" aria-hidden="true">{icon}</span> : null}
      </div>
      {loading ? (
        <span className="ui-stat-card__skeleton" aria-label="Đang tải số liệu" />
      ) : (
        <strong className="ui-stat-card__value">{value ?? "—"}</strong>
      )}
      {hint || trendContent ? (
        <div className="ui-stat-card__footer">
          {trendContent ? (
            <span className={classNames("ui-stat-card__trend", `ui-stat-card__trend--${trendTone}`)}>
              {trendContent}
            </span>
          ) : null}
          {hint ? <span className="ui-stat-card__hint">{hint}</span> : null}
        </div>
      ) : null}
    </article>
  );
}
