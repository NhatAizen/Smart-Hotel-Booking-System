import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createDailyPriceRule,
  deleteDailyPriceRule,
  getDailyPriceRules,
  getMyHotels,
  getRoomTypes,
  previewDailyPriceRule,
  updateDailyPriceRule,
} from "../../services/hotelAdminService";
import "./ManualDailyPricingPage.css";

const blank = { roomTypeId: "", startDate: "", endDate: "", nightlyPrice: "" };
const money = (value) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(Number(value));
const errorText = (error) => error?.response?.data?.message || "Không thể xử lý yêu cầu. Vui lòng thử lại.";

export default function ManualDailyPricingPage() {
  const [hotels, setHotels] = useState([]);
  const [hotelId, setHotelId] = useState("");
  const [types, setTypes] = useState([]);
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewKey, setPreviewKey] = useState("");
  const [nights, setNights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const formKey = useMemo(() => JSON.stringify([hotelId, editingId, form]), [hotelId, editingId, form]);

  const loadHotel = useCallback(async (id) => {
    setLoading(true);
    setError("");
    try {
      const [roomTypes, savedRules] = await Promise.all([getRoomTypes(id), getDailyPriceRules(id)]);
      setTypes(roomTypes);
      setRules(savedRules);
    } catch (err) {
      setError(errorText(err));
      setTypes([]);
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getMyHotels().then((items) => {
      if (!active) return;
      setHotels(items);
      setHotelId(items[0]?.id || "");
      if (!items.length) setLoading(false);
    }).catch((err) => {
      if (active) { setError(errorText(err)); setLoading(false); }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (hotelId) void loadHotel(hotelId);
  }, [hotelId, loadHotel]);

  const change = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setPreview(null);
    setPreviewKey("");
    setNights([]);
    setNotice("");
  };

  const payload = () => ({ ...form, nightlyPrice: Number(form.nightlyPrice) });

  async function showPreview(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await previewDailyPriceRule(hotelId, payload(), editingId ? { editingRuleId: editingId } : {});
      setPreview(result);
      setPreviewKey(formKey);
      setNights(result.nights);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function moreNights() {
    if (!preview?.nextPageStart) return;
    setBusy(true);
    setError("");
    try {
      const result = await previewDailyPriceRule(hotelId, payload(), {
        ...(editingId ? { editingRuleId: editingId } : {}), pageStart: preview.nextPageStart,
      });
      setNights((current) => [...current, ...result.nights]);
      setPreview(result);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!preview || previewKey !== formKey || !preview.canSave || preview.nextPageStart || busy) return;
    const impact = preview.roomsWithCustomPrice.length;
    const prompt = `Xác nhận lưu giá ${money(form.nightlyPrice)} cho ${preview.totalNights} đêm?\n`
      + `Giá này sẽ thay giá riêng của ${impact} phòng và thay phụ thu ngày đặc biệt/cuối tuần khi được kích hoạt cho khách.\n`
      + "Hiện tại quy tắc chỉ dùng để quản lý và xem trước, chưa áp dụng cho khách đặt phòng.";
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setError("");
    try {
      if (editingId) await updateDailyPriceRule(hotelId, editingId, payload());
      else await createDailyPriceRule(hotelId, payload());
      setNotice("Đã lưu quy tắc quản lý. Giá khách đặt phòng chưa thay đổi.");
      setForm(blank);
      setEditingId(null);
      setPreview(null);
      setPreviewKey("");
      setNights([]);
      setRules(await getDailyPriceRules(hotelId));
    } catch (err) {
      setError(errorText(err));
      setPreview(null);
      setPreviewKey("");
    } finally {
      setBusy(false);
    }
  }

  function edit(rule) {
    setEditingId(rule.id);
    setForm({ roomTypeId: rule.roomTypeId, startDate: rule.startDate,
      endDate: rule.endDate, nightlyPrice: String(rule.nightlyPrice) });
    setPreview(null);
    setPreviewKey("");
    setNights([]);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(rule) {
    if (!window.confirm(`Xóa quy tắc từ ${rule.startDate} đến ${rule.endDate}?`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteDailyPriceRule(hotelId, rule.id);
      setRules(await getDailyPriceRules(hotelId));
      setNotice("Đã xóa quy tắc.");
      if (editingId === rule.id) {
        setEditingId(null);
        setForm(blank);
        setPreview(null);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return <section className="daily-pricing">
    <header className="daily-pricing__header">
      <p className="daily-pricing__eyebrow">Hotel Admin · Quản lý giá</p>
      <h1>Giá phòng theo ngày</h1>
      <p>Đặt giá theo loại phòng cho một ngày hoặc khoảng ngày, rồi xem trước từng đêm.</p>
    </header>
    <div className="daily-pricing__notice" role="status">
      <strong>Giá theo ngày chưa áp dụng cho khách đặt phòng.</strong> Quy tắc tại đây chỉ được lưu để quản lý và xem trước.
      Báo giá, đặt phòng, đổi phòng và thanh toán vẫn dùng cách tính giá hiện tại.
    </div>
    {error && <div className="daily-pricing__error" role="alert">{error}</div>}
    {notice && <div className="daily-pricing__success" role="status">{notice}</div>}
    <label className="daily-pricing__hotel">Khách sạn
      <select value={hotelId} onChange={(event) => {
        setHotelId(event.target.value); setForm(blank); setEditingId(null); setPreview(null);
      }} disabled={busy || loading}>
        {hotels.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
      </select>
    </label>
    {!hotels.length && !loading && <p>Bạn chưa có khách sạn để quản lý giá.</p>}
    {hotelId && <div className="daily-pricing__grid">
      <div className="daily-pricing__panel">
        <h2>{editingId ? "Sửa quy tắc" : "Tạo quy tắc"}</h2>
        <p>Giá phải bằng 50%–125% giá gốc <strong>đã được duyệt</strong> của loại phòng.</p>
        <form onSubmit={showPreview} className="daily-pricing__form">
          <label>Loại phòng
            <select required value={form.roomTypeId} disabled={busy || Boolean(editingId)}
              onChange={(event) => change("roomTypeId", event.target.value)}>
              <option value="">Chọn loại phòng</option>
              {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </label>
          <label>Từ ngày <input required type="date" value={form.startDate} disabled={busy}
            onChange={(event) => change("startDate", event.target.value)} /></label>
          <label>Đến ngày <input required type="date" min={form.startDate} value={form.endDate} disabled={busy}
            onChange={(event) => change("endDate", event.target.value)} /></label>
          <label>Giá mỗi đêm (VND) <input required type="number" min="0.01" step="0.01"
            value={form.nightlyPrice} disabled={busy}
            onChange={(event) => change("nightlyPrice", event.target.value)} /></label>
          <div className="daily-pricing__actions">
            <button type="submit" disabled={busy || loading}>Xem trước từng đêm</button>
            {editingId && <button type="button" className="secondary" onClick={() => {
              setEditingId(null); setForm(blank); setPreview(null); setPreviewKey("");
            }}>Hủy sửa</button>}
          </div>
        </form>
        {preview && previewKey === formKey && <div className="daily-pricing__preview">
          <h3>Xem trước · {preview.totalNights} đêm</h3>
          <p>Giá gốc đã duyệt: {money(preview.approvedBasePrice)}. Khoảng cho phép: {money(preview.minimumNightlyPrice)}–{money(preview.maximumNightlyPrice)}.</p>
          <p><strong>Khi kích hoạt sau này:</strong> giá theo ngày thay giá mặc định, phụ thu ngày đặc biệt, phụ thu cuối tuần và giá riêng của phòng vật lý. Không cộng dồn.</p>
          {preview.roomsWithCustomPrice.length > 0 && <div className="daily-pricing__warning">
            <strong>{preview.roomsWithCustomPrice.length} phòng đang có giá riêng sẽ bị thay giá trong những ngày này:</strong>
            <ul>{preview.roomsWithCustomPrice.map((room) => <li key={room.roomId}>Phòng {room.roomNumber}: {money(room.customPrice)}</li>)}</ul>
          </div>}
          {!preview.canSave && <p className="daily-pricing__error">Khoảng ngày chồng lấn với quy tắc hiện có. Hãy chỉnh khoảng ngày trước khi lưu.</p>}
          <div className="daily-pricing__nights">
            {nights.map((night) => <div key={night.stayDate} className="daily-pricing__night">
              <span>{night.stayDate}</span><strong>{money(night.proposedNightlyPrice)}</strong>
              {night.conflictingRuleId && <small>Chồng lấn quy tắc hiện có</small>}
            </div>)}
          </div>
          {preview.nextPageStart && <button type="button" className="secondary" disabled={busy} onClick={moreNights}>Xem thêm đêm</button>}
          {preview.nextPageStart && <p>Xem hết các đêm trong khoảng trước khi lưu.</p>}
          <div className="daily-pricing__actions"><button type="button" disabled={busy || !preview.canSave || Boolean(preview.nextPageStart)} onClick={save}>Xác nhận lưu quy tắc</button></div>
        </div>}
      </div>
      <div className="daily-pricing__panel">
        <div className="daily-pricing__listhead"><h2>Quy tắc đã lưu</h2><button type="button" className="secondary" disabled={loading || busy} onClick={() => loadHotel(hotelId)}>Tải lại</button></div>
        {loading ? <p>Đang tải quy tắc…</p> : rules.length ? <ul className="daily-pricing__rules">
          {rules.map((rule) => <li key={rule.id}>
            <strong>{types.find((type) => type.id === rule.roomTypeId)?.name || "Loại phòng"}</strong>
            <span>{rule.startDate} → {rule.endDate}</span>
            <span>{money(rule.nightlyPrice)} / đêm</span>
            {!rule.withinCurrentApprovedBounds && <small className="daily-pricing__warning">Giá này không còn nằm trong giới hạn của giá gốc đã duyệt hiện tại; cần sửa trước khi kích hoạt.</small>}
            <div className="daily-pricing__actions">
              <button type="button" className="secondary" disabled={busy} onClick={() => edit(rule)}>Sửa</button>
              <button type="button" className="danger" disabled={busy} onClick={() => remove(rule)}>Xóa</button>
            </div>
          </li>)}
        </ul> : <p>Chưa có quy tắc nào cho khách sạn này.</p>}
      </div>
    </div>}
  </section>;
}
