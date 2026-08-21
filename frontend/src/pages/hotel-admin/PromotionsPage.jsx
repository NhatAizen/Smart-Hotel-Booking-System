import {
  CalendarClock,
  Gift,
  PauseCircle,
  Percent,
  Plus,
  RefreshCw,
  Tag,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ErrorState, LoadingState, StatusBadge } from "../../components/ui";
import { getMyHotels } from "../../services/hotelAdminService";
import {
  createHotelPromotion,
  getHotelPromotions,
  setHotelPromotionActive,
} from "../../services/promotionService";
import { useRealtime } from "../../realtime/RealtimeContext";
import "../shared/PromotionCenter.css";
import "./HotelPromotionsPage.css";

const initial = {
  code: "",
  name: "",
  description: "",
  hotelId: "",
  discountType: "PERCENT",
  discountValue: "",
  maxDiscount: "",
  minBookingAmount: "",
  startAt: "",
  endAt: "",
  usageLimit: "",
  usagePerUser: "",
};

function money(value) {
  if (value === null || value === undefined || value === "") return "Chưa cập nhật";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `${new Intl.NumberFormat("vi-VN").format(amount)} đ`
    : "Chưa cập nhật";
}

function discountLabel(promotion) {
  if (promotion.discountType === "PERCENT") {
    return promotion.discountValue === null || promotion.discountValue === undefined
      ? "Chưa cập nhật"
      : `${promotion.discountValue}%`;
  }
  if (promotion.discountType === "FIXED") return money(promotion.discountValue);
  return "Kiểu giảm chưa xác định";
}

function formatDateTime(value) {
  if (!value) return "Chưa cập nhật";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa cập nhật";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function localDateTimeMin(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function lifecycleMeta(value) {
  return {
    ACTIVE: { label: "Đang áp dụng", tone: "success" },
    SCHEDULED: { label: "Sắp bắt đầu", tone: "info" },
    EXPIRED: { label: "Đã kết thúc", tone: "neutral" },
    INACTIVE: { label: "Tạm dừng", tone: "neutral" },
    EXHAUSTED: { label: "Đã hết lượt", tone: "warning" },
  }[value] ?? { label: "Trạng thái chưa xác định", tone: "neutral" };
}

function validatePromotion(form) {
  const normalizedCode = form.code.trim().replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(normalizedCode)) {
    return "Mã ưu đãi phải có 3–40 ký tự, chỉ gồm chữ, số, dấu gạch dưới hoặc gạch ngang.";
  }
  if (!form.name.trim() || form.name.trim().length > 160) {
    return "Tên chương trình phải có từ 1 đến 160 ký tự.";
  }
  if (form.description.length > 600) {
    return "Mô tả không được vượt quá 600 ký tự.";
  }

  const discountValue = Number(form.discountValue);
  if (!Number.isFinite(discountValue) || discountValue < 0.01) {
    return "Mức giảm phải từ 0,01 trở lên.";
  }
  if (form.discountType === "PERCENT" && discountValue > 100) {
    return "Mức giảm theo phần trăm không được vượt quá 100%.";
  }
  if (form.maxDiscount !== "" && Number(form.maxDiscount) < 0) {
    return "Mức giảm tối đa không được âm.";
  }
  if (form.minBookingAmount !== "" && Number(form.minBookingAmount) < 0) {
    return "Giá trị đơn tối thiểu không được âm.";
  }

  const startAt = new Date(form.startAt);
  const endAt = new Date(form.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return "Vui lòng chọn đầy đủ thời gian bắt đầu và kết thúc.";
  }
  if (startAt.getTime() < Date.now() - 60_000) {
    return "Thời gian bắt đầu không được ở trong quá khứ.";
  }
  if (endAt <= startAt) {
    return "Thời gian kết thúc phải sau thời gian bắt đầu.";
  }

  if (form.usageLimit !== "" && (!Number.isInteger(Number(form.usageLimit)) || Number(form.usageLimit) < 1)) {
    return "Tổng lượt dùng phải là số nguyên lớn hơn 0.";
  }
  if (
    form.usagePerUser !== ""
    && (!Number.isInteger(Number(form.usagePerUser)) || Number(form.usagePerUser) < 1)
  ) {
    return "Lượt dùng mỗi khách phải là số nguyên lớn hơn 0.";
  }

  return "";
}

export default function PromotionsPage() {
  const { subscribe } = useRealtime();
  const [hotels, setHotels] = useState([]);
  const [list, setList] = useState([]);
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedData, setHasLoadedData] = useState(false);
  const [workingPromotionId, setWorkingPromotionId] = useState("");

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setRefreshing(true);
    setError("");
    try {
      const [hotelData, promotionData] = await Promise.all([
        getMyHotels(),
        getHotelPromotions(),
      ]);
      const safeHotels = Array.isArray(hotelData) ? hotelData : [];
      setHotels(safeHotels);
      setList(Array.isArray(promotionData) ? promotionData : []);
      setHasLoadedData(true);
      setForm((current) => ({
        ...current,
        hotelId: current.hotelId || safeHotels[0]?.id || "",
      }));
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể tải khuyến mãi.");
    } finally {
      if (!quiet) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = () => void load({ quiet: true });
    const unsubscribeCreated = subscribe("HOTEL_PROMOTION_CREATED", refresh);
    const unsubscribeStatus = subscribe("PROMOTION_STATUS_CHANGED", refresh);
    return () => {
      unsubscribeCreated();
      unsubscribeStatus();
    };
  }, [load, subscribe]);

  const summary = useMemo(() => ({
    total: list.length,
    active: list.filter((item) => item.lifecycle === "ACTIVE").length,
    scheduled: list.filter((item) => item.lifecycle === "SCHEDULED").length,
    unavailable: list.filter((item) => ["INACTIVE", "EXPIRED", "EXHAUSTED"].includes(item.lifecycle)).length,
  }), [list]);

  const hotelNameMap = useMemo(
    () => Object.fromEntries(hotels.map((hotel) => [hotel.id, hotel.name])),
    [hotels],
  );

  function change(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    const validationError = validatePromotion(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    try {
      await createHotelPromotion({
        ...form,
        discountValue: Number(form.discountValue),
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
        minBookingAmount: Number(form.minBookingAmount || 0),
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        usagePerUser: form.usagePerUser ? Number(form.usagePerUser) : null,
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
      });
      setMessage("Đã tạo khuyến mãi cho khách sạn.");
      setForm((current) => ({
        ...initial,
        hotelId: current.hotelId,
      }));
      await load({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể tạo khuyến mãi.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(promotion) {
    setWorkingPromotionId(promotion.id);
    setError("");
    setMessage("");
    try {
      await setHotelPromotionActive(promotion.id, !promotion.active);
      setMessage(promotion.active ? "Đã tạm dừng khuyến mãi." : "Đã bật lại khuyến mãi.");
      await load({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể cập nhật khuyến mãi.");
    } finally {
      setWorkingPromotionId("");
    }
  }

  return (
    <div className="promo-page hotel-admin-promo-v2 hotel-promotions-page">
      <section className="promo-hero hotel-admin-page-hero">
        <div>
          <span className="promo-kicker">KHUYẾN MÃI</span>
          <h1>Ưu đãi của khách sạn</h1>
          <p>
            Tạo và theo dõi mã giảm giá từ dữ liệu thật của khách sạn. Trạng thái và lượt sử dụng được cập nhật từ hệ thống.
          </p>
        </div>
        <button className="promo-secondary hotel-admin-refresh-button" type="button" onClick={() => void load()} disabled={refreshing}>
          <RefreshCw size={17} className={refreshing ? "spin" : ""} />
          Làm mới
        </button>
      </section>

      {message ? <div className="promo-message" role="status" aria-live="polite">{message}</div> : null}
      {error && hasLoadedData ? <div className="promo-message error" role="alert">{error}</div> : null}

      {!hasLoadedData && refreshing ? (
        <LoadingState message="Đang tải khuyến mãi..." />
      ) : !hasLoadedData && error ? (
        <ErrorState
          title="Chưa thể tải khuyến mãi"
          message={error}
          onRetry={() => void load()}
        />
      ) : (
        <>

      <section className="hotel-admin-mini-stat-grid">
        <article>
          <span><Tag size={18} /></span>
          <div><small>Tổng mã</small><strong>{summary.total}</strong></div>
        </article>
        <article>
          <span><Percent size={18} /></span>
          <div><small>Đang áp dụng</small><strong>{summary.active}</strong></div>
        </article>
        <article>
          <span><CalendarClock size={18} /></span>
          <div><small>Sắp bắt đầu</small><strong>{summary.scheduled}</strong></div>
        </article>
        <article>
          <span><PauseCircle size={18} /></span>
          <div><small>Không còn áp dụng</small><strong>{summary.unavailable}</strong></div>
        </article>
      </section>

      <div className="promo-two-col">
        <section className="promo-form-card">
          <div className="hotel-admin-card-heading">
            <span><Plus size={19} /></span>
            <div>
              <h2>Tạo mã mới</h2>
              <p>Điền điều kiện và thời gian áp dụng cho ưu đãi của khách sạn.</p>
            </div>
          </div>

          <form className="promo-form" onSubmit={submit}>
            <label>
              Khách sạn
              <select name="hotelId" value={form.hotelId} onChange={change} required>
                <option value="">Chọn khách sạn</option>
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>{hotel.name}</option>
                ))}
              </select>
            </label>

            <label>
              Mã ưu đãi
              <input
                name="code"
                value={form.code}
                onChange={change}
                placeholder="Nhập mã ưu đãi"
                maxLength="40"
                autoCapitalize="characters"
                required
              />
            </label>

            <label className="full">
              Tên chương trình
              <input name="name" value={form.name} onChange={change} maxLength="160" required />
            </label>

            <label>
              Kiểu giảm
              <select name="discountType" value={form.discountType} onChange={change}>
                <option value="PERCENT">Theo phần trăm</option>
                <option value="FIXED">Số tiền cố định</option>
              </select>
            </label>

            <label>
              Mức giảm
              <input name="discountValue" type="number" min="0.01" max={form.discountType === "PERCENT" ? "100" : undefined} step="0.01" value={form.discountValue} onChange={change} required />
            </label>

            <label>
              Giảm tối đa
              <input name="maxDiscount" type="number" min="0" step="0.01" value={form.maxDiscount} onChange={change} placeholder="Không giới hạn" />
            </label>

            <label>
              Đơn tối thiểu
              <input name="minBookingAmount" type="number" min="0" step="0.01" value={form.minBookingAmount} onChange={change} placeholder="Không yêu cầu" />
            </label>

            <label>
              Bắt đầu
              <input name="startAt" type="datetime-local" value={form.startAt} min={localDateTimeMin()} onChange={change} required />
            </label>

            <label>
              Kết thúc
              <input name="endAt" type="datetime-local" value={form.endAt} min={form.startAt || localDateTimeMin()} onChange={change} required />
            </label>

            <label>
              Tổng lượt dùng
              <input name="usageLimit" type="number" min="1" value={form.usageLimit} onChange={change} />
            </label>

            <label>
              Lượt / khách
              <input name="usagePerUser" type="number" min="1" value={form.usagePerUser} onChange={change} placeholder="Chưa giới hạn" />
            </label>

            <label className="full">
              Mô tả
              <textarea name="description" value={form.description} onChange={change} maxLength="600" />
            </label>

            <button type="submit" className="promo-primary full" disabled={busy}>
              {busy ? "Đang tạo..." : "Tạo khuyến mãi"}
            </button>
          </form>
        </section>

        <section className="promo-table-card">
          <div className="hotel-admin-card-heading">
            <span><Gift size={19} /></span>
            <div>
              <h2>Mã đã tạo</h2>
              <p>{list.length} chương trình trong hệ thống.</p>
            </div>
          </div>

          <div className="promo-list">
            {list.length ? list.map((promotion) => (
              <article className="promo-item" key={promotion.id}>
                <div className="hotel-promotion-item-main">
                  <div className="hotel-promotion-item-heading">
                    <div>
                      <span className="promo-code">{promotion.code}</span>
                      <h3>{promotion.name}</h3>
                      <span className="hotel-promotion-hotel-name">
                        {hotelNameMap[promotion.hotelId] ?? "Khách sạn không còn trong danh sách"}
                      </span>
                    </div>
                    <div className="promo-discount">{discountLabel(promotion)}</div>
                  </div>

                  {promotion.description ? <p>{promotion.description}</p> : null}

                  <dl className="hotel-promotion-facts">
                    <div>
                      <dt>Thời gian</dt>
                      <dd>{formatDateTime(promotion.startAt)} – {formatDateTime(promotion.endAt)}</dd>
                    </div>
                    <div>
                      <dt>Lượt sử dụng</dt>
                      <dd>
                        {promotion.usedCount === null || promotion.usedCount === undefined
                          ? "Chưa có dữ liệu"
                          : `${promotion.usedCount}${promotion.usageLimit ? ` / ${promotion.usageLimit}` : " lượt"}`}
                      </dd>
                    </div>
                    <div>
                      <dt>Điều kiện đơn</dt>
                      <dd>
                        {Number(promotion.minBookingAmount) > 0
                          ? `Từ ${money(promotion.minBookingAmount)}`
                          : "Không yêu cầu tối thiểu"}
                      </dd>
                    </div>
                    <div>
                      <dt>Giới hạn</dt>
                      <dd>
                        {promotion.maxDiscount !== null && promotion.maxDiscount !== undefined
                          ? `Tối đa ${money(promotion.maxDiscount)}`
                          : "Không giới hạn mức giảm"}
                        {promotion.usagePerUser !== null && promotion.usagePerUser !== undefined
                          ? ` · ${promotion.usagePerUser} lượt/khách`
                          : " · Chưa cập nhật giới hạn mỗi khách"}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="hotel-promotion-item-actions">
                  <StatusBadge
                    status={promotion.lifecycle}
                    label={lifecycleMeta(promotion.lifecycle).label}
                    tone={lifecycleMeta(promotion.lifecycle).tone}
                  />
                  <button
                    className="promo-secondary"
                    type="button"
                    disabled={workingPromotionId === promotion.id}
                    onClick={() => void handleToggle(promotion)}
                  >
                    {workingPromotionId === promotion.id
                      ? "Đang cập nhật..."
                      : promotion.active ? "Tạm dừng" : "Bật lại"}
                  </button>
                </div>
              </article>
            )) : (
              <div className="hotel-admin-empty-soft">
                <Gift size={32} />
                <strong>Chưa có mã giảm giá</strong>
                <span>Tạo ưu đãi đầu tiên bằng biểu mẫu bên trái.</span>
              </div>
            )}
          </div>
        </section>
      </div>
        </>
      )}
    </div>
  );
}
