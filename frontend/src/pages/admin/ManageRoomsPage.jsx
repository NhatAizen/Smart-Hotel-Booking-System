import { BadgeCheck, BedDouble, Building2, CircleDollarSign, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import { approveRoom, getPendingRooms, rejectRoom } from "../../services/adminService";

function money(value) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value ?? 0);
}

export default function ManageRoomsPage() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState(null);

  const loadRooms = useCallback(async () => {
    setLoading(true); setError("");
    try { setRooms(await getPendingRooms()); }
    catch (requestError) { setError(requestError.response?.data?.message ?? "Không thể tải phòng chờ duyệt."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  async function handleApprove(room) {
    if (!window.confirm(`Phê duyệt phòng ${room.roomNumber}?`)) return;
    setBusyId(room.id);
    try { await approveRoom(room.id); setRooms((current) => current.filter((item) => item.id !== room.id)); }
    catch (requestError) { setError(requestError.response?.data?.message ?? "Duyệt phòng thất bại."); }
    finally { setBusyId(null); }
  }

  async function handleReject() {
    if (!reason.trim()) { setError("Vui lòng nhập lý do từ chối."); return; }
    setBusyId(rejecting.id);
    try {
      await rejectRoom(rejecting.id, reason.trim());
      setRooms((current) => current.filter((item) => item.id !== rejecting.id));
      setRejecting(null); setReason("");
    } catch (requestError) { setError(requestError.response?.data?.message ?? "Từ chối phòng thất bại."); }
    finally { setBusyId(null); }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div><span className="admin-eyebrow">DUYỆT PHÒNG</span><h1>Phòng chờ duyệt</h1><p>Phòng chỉ hiển thị cho khách sau khi được duyệt.</p></div>
        <button type="button" className="admin-secondary-button" onClick={loadRooms}><RefreshCw size={18} /> Làm mới</button>
      </div>
      <ErrorMessage message={error} onRetry={loadRooms} />
      {loading ? <Loading /> : rooms.length === 0 ? (
        <div className="admin-empty-state"><BedDouble size={48} /><strong>Không có phòng chờ duyệt</strong><span>Tất cả phòng mới hiện đã được xử lý.</span></div>
      ) : (
        <div className="admin-card-list">
          {rooms.map((room) => (
            <article key={room.id} className="admin-review-card">
              <div className="admin-review-main">
                <div className="admin-review-icon"><BedDouble size={25} /></div>
                <div>
                  <div className="admin-review-title-row"><h2>Phòng {room.roomNumber}</h2><span className="admin-status pending">Chờ duyệt</span></div>
                  <p>{room.note || "Không có ghi chú"}</p>
                  <div className="admin-review-meta">
                    <span><Building2 size={15} /> Hotel ID: <strong>{room.hotelId}</strong></span>
                    <span>Tầng: <strong>{room.floor ?? "—"}</strong></span>
                    <span><CircleDollarSign size={15} /> {money(room.customPrice)}</span>
                    <span>Trạng thái vận hành: <strong>{room.status}</strong></span>
                  </div>
                </div>
              </div>
              <div className="admin-card-actions">
                <button type="button" className="admin-reject-button" onClick={() => setRejecting(room)}><XCircle size={17} /> Từ chối</button>
                <button type="button" className="admin-approve-button" onClick={() => handleApprove(room)} disabled={busyId === room.id}><BadgeCheck size={17} /> {busyId === room.id ? "Đang xử lý..." : "Phê duyệt"}</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {rejecting ? (
        <div className="admin-modal-layer" role="presentation" onMouseDown={() => setRejecting(null)}>
          <section className="admin-modal small" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
            <div className="admin-modal-header"><div><span>Từ chối phòng</span><h2>Phòng {rejecting.roomNumber}</h2></div><button type="button" onClick={() => setRejecting(null)}>×</button></div>
            <label className="admin-form-field"><span>Lý do từ chối</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={5} placeholder="Ví dụ: Giá phòng hoặc thông tin mô tả chưa hợp lệ..." /></label>
            <div className="admin-modal-actions"><button type="button" className="admin-cancel-button" onClick={() => setRejecting(null)}>Hủy</button><button type="button" className="admin-reject-button" onClick={handleReject} disabled={busyId === rejecting.id}>{busyId === rejecting.id ? "Đang xử lý..." : "Xác nhận từ chối"}</button></div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
