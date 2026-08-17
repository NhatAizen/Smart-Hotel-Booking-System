import { ChevronLeft, ChevronRight } from "lucide-react";

import classNames from "./classNames";

function paginationItems(currentPage, totalPages, siblingCount) {
  const visible = new Set([1, totalPages]);
  for (let page = currentPage - siblingCount; page <= currentPage + siblingCount; page += 1) {
    if (page >= 1 && page <= totalPages) visible.add(page);
  }

  const pages = [...visible].sort((first, second) => first - second);
  const result = [];
  pages.forEach((page, index) => {
    const previous = pages[index - 1];
    if (previous && page - previous > 1) result.push(`ellipsis-${previous}-${page}`);
    result.push(page);
  });
  return result;
}

export default function Pagination({
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  siblingCount = 1,
  disabled = false,
  ariaLabel = "Phân trang",
  className = "",
  alwaysShow = false,
}) {
  const safeTotal = Math.max(1, Number(totalPages) || 1);
  const safeCurrent = Math.min(safeTotal, Math.max(1, Number(currentPage) || 1));
  if (!alwaysShow && safeTotal <= 1) return null;

  const items = paginationItems(safeCurrent, safeTotal, Math.max(0, siblingCount));
  const goTo = (page) => {
    if (!disabled && page !== safeCurrent && page >= 1 && page <= safeTotal) {
      onPageChange?.(page);
    }
  };

  return (
    <nav className={classNames("ui-pagination", className)} aria-label={ariaLabel}>
      <button
        type="button"
        className="ui-pagination__button ui-pagination__button--nav"
        onClick={() => goTo(safeCurrent - 1)}
        disabled={disabled || safeCurrent === 1}
        aria-label="Trang trước"
      >
        <ChevronLeft size={18} aria-hidden="true" />
      </button>

      {items.map((item) => (
        typeof item === "number" ? (
          <button
            type="button"
            className={classNames("ui-pagination__button", item === safeCurrent && "is-active")}
            onClick={() => goTo(item)}
            aria-current={item === safeCurrent ? "page" : undefined}
            aria-label={`Trang ${item}`}
            disabled={disabled}
            key={item}
          >
            {item}
          </button>
        ) : (
          <span className="ui-pagination__ellipsis" aria-hidden="true" key={item}>…</span>
        )
      ))}

      <button
        type="button"
        className="ui-pagination__button ui-pagination__button--nav"
        onClick={() => goTo(safeCurrent + 1)}
        disabled={disabled || safeCurrent === safeTotal}
        aria-label="Trang sau"
      >
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </nav>
  );
}
