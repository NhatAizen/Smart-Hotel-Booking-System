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

import { getMyHotels } from "../../services/hotelAdminService";
import {
  createHotelPromotion,
  getHotelPromotions,
  setHotelPromotionActive,
} from "../../services/promotionService";
import { useRealtime } from "../../realtime/RealtimeContext";
import "../shared/PromotionCenter.css";

function nowInput(days = 0) {
  const date = new Date(Date.now() + days * 86400000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

const initial = {
  code: "",
  name: "",
  description: "",
  hotelId: "",
  discountType: "PERCENT",
  discountValue: 10,
  maxDiscount: "",
  minBookingAmount: 0,
  startAt: nowInput(),
  endAt: nowInput(30),
  usageLimit: 100,
  usagePerUser: 1,
};

function money(value) {
  return `${new Intl.NumberFormat("vi-VN").format(Number(value ?? 0))} đ`;
}

function lifecycleLabel(value) {
  return {
    ACTIVE: "Đang áp dụng",
    SCHEDULED: "Sắp bắt đầu",
    EXPIRED: "Đã kết thúc",
    INACTIVE: "Tạm dừng",
  }[value] ?? "Không xác định";
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
    inactive: list.filter((item) => ["INACTIVE", "EXPIRED"].includes(item.lifecycle)).length,
  }), [list]);

  function change(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await createHotelPromotion({
        ...form,
        discountValue: Number(form.discountValue),
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
        minBookingAmount: Number(form.minBookingAmount || 0),
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        usagePerUser: Number(form.usagePerUser || 1),
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
      });
      setMessage("Đã tạo khuyến mãi cho khách sạn.");
      setForm((current) => ({
        ...initial,
        hotelId: current.hotelId,
        startAt: nowInput(),
        endAt: nowInput(30),
      }));
      await load({ quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể tạo khuyến mãi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="promo-page hotel-admin-promo-v2">
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

      {message ? <div className="promo-message">{message}</div> : null}
      {error ? <div className="promo-message error">{error}</div> : null}

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
          <div><small>Tạm dừng / kết thúc</small><strong>{summary.inactive}</strong></div>
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
              <input name="code" value={form.code} onChange={change} placeholder="SUMMER10" required />
            </label>

            <label className="full">
              Tên chương trình
              <input name="name" value={form.name} onChange={change} required />
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
              <input name="discountValue" type="number" min="0" value={form.discountValue} onChange={change} required />
            </label>

            <label>
              Giảm tối đa
              <input name="maxDiscount" type="number" min="0" value={form.maxDiscount} onChange={change} placeholder="Không giới hạn" />
            </label>

            <label>
              Đơn tối thiểu
              <input name="minBookingAmount" type="number" min="0" value={form.minBookingAmount} onChange={change} />
            </label>

            <label>
              Bắt đầu
              <input name="startAt" type="datetime-local" value={form.startAt} onChange={change} />
            </label>

            <label>
              Kết thúc
              <input name="endAt" type="datetime-local" value={form.endAt} onChange={change} />
            </label>

            <label>
              Tổng lượt dùng
              <input name="usageLimit" type="number" min="1" value={form.usageLimit} onChange={change} />
            </label>

            <label>
              Lượt / khách
              <input name="usagePerUser" type="number" min="1" value={form.usagePerUser} onChange={change} />
            </label>

            <label className="full">
              Mô tả
              <textarea name="description" value={form.description} onChange={change} />
            </label>

            <button className="promo-primary full" disabled={busy}>
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
                <div>
                  <span className="promo-code">{promotion.code}</span>
                  <h3>{promotion.name}</h3>
                  <div className="promo-discount">
                    {promotion.discountType === "PERCENT"
                      ? `${promotion.discountValue}%`
                      : money(promotion.discountValue)}
                  </div>
                  <small>
                    Đã dùng {promotion.usedCount}
                    {promotion.usageLimit ? ` / ${promotion.usageLimit}` : ""}
                  </small>
                </div>
                <div>
                  <span className={`promo-status ${promotion.lifecycle === "ACTIVE" ? "active" : ""}`}>
                    {lifecycleLabel(promotion.lifecycle)}
                  </span>
                  <button
                    className="promo-secondary"
                    type="button"
                    onClick={async () => {
                      await setHotelPromotionActive(promotion.id, !promotion.active);
                      await load({ quiet: true });
                    }}
                  >
                    {promotion.active ? "Tạm dừng" : "Bật lại"}
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
    </div>
  );
}
