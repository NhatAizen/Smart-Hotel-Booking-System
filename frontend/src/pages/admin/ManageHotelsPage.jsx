import { BadgeCheck, Building2, MapPin, Phone, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import { approveHotel, getPendingHotels, rejectHotel } from "../../services/adminService";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";

export default function ManageHotelsPage() {
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState(null);

  const loadHotels = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setHotels(await getPendingHotels());
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Không thể tải khách sạn chờ duyệt.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHotels(); }, [loadHotels]);

  useRealtimeRefresh("NOTIFICATION_CREATED", loadHotels, { debounceMs: 120 });

  async function handleApprove(hotel) {
    if (!window.confirm(`Phê duyệt khách sạn “${hotel.name}”?`)) return;
    setBusyId(hotel.id);
    try {
      await approveHotel(hotel.id);
      setHotels((current) => current.filter((item) => item.id !== hotel.id));
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Duyệt khách sạn thất bại.");
    } finally { setBusyId(null); }
  }

  async function handleReject() {
    if (!reason.trim()) { setError("Vui lòng nhập lý do từ chối."); return; }
    setBusyId(rejecting.id);
    try {
      await rejectHotel(rejecting.id, reason.trim());
      setHotels((current) => current.filter((item) => item.id !== rejecting.id));
      setRejecting(null);
      setReason("");
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? "Từ chối khách sạn thất bại.");
    } finally { setBusyId(null); }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div><span className="admin-eyebrow">DUYỆT KHÁCH SẠN</span><h1>Khách sạn chờ duyệt</h1><p>Kiểm tra thông tin liên hệ, địa chỉ và nội dung mô tả khách sạn.</p></div>
        <button type="button" className="admin-secondary-button" onClick={loadHotels}><RefreshCw size={18} /> Làm mới</button>
      </div>
      <ErrorMessage message={error} onRetry={loadHotels} />
      {loading ? <Loading /> : hotels.length === 0 ? (
        <div className="admin-empty-state"><Building2 size={48} /><strong>Không có khách sạn chờ duyệt</strong><span>Tất cả đăng ký khách sạn đã được xử lý.</span></div>
      ) : (
        <div className="admin-card-list">
          {hotels.map((hotel) => (
            <article key={hotel.id} className="admin-review-card">
              <div className="admin-review-main">
                <div className="admin-review-icon"><Building2 size={25} /></div>
                <div>
                  <div className="admin-review-title-row"><h2>{hotel.name}</h2><span className="admin-status pending">Chờ duyệt</span></div>
                  <p>{hotel.description || "Chưa có mô tả"}</p>
                  <div className="admin-review-meta">
                    <span><MapPin size={15} /> {hotel.address}, {hotel.city}</span>
                    <span><Phone size={15} /> {hotel.phone}</span>
                    <span>Email: <strong>{hotel.email}</strong></span>
                    <span>Hạng sao: <strong>{hotel.starRating ?? 0}/5</strong></span>
                  </div>
                </div>
              </div>
              <div className="admin-card-actions">
                <button type="button" className="admin-reject-button" onClick={() => setRejecting(hotel)}><XCircle size={17} /> Từ chối</button>
                <button type="button" className="admin-approve-button" onClick={() => handleApprove(hotel)} disabled={busyId === hotel.id}><BadgeCheck size={17} /> {busyId === hotel.id ? "Đang xử lý..." : "Phê duyệt"}</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {rejecting ? (
        <div className="admin-modal-layer" role="presentation" onMouseDown={() => setRejecting(null)}>
          <section className="admin-modal small" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="admin-modal-header"><div><span>Từ chối khách sạn</span><h2>{rejecting.name}</h2></div><button type="button" onClick={() => setRejecting(null)}>×</button></div>
            <label className="admin-form-field"><span>Lý do từ chối</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={5} placeholder="Ví dụ: Thiếu giấy phép kinh doanh hoặc thông tin địa chỉ chưa hợp lệ..." /></label>
            <div className="admin-modal-actions"><button type="button" className="admin-cancel-button" onClick={() => setRejecting(null)}>Hủy</button><button type="button" className="admin-reject-button" onClick={handleReject} disabled={busyId === rejecting.id}>{busyId === rejecting.id ? "Đang xử lý..." : "Xác nhận từ chối"}</button></div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
