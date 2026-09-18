import {
  BadgeCheck,
  BedDouble,
  CalendarDays,
  Clock3,
  CreditCard,
  FileCheck2,
  Info,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getHotelPolicy, getPlatformPolicy } from "../../services/policyService";
import { statusLabel } from "../../utils/presentation";
import "./BookingTermsPanel.css";

function money(value) {
  if (value === null || value === undefined || value === "") return "Chưa xác định";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `${Math.round(amount).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} ₫`
    : "Chưa xác định";
}

function date(value) {
  if (!value) return "Chưa xác định";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? "Chưa xác định"
    : new Intl.DateTimeFormat("vi-VN").format(parsed);
}

function nights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const value = (new Date(`${checkOut}T00:00:00`) - new Date(`${checkIn}T00:00:00`)) / 86400000;
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function time(value) {
  return value ? String(value).slice(0, 5) : "Khách sạn chưa cung cấp thông tin";
}

function enabledRule(value, yesCopy, noCopy) {
  if (value === true) return yesCopy;
  if (value === false) return noCopy;
  return null;
}

export default function BookingTermsPanel({
  mode = "checkout",
  hotel,
  roomTypes = [],
  roomNames = [],
  checkIn,
  checkOut,
  adults,
  children,
  totalAmount,
  depositAmount,
  paidAmount,
  remainingAmount,
  paymentOption,
  hotelPromotionCode,
  platformPromotionCode,
  hotelPolicyOverride = null,
  minimumAgeOverride = null,
  refundableOverride = null,
}) {
  const [hotelPolicy, setHotelPolicy] = useState(null);
  const [platformPolicy, setPlatformPolicy] = useState(null);

  useEffect(() => {
    if (!hotel?.id) return undefined;
    let active = true;
    Promise.allSettled([
      hotelPolicyOverride ? Promise.resolve(hotelPolicyOverride) : getHotelPolicy(hotel.id),
      getPlatformPolicy(),
    ]).then(([hotelResult, platformResult]) => {
      if (!active) return;
      setHotelPolicy(hotelResult.status === "fulfilled" ? hotelResult.value : null);
      setPlatformPolicy(platformResult.status === "fulfilled" ? platformResult.value : null);
    });
    return () => { active = false; };
  }, [hotel?.id, hotelPolicyOverride]);

  const normalizedTypes = useMemo(
    () => (Array.isArray(roomTypes) ? roomTypes.filter(Boolean) : []),
    [roomTypes],
  );
  const refundableValues = refundableOverride === true || refundableOverride === false
    ? [refundableOverride]
    : normalizedTypes.map((type) => type.refundable);
  const refundableCount = refundableValues.filter((value) => value === true).length;
  const refundCopy = refundableValues.length === 0
    ? "Chưa tải được điều kiện hoàn của loại phòng."
    : refundableCount === refundableValues.length
      ? "Loại phòng có áp dụng hoàn tiền; mức và thời hạn cụ thể chưa được khách sạn cung cấp."
      : refundableCount === 0
        ? "Loại phòng hiện không áp dụng hoàn tiền; mọi ngoại lệ cần khách sạn xem xét."
        : `${refundableCount}/${refundableValues.length} loại phòng có áp dụng hoàn tiền.`;
  const importantRules = [
    enabledRule(hotelPolicy?.petsAllowed, "Cho phép vật nuôi", "Không mang vật nuôi"),
    enabledRule(hotelPolicy?.smokingAllowed, "Cho phép hút thuốc theo quy định khách sạn", "Không hút thuốc"),
    enabledRule(hotelPolicy?.partiesAllowed, "Cho phép tiệc / sự kiện", "Không tổ chức tiệc / sự kiện"),
    hotelPolicy?.quietHoursFrom && hotelPolicy?.quietHoursTo
      ? `Giữ yên tĩnh ${time(hotelPolicy.quietHoursFrom)}–${time(hotelPolicy.quietHoursTo)}`
      : null,
    enabledRule(hotelPolicy?.identityDocumentRequired, "Cần giấy tờ khi nhận phòng", "Khách sạn không đánh dấu yêu cầu giấy tờ riêng"),
    ...(hotelPolicy?.additionalRules ?? []).map((rule) => `${rule.title}: ${rule.content}`),
  ].filter(Boolean);
  const vouchers = [hotelPromotionCode, platformPromotionCode].filter(Boolean);
  const paymentLabel = {
    PAY_AT_HOTEL: "Thanh toán tại khách sạn",
    DEPOSIT: "Đặt cọc trước",
    FULL_PAYMENT: "Thanh toán toàn bộ",
  }[paymentOption] ?? paymentOption ?? "Chưa chọn";
  const nightCount = nights(checkIn, checkOut);

  return (
    <section className={`booking-terms-panel is-${mode}`}>
      <header>
        <span><FileCheck2 size={23} /></span>
        <div>
          <small>{mode === "checkout" ? "TRƯỚC KHI XÁC NHẬN" : "ĐIỀU KIỆN ĐÃ GHI NHẬN"}</small>
          <h2>{mode === "checkout" ? "Điều kiện đặt phòng của bạn" : "Điều kiện đặt phòng"}</h2>
          <p>Kiểm tra kỹ thông tin lưu trú, thanh toán và các điều kiện áp dụng cho đơn này.</p>
        </div>
      </header>

      <div className="booking-terms-facts">
        <article><ShieldCheck size={18} /><span><small>Khách sạn</small><strong>{hotel?.name ?? "Chưa tải được khách sạn"}</strong></span></article>
        <article><BedDouble size={18} /><span><small>Loại phòng</small><strong>{roomNames.filter(Boolean).join(", ") || normalizedTypes.map((type) => type.name).filter(Boolean).join(", ") || "Chưa tải được loại phòng"}</strong></span></article>
        <article><CalendarDays size={18} /><span><small>Ngày lưu trú</small><strong>{date(checkIn)} → {date(checkOut)}</strong></span></article>
        <article><Clock3 size={18} /><span><small>Thời lượng</small><strong>{nightCount == null ? "Chưa xác định" : `${nightCount} đêm`}</strong></span></article>
        <article><Users size={18} /><span><small>Số khách</small><strong>{adults ?? 0} người lớn · {children ?? 0} trẻ em</strong></span></article>
        <article><CreditCard size={18} /><span><small>Hình thức thanh toán</small><strong>{paymentLabel}</strong></span></article>
      </div>

      <div className="booking-terms-money">
        <div><span>Tổng tiền</span><strong>{money(totalAmount)}</strong></div>
        {depositAmount !== null && depositAmount !== undefined ? <div><span>Tiền đặt cọc</span><strong>{money(depositAmount)}</strong></div> : null}
        {paidAmount !== null && paidAmount !== undefined ? <div><span>Đã thanh toán</span><strong>{money(paidAmount)}</strong></div> : null}
        <div><span>Số tiền còn lại</span><strong>{money(remainingAmount)}</strong></div>
        <div><span>Ưu đãi áp dụng</span><strong>{vouchers.length ? vouchers.join(" · ") : "Không có ưu đãi được áp dụng"}</strong></div>
      </div>

      <div className="booking-terms-columns">
        <article>
          <h3><RotateCcw size={18} /> Hủy & hoàn tiền</h3>
          <p><strong>Điều kiện loại phòng:</strong> {refundCopy}</p>
          <p><strong>Thời hạn / mức hoàn:</strong> Khách sạn chưa cung cấp thông tin.</p>
          <p><strong>Yêu cầu hoàn:</strong> {Array.isArray(platformPolicy?.refundRequestEligibleBookingStatuses) && platformPolicy.refundRequestEligibleBookingStatuses.length ? `Có thể gửi khi đơn ở trạng thái ${platformPolicy.refundRequestEligibleBookingStatuses.map((item) => statusLabel(item)).join(" / ")} và vẫn cần khách sạn xem xét.` : "Khả năng gửi yêu cầu phụ thuộc trạng thái của đơn đặt phòng."}</p>
        </article>
        <article>
          <h3><Clock3 size={18} /> Nhận & trả phòng</h3>
          <p><strong>Nhận phòng:</strong> {time(hotelPolicy?.checkInTime ?? hotel?.checkInTime)}</p>
          <p><strong>Trả phòng:</strong> {time(hotelPolicy?.checkOutTime ?? hotel?.checkOutTime)}</p>
          <p><strong>Mã QR nhận phòng:</strong> Mã QR giúp khách sạn tra cứu đơn và tiếp tục các bước xác minh khi nhận phòng.</p>
          {(minimumAgeOverride ?? platformPolicy?.minimumCheckInAge) != null ? <p><strong>Độ tuổi tối thiểu:</strong> {minimumAgeOverride ?? platformPolicy.minimumCheckInAge} tuổi.</p> : null}
        </article>
      </div>

      <div className="booking-terms-rules">
        <h3><BadgeCheck size={18} /> Quy định quan trọng của khách sạn</h3>
        {importantRules.length ? (
          <ul>{importantRules.map((rule) => <li key={rule}><Info size={15} /> {rule}</li>)}</ul>
        ) : <p>Khách sạn chưa cung cấp quy định riêng.</p>}
      </div>

      <footer><QrCode size={17} /> Thông tin và số tiền sẽ được kiểm tra lại khi bạn xác nhận hoặc thanh toán đơn đặt phòng.</footer>
    </section>
  );
}
