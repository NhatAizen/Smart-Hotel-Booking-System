import {
  CheckCircle2,
  DoorOpen,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Loading from "../../components/common/Loading";
import {
  completeRoomCleaning,
  createRoomsBatch,
  getManagedRooms,
  getMyHotels,
  getRoomTypes,
  updateRoom,
} from "../../services/hotelAdminService";

import "./HotelCatalogAdmin.css";

const emptyBatch = {
  roomTypeId: "",
  count: 1,
  prefix: "1",
  startNumber: 1,
  floor: 1,
};

function errorMessage(error) {
  return error.response?.data?.message ?? "Không thể thực hiện thao tác.";
}

export default function RoomsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const setSearchParamsRef = useRef(setSearchParams);
  const hotelDataRequestRef = useRef(0);
  const [hotels, setHotels] = useState([]);
  const [hotelId, setHotelId] = useState(searchParams.get("hotelId") ?? "");
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [batch, setBatch] = useState(emptyBatch);
  const [showBatch, setShowBatch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [workingRoomId, setWorkingRoomId] = useState("");
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") ?? "",
  );

  useEffect(() => {
    setSearchParamsRef.current = setSearchParams;
  }, [setSearchParams]);

  useEffect(() => {
    const requestedHotelId = searchParams.get("hotelId") ?? "";
    const nextStatusFilter = searchParams.get("status") ?? "";

    setHotelId((current) => {
      const requestedIsValid =
        requestedHotelId &&
        (hotels.length === 0 ||
          hotels.some((hotel) => hotel.id === requestedHotelId));

      const nextHotelId = requestedIsValid
        ? requestedHotelId
        : hotels.some((hotel) => hotel.id === current)
          ? current
          : hotels[0]?.id ?? "";

      return current === nextHotelId ? current : nextHotelId;
    });
    setStatusFilter((current) =>
      current === nextStatusFilter ? current : nextStatusFilter,
    );
  }, [hotels, searchParams]);

  const roomTypeMap = useMemo(
    () => Object.fromEntries(roomTypes.map((type) => [type.id, type])),
    [roomTypes],
  );

  const cleaningRooms = useMemo(
    () => rooms.filter((room) => room.status === "CLEANING"),
    [rooms],
  );

  const visibleRooms = useMemo(
    () =>
      statusFilter
        ? rooms.filter((room) => room.status === statusFilter)
        : rooms,
    [rooms, statusFilter],
  );

  useEffect(() => {
    async function load() {
      try {
        const data = await getMyHotels();
        const safeHotels = Array.isArray(data) ? data : [];
        setHotels(safeHotels);

        setHotelId((current) =>
          safeHotels.some((hotel) => hotel.id === current)
            ? current
            : safeHotels[0]?.id ?? "",
        );
      } catch (requestError) {
        setError(errorMessage(requestError));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  useEffect(() => {
    if (!hotelId) {
      hotelDataRequestRef.current += 1;
      setRooms([]);
      setRoomTypes([]);
      setLoadingRooms(false);
      return;
    }

    const requestId = hotelDataRequestRef.current + 1;
    hotelDataRequestRef.current = requestId;

    async function loadHotelData() {
      setLoadingRooms(true);
      setError("");

      try {
        const [typeData, roomData] = await Promise.all([
          getRoomTypes(hotelId),
          getManagedRooms(hotelId),
        ]);

        if (hotelDataRequestRef.current !== requestId) return;

        const safeTypes = Array.isArray(typeData) ? typeData : [];
        setRoomTypes(safeTypes);
        setRooms(Array.isArray(roomData) ? roomData : []);
        setBatch((current) => ({
          ...current,
          roomTypeId: safeTypes.some((type) => type.id === current.roomTypeId)
            ? current.roomTypeId
            : safeTypes[0]?.id ?? "",
        }));
      } catch (requestError) {
        if (hotelDataRequestRef.current === requestId) {
          setError(errorMessage(requestError));
        }
      } finally {
        if (hotelDataRequestRef.current === requestId) {
          setLoadingRooms(false);
        }
      }
    }

    loadHotelData();
  }, [hotelId]);

  useEffect(() => {
    if (!hotelId || hotels.length === 0) return;

    const nextSearch = new URLSearchParams();
    nextSearch.set("hotelId", hotelId);
    if (statusFilter) nextSearch.set("status", statusFilter);

    setSearchParamsRef.current((current) =>
      current.toString() === nextSearch.toString() ? current : nextSearch,
      { replace: true },
    );
  }, [hotelId, hotels.length, statusFilter]);

  function handleBatchChange(event) {
    const { name, value } = event.target;
    setBatch((current) => ({
      ...current,
      [name]: ["count", "startNumber", "floor"].includes(name)
        ? Number(value)
        : value,
    }));
  }

  function buildRooms() {
    return Array.from({ length: Math.max(1, batch.count) }, (_, index) => {
      const sequence = batch.startNumber + index;
      const roomNumber = batch.prefix
        ? `${batch.prefix}${String(sequence).padStart(2, "0")}`
        : String(sequence);

      return {
        roomTypeId: batch.roomTypeId,
        roomNumber,
        floor: batch.floor,
        customPrice: null,
        note: "",
      };
    });
  }

  async function handleCreateBatch(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const created = await createRoomsBatch(hotelId, buildRooms());
      setRooms((current) => [...current, ...created]);
      setMessage(`Đã tạo ${created.length} phòng.`);
      setShowBatch(false);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function changeStatus(room, status) {
    setError("");
    setMessage("");

    try {
      const updated = await updateRoom(room.id, {
        roomTypeId: room.roomTypeId,
        roomNumber: room.roomNumber,
        floor: room.floor,
        status,
        customPrice: room.customPrice,
        note: room.note,
      });

      setRooms((current) =>
        current.map((item) => (item.id === room.id ? updated : item)),
      );
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function handleCleaningComplete(room) {
    const confirmed = window.confirm(
      `Xác nhận phòng ${room.roomNumber} đã được vệ sinh và sẵn sàng đón khách mới?`,
    );
    if (!confirmed) return;

    setWorkingRoomId(room.id);
    setError("");
    setMessage("");

    try {
      const updated = await completeRoomCleaning(room.id);
      setRooms((current) =>
        current.map((item) => (item.id === room.id ? updated : item)),
      );
      setMessage(
        `Phòng ${room.roomNumber} đã dọn xong và được chuyển sang Còn trống.`,
      );
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setWorkingRoomId("");
    }
  }

  function selectStatusFilter(value) {
    setStatusFilter(value);
  }

  if (loading) {
    return <Loading message="Đang tải phòng..." />;
  }

  return (
    <div className="admin-page catalog-page">
      <section className="catalog-heading">
        <div>
          <span className="catalog-kicker">KHO PHÒNG</span>
          <h1>Phòng thực tế</h1>
          <p>
            Quản lý từng số phòng, tầng, loại phòng và trạng thái vận hành.
            Phòng sau checkout sẽ vào Đang dọn phòng và chỉ trở lại Còn trống
            khi bạn xác nhận đã vệ sinh xong.
          </p>
        </div>

        <button
          type="button"
          className="catalog-primary"
          onClick={() => setShowBatch(true)}
          disabled={!hotelId || roomTypes.length === 0}
        >
          <Plus size={18} />
          Thêm nhiều phòng
        </button>
      </section>

      {error ? <div className="catalog-notice error">{error}</div> : null}
      {message ? <div className="catalog-notice success">{message}</div> : null}

      {cleaningRooms.length > 0 ? (
        <section className="cleaning-alert-card">
          <div className="cleaning-alert-icon">
            <Sparkles size={24} />
          </div>
          <div>
            <strong>{cleaningRooms.length} phòng đang chờ vệ sinh</strong>
            <span>
              Sau khi dọn xong, hãy xác nhận để phòng trở lại trạng thái Còn trống.
            </span>
          </div>
          <button
            type="button"
            onClick={() => selectStatusFilter("CLEANING")}
          >
            Xem phòng cần dọn
          </button>
        </section>
      ) : null}

      <section className="catalog-card catalog-toolbar">
        <label className="catalog-field">
          <span>Chọn khách sạn</span>
          <select
            value={hotelId}
            onChange={(event) => setHotelId(event.target.value)}
          >
            {hotels.length === 0 ? (
              <option value="">Chưa có khách sạn</option>
            ) : null}
            {hotels.map((hotel) => (
              <option key={hotel.id} value={hotel.id}>
                {hotel.name}
              </option>
            ))}
          </select>
        </label>

        <label className="catalog-field catalog-status-filter">
          <span>Lọc trạng thái</span>
          <select
            value={statusFilter}
            onChange={(event) => selectStatusFilter(event.target.value)}
          >
            <option value="">Tất cả phòng</option>
            <option value="AVAILABLE">Còn trống</option>
            <option value="OCCUPIED">Đang sử dụng</option>
            <option value="CLEANING">Đang dọn phòng</option>
            <option value="MAINTENANCE">Bảo trì</option>
            <option value="INACTIVE">Ngừng hoạt động</option>
          </select>
        </label>

        <div className="catalog-meta">
          <DoorOpen size={18} />
          {visibleRooms.length}/{rooms.length} phòng
        </div>
      </section>

      {loadingRooms ? (
        <Loading message="Đang tải danh sách phòng..." />
      ) : roomTypes.length === 0 ? (
        <section className="catalog-card catalog-empty">
          <DoorOpen size={46} />
          <h2>Chưa có loại phòng</h2>
          <p>Hãy tạo loại phòng trước khi thêm các phòng thực tế.</p>
        </section>
      ) : (
        <section className="catalog-card">
          <div style={{ overflowX: "auto" }}>
            <table className="catalog-room-table">
              <thead>
                <tr>
                  <th>Số phòng</th>
                  <th>Loại phòng</th>
                  <th>Tầng</th>
                  <th>Giá riêng</th>
                  <th>Vận hành</th>
                </tr>
              </thead>
              <tbody>
                {visibleRooms.length === 0 ? (
                  <tr>
                    <td colSpan="5">
                      <div className="catalog-empty">
                        {statusFilter
                          ? "Không có phòng ở trạng thái đã chọn."
                          : "Chưa có phòng thực tế."}
                      </div>
                    </td>
                  </tr>
                ) : (
                  visibleRooms.map((room) => (
                    <tr key={room.id}>
                      <td><strong>{room.roomNumber}</strong></td>
                      <td>{roomTypeMap[room.roomTypeId]?.name ?? "Loại phòng"}</td>
                      <td>{room.floor ?? "-"}</td>
                      <td>
                        {room.customPrice
                          ? `${Number(room.customPrice).toLocaleString("vi-VN")} đ`
                          : "Theo loại phòng"}
                      </td>
                      <td>
                        {room.status === "CLEANING" ? (
                          <div className="cleaning-room-actions">
                            <span className="cleaning-status-badge">
                              <Sparkles size={15} />
                              Đang dọn phòng
                            </span>
                            <small>
                              Chờ từ {new Date(room.updatedAt).toLocaleString("vi-VN")}
                            </small>
                            <button
                              type="button"
                              className="cleaning-complete-button"
                              disabled={workingRoomId === room.id}
                              onClick={() => handleCleaningComplete(room)}
                            >
                              <CheckCircle2 size={16} />
                              {workingRoomId === room.id
                                ? "Đang xác nhận..."
                                : "Đã dọn xong"}
                            </button>
                          </div>
                        ) : (
                          <select
                            value={room.status}
                            onChange={(event) =>
                              changeStatus(room, event.target.value)
                            }
                          >
                            <option value="AVAILABLE">Còn trống</option>
                            <option value="OCCUPIED">Đang sử dụng</option>
                            <option value="CLEANING">Đang dọn phòng</option>
                            <option value="MAINTENANCE">Bảo trì</option>
                            <option value="INACTIVE">Ngừng hoạt động</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showBatch ? (
        <div className="catalog-modal-backdrop">
          <form className="catalog-modal" onSubmit={handleCreateBatch}>
            <div className="catalog-modal-header">
              <div>
                <span className="catalog-kicker">THÊM HÀNG LOẠT</span>
                <h2>Tạo nhiều phòng thực tế</h2>
              </div>
              <button
                type="button"
                className="catalog-icon-button"
                onClick={() => setShowBatch(false)}
              >
                <X size={19} />
              </button>
            </div>

            <div className="catalog-batch-box">
              <label className="catalog-field">
                <span>Loại phòng *</span>
                <select
                  name="roomTypeId"
                  value={batch.roomTypeId}
                  onChange={handleBatchChange}
                  required
                >
                  {roomTypes
                    .filter((type) => type.status === "ACTIVE")
                    .map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                </select>
              </label>

              <label className="catalog-field">
                <span>Số lượng *</span>
                <input
                  name="count"
                  type="number"
                  min="1"
                  max="200"
                  value={batch.count}
                  onChange={handleBatchChange}
                  required
                />
              </label>

              <label className="catalog-field">
                <span>Tiền tố</span>
                <input
                  name="prefix"
                  value={batch.prefix}
                  onChange={handleBatchChange}
                  placeholder="2"
                />
              </label>

              <label className="catalog-field">
                <span>Bắt đầu từ</span>
                <input
                  name="startNumber"
                  type="number"
                  min="0"
                  value={batch.startNumber}
                  onChange={handleBatchChange}
                />
              </label>

              <label className="catalog-field">
                <span>Tầng</span>
                <input
                  name="floor"
                  type="number"
                  value={batch.floor}
                  onChange={handleBatchChange}
                />
              </label>
            </div>

            <p className="catalog-meta">
              Ví dụ: tiền tố 2, bắt đầu 1, số lượng 4 → 201, 202, 203, 204.
            </p>

            <div className="catalog-actions">
              <button
                type="button"
                className="catalog-secondary"
                onClick={() => setShowBatch(false)}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="catalog-primary"
                disabled={submitting}
              >
                {submitting ? "Đang tạo..." : "Tạo phòng"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
