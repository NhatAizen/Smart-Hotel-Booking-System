import {
  BedDouble,
  Building2,
  CheckCircle2,
  DoorOpen,
  Plus,
  RefreshCw,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Loading from "../../components/common/Loading";
import { StatusBadge } from "../../components/ui";
import {
  completeRoomCleaning,
  createRoomsBatch,
  getManagedRooms,
  getMyHotels,
  getRoomTypes,
  updateRoom,
} from "../../services/hotelAdminService";
import { bedTypeLabel } from "../../utils/presentation";

import "./HotelCatalogAdmin.css";
import "./RoomsOperationsPage.css";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";

const emptyBatch = {
  roomTypeId: "",
  count: "",
  prefix: "",
  startNumber: "",
  floor: "",
};

const ROOM_STATUS_META = {
  AVAILABLE: {
    label: "Còn trống",
    tone: "success",
    nextAction: "Sẵn sàng nhận khách",
    summaryIcon: DoorOpen,
  },
  OCCUPIED: {
    label: "Đang sử dụng",
    tone: "info",
    nextAction: "Theo dõi kỳ lưu trú",
    summaryIcon: BedDouble,
  },
  CLEANING: {
    label: "Đang dọn phòng",
    tone: "warning",
    nextAction: "Xác nhận sau khi dọn xong",
    summaryIcon: Sparkles,
  },
  MAINTENANCE: {
    label: "Bảo trì",
    tone: "danger",
    nextAction: "Cập nhật khi bảo trì xong",
    summaryIcon: Wrench,
  },
  INACTIVE: {
    label: "Ngừng hoạt động",
    tone: "neutral",
    nextAction: "Kích hoạt khi sẵn sàng",
    summaryIcon: Building2,
  },
};

const UNKNOWN_ROOM_STATUS_META = {
  label: "Trạng thái chưa xác định",
  tone: "neutral",
  nextAction: "Kiểm tra lại trạng thái",
  summaryIcon: Building2,
};

function roomStatusMeta(status) {
  return ROOM_STATUS_META[status] ?? UNKNOWN_ROOM_STATUS_META;
}

function errorMessage(error) {
  return error.response?.data?.message ?? "Không thể thực hiện thao tác.";
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "Chưa cập nhật";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `${amount.toLocaleString("vi-VN")} đ`
    : "Chưa cập nhật";
}

function roomTypeCapacity(type) {
  if (type.maxAdults === null || type.maxAdults === undefined) {
    return "Chưa cập nhật sức chứa";
  }
  if (type.maxChildren === null || type.maxChildren === undefined) {
    return `${type.maxAdults} người lớn · Chưa cập nhật số trẻ em`;
  }
  return `${type.maxAdults} người lớn${Number(type.maxChildren) > 0 ? ` · ${type.maxChildren} trẻ em` : ""}`;
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function RoomsPage() {
  const [realtimeTick, setRealtimeTick] = useState(0);
  useRealtimeRefresh("NOTIFICATION_CREATED", () => setRealtimeTick((value) => value + 1), { debounceMs: 120 });
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
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");

  useEffect(() => {
    setSearchParamsRef.current = setSearchParams;
  }, [setSearchParams]);

  useEffect(() => {
    const requestedHotelId = searchParams.get("hotelId") ?? "";
    const nextStatusFilter = searchParams.get("status") ?? "";

    setHotelId((current) => {
      const requestedIsValid =
        requestedHotelId
        && (hotels.length === 0 || hotels.some((hotel) => hotel.id === requestedHotelId));

      const nextHotelId = requestedIsValid
        ? requestedHotelId
        : hotels.some((hotel) => hotel.id === current)
          ? current
          : hotels[0]?.id ?? "";

      return current === nextHotelId ? current : nextHotelId;
    });
    setStatusFilter((current) => (current === nextStatusFilter ? current : nextStatusFilter));
  }, [hotels, searchParams]);

  const roomTypeMap = useMemo(
    () => Object.fromEntries(roomTypes.map((type) => [type.id, type])),
    [roomTypes],
  );

  const activeRoomTypes = useMemo(
    () => roomTypes.filter((type) => type.status === "ACTIVE"),
    [roomTypes],
  );

  const cleaningRooms = useMemo(
    () => rooms.filter((room) => room.status === "CLEANING"),
    [rooms],
  );

  const visibleRooms = useMemo(
    () => (statusFilter ? rooms.filter((room) => room.status === statusFilter) : rooms),
    [rooms, statusFilter],
  );

  const selectedHotel = useMemo(
    () => hotels.find((hotel) => hotel.id === hotelId) ?? null,
    [hotels, hotelId],
  );

  const roomStats = useMemo(() => {
    const count = (status) => rooms.filter((room) => room.status === status).length;
    return {
      total: rooms.length,
      available: count("AVAILABLE"),
      occupied: count("OCCUPIED"),
      cleaning: count("CLEANING"),
      maintenance: count("MAINTENANCE"),
      inactive: count("INACTIVE"),
    };
  }, [rooms]);

  const summaryCards = useMemo(
    () => [
      {
        key: "total",
        label: "Tổng số phòng",
        value: roomStats.total,
        helper: `${roomTypes.length} loại phòng`,
        icon: Building2,
        className: "total",
      },
      {
        key: "available",
        label: "Phòng sẵn sàng",
        value: roomStats.available,
        helper: "Có thể bán ngay",
        icon: DoorOpen,
        className: "available",
      },
      {
        key: "occupied",
        label: "Đang sử dụng",
        value: roomStats.occupied,
        helper: "Khách đang lưu trú",
        icon: BedDouble,
        className: "occupied",
      },
      {
        key: "cleaning",
        label: "Đang dọn phòng",
        value: roomStats.cleaning,
        helper: roomStats.cleaning > 0 ? "Cần xác nhận sau khi dọn xong" : "Không có phòng chờ dọn",
        icon: Sparkles,
        className: "cleaning",
      },
      {
        key: "maintenance",
        label: "Bảo trì / ngưng",
        value: roomStats.maintenance + roomStats.inactive,
        helper: `${roomStats.maintenance} bảo trì · ${roomStats.inactive} ngừng hoạt động`,
        icon: Wrench,
        className: "maintenance",
      },
    ],
    [roomStats, roomTypes.length],
  );

  const roomTypeSummary = useMemo(
    () => roomTypes
      .map((type) => ({
        id: type.id,
        name: type.name,
        count: rooms.filter((room) => room.roomTypeId === type.id).length,
        basePrice: type.basePrice,
        maxAdults: type.maxAdults,
        maxChildren: type.maxChildren,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi")),
    [roomTypes, rooms],
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
  }, [realtimeTick]);

  const loadHotelData = useCallback(async (targetHotelId) => {
    if (!targetHotelId) {
      hotelDataRequestRef.current += 1;
      setRooms([]);
      setRoomTypes([]);
      setLoadingRooms(false);
      return;
    }

    const requestId = hotelDataRequestRef.current + 1;
    hotelDataRequestRef.current = requestId;

    setLoadingRooms(true);
    setError("");

    try {
      const [typeData, roomData] = await Promise.all([
        getRoomTypes(targetHotelId),
        getManagedRooms(targetHotelId),
      ]);

      if (hotelDataRequestRef.current !== requestId) return;

      const safeTypes = Array.isArray(typeData) ? typeData : [];
      const activeTypes = safeTypes.filter((type) => type.status === "ACTIVE");
      setRoomTypes(safeTypes);
      setRooms(Array.isArray(roomData) ? roomData : []);
      setBatch((current) => ({
        ...current,
        roomTypeId: activeTypes.some((type) => type.id === current.roomTypeId)
          ? current.roomTypeId
          : activeTypes[0]?.id ?? "",
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
  }, []);

  useEffect(() => {
    void loadHotelData(hotelId);
  }, [hotelId, loadHotelData, realtimeTick]);

  useEffect(() => {
    if (!hotelId || hotels.length === 0) return;

    const nextSearch = new URLSearchParams();
    nextSearch.set("hotelId", hotelId);
    if (statusFilter) nextSearch.set("status", statusFilter);

    setSearchParamsRef.current(
      (current) => (current.toString() === nextSearch.toString() ? current : nextSearch),
      { replace: true },
    );
  }, [hotelId, hotels.length, statusFilter]);

  function handleBatchChange(event) {
    const { name, value } = event.target;
    setBatch((current) => ({
      ...current,
      [name]: ["count", "startNumber", "floor"].includes(name)
        ? (value === "" ? "" : Number(value))
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
        floor: batch.floor === "" ? null : Number(batch.floor),
        customPrice: null,
        note: "",
      };
    });
  }

  async function handleCreateBatch(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    const count = Number(batch.count);
    const startNumber = Number(batch.startNumber);
    const selectedTypeIsActive = activeRoomTypes.some(
      (type) => type.id === batch.roomTypeId,
    );

    if (!selectedTypeIsActive) {
      setError("Vui lòng chọn một loại phòng đang hoạt động.");
      return;
    }
    if (!Number.isInteger(count) || count < 1 || count > 200) {
      setError("Số lượng phòng phải là số nguyên từ 1 đến 200.");
      return;
    }
    if (!Number.isInteger(startNumber) || startNumber < 0) {
      setError("Số phòng bắt đầu phải là số nguyên từ 0 trở lên.");
      return;
    }
    if (batch.floor !== "" && !Number.isInteger(Number(batch.floor))) {
      setError("Tầng phải là số nguyên hoặc để trống.");
      return;
    }

    setSubmitting(true);

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

      setRooms((current) => current.map((item) => (item.id === room.id ? updated : item)));
      setMessage(`Đã cập nhật trạng thái phòng ${room.roomNumber}.`);
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
      setRooms((current) => current.map((item) => (item.id === room.id ? updated : item)));
      setMessage(`Phòng ${room.roomNumber} đã dọn xong và được chuyển sang Còn trống.`);
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
    <div className="admin-page catalog-page room-admin-page-v2 rooms-operations-page">
      <section className="catalog-heading room-admin-heading">
        <div>
          <span className="catalog-kicker">PHÒNG</span>
          <h1>Quản lý phòng dễ nhìn hơn</h1>
          <p>
            Hiển thị toàn bộ phòng của khách sạn, giúp bạn nhìn nhanh số lượng phòng,
            trạng thái vận hành và thao tác dọn phòng / bảo trì ngay trên một màn hình.
          </p>
        </div>

        <div className="room-admin-heading-actions">
          <button
            type="button"
            className="catalog-secondary room-admin-refresh"
            onClick={() => void loadHotelData(hotelId)}
            disabled={loadingRooms}
          >
            <RefreshCw size={18} className={loadingRooms ? "spin" : ""} />
            Làm mới
          </button>
          <button
            type="button"
            className="catalog-primary"
            onClick={() => setShowBatch(true)}
            disabled={!hotelId || activeRoomTypes.length === 0}
          >
            <Plus size={18} />
            Thêm nhiều phòng
          </button>
        </div>
      </section>

      {error ? <div className="catalog-notice error">{error}</div> : null}
      {message ? <div className="catalog-notice success">{message}</div> : null}

      <section className="catalog-card room-admin-toolbar-card">
        <div className="room-admin-toolbar-grid">
          <label className="catalog-field">
            <span>Chọn khách sạn</span>
            <select value={hotelId} onChange={(event) => setHotelId(event.target.value)}>
              {hotels.length === 0 ? <option value="">Chưa có khách sạn</option> : null}
              {hotels.map((hotel) => (
                <option key={hotel.id} value={hotel.id}>
                  {hotel.name}
                </option>
              ))}
            </select>
          </label>

          <label className="catalog-field catalog-status-filter">
            <span>Lọc trạng thái</span>
            <select value={statusFilter} onChange={(event) => selectStatusFilter(event.target.value)}>
              <option value="">Tất cả phòng</option>
              <option value="AVAILABLE">Còn trống</option>
              <option value="OCCUPIED">Đang sử dụng</option>
              <option value="CLEANING">Đang dọn phòng</option>
              <option value="MAINTENANCE">Bảo trì</option>
              <option value="INACTIVE">Ngừng hoạt động</option>
            </select>
          </label>

          <div className="room-admin-current-hotel">
            <small>Đang xem</small>
            <strong>{selectedHotel?.name ?? "Chưa chọn khách sạn"}</strong>
            <span>{visibleRooms.length}/{rooms.length} phòng hiển thị</span>
          </div>
        </div>
      </section>

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
          <button type="button" onClick={() => selectStatusFilter("CLEANING")}>
            Xem phòng cần dọn
          </button>
        </section>
      ) : null}

      <section className="room-admin-summary-grid">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <article className={`room-admin-summary-card ${card.className}`} key={card.key}>
              <div className="room-admin-summary-icon">
                <Icon size={20} />
              </div>
              <div>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <small>{card.helper}</small>
              </div>
            </article>
          );
        })}
      </section>

      <section className="catalog-card room-admin-type-overview">
        <div className="room-admin-section-head">
          <div>
            <span className="catalog-kicker">LOẠI PHÒNG</span>
            <h2>Tổng quan theo loại phòng</h2>
          </div>
          <small>Tổng hợp từ các loại phòng hiện có của khách sạn.</small>
        </div>

        {roomTypeSummary.length === 0 ? (
          <div className="catalog-empty">Chưa có loại phòng để hiển thị.</div>
        ) : (
          <div className="room-admin-type-chip-grid">
            {roomTypeSummary.map((type) => (
              <div className="room-admin-type-chip" key={type.id}>
                <div>
                  <strong>{type.name}</strong>
                  <span>{roomTypeCapacity(type)}</span>
                </div>
                <div className="room-admin-type-chip-meta">
                  <b>{type.count} phòng</b>
                  <small>
                    {type.basePrice === null || type.basePrice === undefined
                      ? "Chưa cập nhật giá"
                      : formatMoney(type.basePrice)}
                  </small>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {loadingRooms ? (
        <Loading message="Đang tải danh sách phòng..." />
      ) : roomTypes.length === 0 ? (
        <section className="catalog-card catalog-empty">
          <DoorOpen size={46} />
          <h2>Chưa có loại phòng</h2>
          <p>Hãy tạo loại phòng trước khi thêm các phòng.</p>
        </section>
      ) : (
        <section className="catalog-card room-admin-table-card">
          <div className="room-admin-section-head">
            <div>
              <span className="catalog-kicker">DANH SÁCH PHÒNG</span>
              <h2>Chi tiết từng phòng</h2>
            </div>
            <small>
              {statusFilter
                ? `Đang lọc: ${roomStatusMeta(statusFilter).label}`
                : "Đang hiển thị tất cả trạng thái"}
            </small>
          </div>

          <div className="room-operations-table-wrap">
            <table className="catalog-room-table room-admin-table-v2">
              <thead>
                <tr>
                  <th>Phòng</th>
                  <th>Loại phòng</th>
                  <th>Tầng</th>
                  <th>Trạng thái</th>
                  <th>Giá bán</th>
                  <th>Hành động tiếp theo</th>
                </tr>
              </thead>
              <tbody>
                {visibleRooms.length === 0 ? (
                  <tr>
                    <td className="room-operations-empty-cell" colSpan="6">
                      <div className="catalog-empty">
                        {statusFilter ? "Không có phòng ở trạng thái đã chọn." : "Chưa có phòng."}
                      </div>
                    </td>
                  </tr>
                ) : (
                  visibleRooms.map((room) => {
                    const type = roomTypeMap[room.roomTypeId];
                    const statusMeta = roomStatusMeta(room.status);
                    const hasCustomPrice = room.customPrice !== null && room.customPrice !== undefined;
                    const effectivePrice = hasCustomPrice ? room.customPrice : type?.basePrice;
                    const hasKnownStatus = Boolean(ROOM_STATUS_META[room.status]);
                    return (
                      <tr key={room.id}>
                        <td data-label="Phòng">
                          <div className="room-admin-room-main">
                            <strong>{room.roomNumber || "Chưa cập nhật"}</strong>
                          </div>
                        </td>
                        <td data-label="Loại phòng">
                          <div className="room-admin-room-type">
                            <strong>{type?.name ?? "Không tìm thấy loại phòng"}</strong>
                            <span>
                              {type?.bedType ? bedTypeLabel(type.bedType) : "Chưa có thông tin giường"}
                              {type?.areaSqm !== null && type?.areaSqm !== undefined
                                ? ` · ${Number(type.areaSqm).toLocaleString("vi-VN")} m²`
                                : ""}
                            </span>
                          </div>
                        </td>
                        <td data-label="Tầng">
                          <span className="room-operations-floor">
                            {room.floor ?? "Chưa cập nhật"}
                          </span>
                        </td>
                        <td data-label="Trạng thái">
                          <div className="room-admin-status-box">
                            <StatusBadge
                              status={room.status}
                              label={statusMeta.label}
                              tone={statusMeta.tone}
                            />
                            {room.status === "CLEANING" ? (
                              <small>Chờ từ {formatDateTime(room.updatedAt)}</small>
                            ) : (
                              <select
                                aria-label={`Cập nhật trạng thái phòng ${room.roomNumber}`}
                                value={room.status}
                                onChange={(event) => changeStatus(room, event.target.value)}
                              >
                                {!hasKnownStatus ? (
                                  <option value={room.status} disabled>{statusMeta.label}</option>
                                ) : null}
                                <option value="AVAILABLE">Còn trống</option>
                                <option value="OCCUPIED">Đang sử dụng</option>
                                <option value="CLEANING">Đang dọn phòng</option>
                                <option value="MAINTENANCE">Bảo trì</option>
                                <option value="INACTIVE">Ngừng hoạt động</option>
                              </select>
                            )}
                          </div>
                        </td>
                        <td data-label="Giá bán">
                          <div className="room-admin-room-price">
                            <strong>
                              {effectivePrice !== null && effectivePrice !== undefined
                                ? formatMoney(effectivePrice)
                                : "Chưa có giá"}
                            </strong>
                            <span>
                              {hasCustomPrice
                                ? "Giá riêng của phòng"
                                : type?.basePrice !== null && type?.basePrice !== undefined
                                  ? "Theo giá loại phòng"
                                  : "Chưa cấu hình giá"}
                            </span>
                          </div>
                        </td>
                        <td data-label="Tiếp theo">
                          {room.status === "CLEANING" ? (
                            <div className="cleaning-room-actions room-admin-cleaning-box room-operations-next-action">
                              <span>{statusMeta.nextAction}</span>
                              <button
                                type="button"
                                className="cleaning-complete-button"
                                disabled={workingRoomId === room.id}
                                onClick={() => handleCleaningComplete(room)}
                              >
                                <CheckCircle2 size={16} />
                                {workingRoomId === room.id ? "Đang xác nhận..." : "Đã dọn xong"}
                              </button>
                            </div>
                          ) : (
                            <div className="room-operations-next-action">
                              <strong>{statusMeta.nextAction}</strong>
                              <small>Cập nhật {formatDateTime(room.updatedAt)}</small>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showBatch ? (
        <div
          className="catalog-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) setShowBatch(false);
          }}
        >
          <form
            className="catalog-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-room-batch-title"
            onSubmit={handleCreateBatch}
          >
            <div className="catalog-modal-header">
              <div>
                <span className="catalog-kicker">THÊM HÀNG LOẠT</span>
                <h2 id="create-room-batch-title">Tạo nhiều phòng</h2>
              </div>
              <button
                type="button"
                className="catalog-icon-button"
                aria-label="Đóng hộp thoại tạo phòng"
                disabled={submitting}
                onClick={() => setShowBatch(false)}
              >
                <X size={19} />
              </button>
            </div>

            <div className="catalog-batch-box">
              <label className="catalog-field">
                <span>Loại phòng *</span>
                <select name="roomTypeId" value={batch.roomTypeId} onChange={handleBatchChange} required>
                  {activeRoomTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                </select>
              </label>

              <label className="catalog-field">
                <span>Số lượng *</span>
                <input name="count" type="number" min="1" max="200" value={batch.count} onChange={handleBatchChange} required />
              </label>

              <label className="catalog-field">
                <span>Tiền tố</span>
                <input name="prefix" value={batch.prefix} onChange={handleBatchChange} placeholder="Để trống nếu không dùng tiền tố" />
              </label>

              <label className="catalog-field">
                <span>Bắt đầu từ *</span>
                <input name="startNumber" type="number" min="0" value={batch.startNumber} onChange={handleBatchChange} required />
              </label>

              <label className="catalog-field">
                <span>Tầng</span>
                <input name="floor" type="number" value={batch.floor} onChange={handleBatchChange} />
              </label>
            </div>

            <p className="catalog-meta">
              Số phòng được tạo bằng cách ghép tiền tố (nếu có) với dãy số bắt đầu bạn chọn.
            </p>

            <div className="catalog-actions">
              <button type="button" className="catalog-secondary" disabled={submitting} onClick={() => setShowBatch(false)}>
                Hủy
              </button>
              <button type="submit" className="catalog-primary" disabled={submitting}>
                {submitting ? "Đang tạo..." : "Tạo phòng"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
