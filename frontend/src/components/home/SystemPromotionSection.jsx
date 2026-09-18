import { BadgePercent, Check, Copy, Tag } from "lucide-react";
import { useEffect, useState } from "react";

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return `${Math.round(amount).toLocaleString("vi-VN")}đ`;
}

function formatDiscount(promotion) {
  const value = Number(promotion?.discountValue);
  if (!Number.isFinite(value)) return "";
  return String(promotion.discountType).toUpperCase() === "PERCENT"
    ? `Giảm ${value.toLocaleString("vi-VN")}%`
    : `Giảm ${formatMoney(value)}`;
}

function formatExpiry(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

export default function SystemPromotionSection({ promotions }) {
  const [copiedCode, setCopiedCode] = useState("");

  useEffect(() => {
    if (!copiedCode) return undefined;
    const timeoutId = window.setTimeout(() => setCopiedCode(""), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [copiedCode]);

  if (!promotions.length) return null;

  async function handleCopy(code) {
    if (!code) return;
    try {
      await copyText(code);
      setCopiedCode(code);
    } catch {
      setCopiedCode("");
    }
  }

  return (
    <section className="enziu-promotion-section" aria-labelledby="enziu-promotion-title">
      <div className="enziu-fullbleed-inner">
        <div className="enziu-promotion-heading">
          <div>
            <span className="enziu-eyebrow"><i /> Ưu đãi dành cho bạn</span>
            <h2 id="enziu-promotion-title">Thêm một lý do để lên đường.</h2>
          </div>
          <p>Những mã ưu đãi toàn hệ thống đang được áp dụng trên EnziuRooms.</p>
        </div>

        <div className="enziu-promotion-rail" aria-label="Danh sách ưu đãi toàn hệ thống">
          {promotions.map((promotion) => {
            const discount = formatDiscount(promotion);
            const expiry = formatExpiry(promotion.endAt);
            const hasMaxDiscount = Number(promotion.maxDiscount) > 0;
            const hasMinimum = Number(promotion.minBookingAmount) > 0;
            const copied = copiedCode === promotion.code;

            return (
              <article className="enziu-promotion-card" key={promotion.id}>
                <div className="enziu-promotion-card-topline">
                  <span className="enziu-promotion-scope"><BadgePercent size={14} /> Toàn hệ thống</span>
                  <span className="enziu-promotion-type">
                    {String(promotion.discountType).toUpperCase() === "PERCENT"
                      ? "Giảm theo %"
                      : "Giảm trực tiếp"}
                  </span>
                </div>

                <div className="enziu-promotion-card-copy">
                  {promotion.name ? <h3>{promotion.name}</h3> : null}
                  {discount ? <strong>{discount}</strong> : null}
                  {hasMaxDiscount ? <p>Giảm tối đa {formatMoney(promotion.maxDiscount)}</p> : null}
                  {promotion.description ? <small>{promotion.description}</small> : null}
                  {hasMinimum ? <small>Áp dụng cho đơn từ {formatMoney(promotion.minBookingAmount)}</small> : null}
                </div>

                <div className="enziu-promotion-card-meta">
                  {promotion.code ? (
                    <span className="enziu-promotion-code"><Tag size={14} /> Mã: <b>{promotion.code}</b></span>
                  ) : null}
                  {expiry ? <span>HSD: <b>{expiry}</b></span> : null}
                </div>

                {promotion.code ? (
                  <button
                    type="button"
                    className={`enziu-promotion-copy${copied ? " is-copied" : ""}`}
                    onClick={() => void handleCopy(promotion.code)}
                    aria-label={`Sao chép mã ưu đãi ${promotion.code}`}
                    aria-live="polite"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? "Đã sao chép" : "Sao chép mã"}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
