import {
  BadgeCheck,
  BedDouble,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Expand,
  ImageIcon,
  Maximize2,
  RefreshCw,
  ShieldCheck,
  Users,
  WalletCards,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import apiClient from "../../api/apiClient";
import Loading from "../../components/common/Loading";
import { ConfirmDialog, Modal, StatusBadge } from "../../components/ui";
import { bedTypeLabel } from "../../utils/presentation";

import "./ManageRoomTypesPage.css";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";

function money(value) {
  if (value === null || value === undefined || value === "") {
    return "Chưa cập nhật";
  }

  const amount = Number(value);
  return Number.isFinite(amount)
    ? `${amount.toLocaleString("vi-VN")} đ`
    : "Chưa cập nhật";
}

function valueWithUnit(value, unit) {
  if (value === null || value === undefined || value === "") {
    return "Chưa cập nhật";
  }

  return `${value}${unit}`;
}

function capacityLabel(roomType, abbreviated = false) {
  const adults = roomType?.maxAdults;
  const children = roomType?.maxChildren;

  if (adults === null || adults === undefined || adults === "") {
    return "Chưa cập nhật sức chứa";
  }

  if (children === null || children === undefined || children === "") {
    return abbreviated
      ? `${adults} NL · Chưa cập nhật TE`
      : `${adults} người lớn · Chưa cập nhật trẻ em`;
  }

  return abbreviated
    ? `${adults} NL · ${children} TE`
    : `${adults} người lớn · ${children} trẻ em`;
}

function bedLabel(roomType) {
  const count = roomType?.bedCount;
  const type = roomType?.bedType;

  if (count === null || count === undefined || count === "") {
    return type ? bedTypeLabel(type) : "Chưa cập nhật giường";
  }

  return type
    ? `${count} × ${bedTypeLabel(type)}`
    : `${count} giường · Chưa cập nhật loại`;
}

function booleanLabel(value, whenTrue, whenFalse) {
  if (value === true) return whenTrue;
  if (value === false) return whenFalse;
  return "Chưa cập nhật";
}

function errorMessage(error) {
  const response = error?.response?.data;

  if (response?.validationErrors) {
    return Object.values(response.validationErrors).join(" · ");
  }

  return response?.message ?? error?.message ?? "Không thể thực hiện thao tác.";
}

function resolveImageUrl(image) {
  if (!image) {
    return "";
  }

  if (typeof image === "string") {
    return image;
  }

  return (
    image.imageUrl ??
    image.url ??
    image.fileUrl ??
    image.publicUrl ??
    image.path ??
    ""
  );
}

function normalizeImages(roomType) {
  if (!roomType) {
    return [];
  }

  const coverUrl = roomType.coverImageUrl ?? "";
  const source = Array.isArray(roomType.images) ? roomType.images : [];

  const normalized = source
    .map((image, index) => ({
      id:
        typeof image === "object" && image !== null
          ? image.id ?? image.imageId ?? String(index)
          : String(index),
      url: resolveImageUrl(image),
      isCover:
        typeof image === "object" && image !== null
          ? Boolean(image.cover ?? image.isCover ?? image.primary)
          : false,
      sortOrder:
        typeof image === "object" && image !== null
          ? Number(image.sortOrder ?? image.displayOrder ?? index)
          : index,
    }))
    .filter((image) => image.url);

  if (coverUrl && !normalized.some((image) => image.url === coverUrl)) {
    normalized.unshift({
      id: "cover-url",
      url: coverUrl,
      isCover: true,
      sortOrder: -1,
    });
  }

  const seen = new Set();

  return normalized
    .sort((left, right) => {
      const leftCover = left.isCover || left.url === coverUrl;
      const rightCover = right.isCover || right.url === coverUrl;

      if (leftCover !== rightCover) {
        return leftCover ? -1 : 1;
      }

      return left.sortOrder - right.sortOrder;
    })
    .filter((image) => {
      if (seen.has(image.url)) {
        return false;
      }

      seen.add(image.url);
      return true;
    });
}

function paymentLabels(roomType) {
  const result = [];

  if (roomType.payAtHotelAllowed !== false) {
    result.push("Thanh toán tại khách sạn");
  }

  if (roomType.depositAllowed !== false) {
    result.push(
      roomType.depositPercent === null ||
        roomType.depositPercent === undefined ||
        roomType.depositPercent === ""
        ? "Đặt cọc online · Chưa cập nhật tỷ lệ"
        : `Đặt cọc ${roomType.depositPercent}% online`,
    );
  }

  if (roomType.fullPaymentAllowed !== false) {
    result.push("Thanh toán toàn bộ online");
  }

  return result;
}

export default function ManageRoomTypesPage() {
  const [roomTypes, setRoomTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [detailRoomType, setDetailRoomType] = useState(null);
  const [detailImageIndex, setDetailImageIndex] = useState(0);
  const [rejectingRoomType, setRejectingRoomType] = useState(null);
  const [approvalTarget, setApprovalTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const detailImages = useMemo(
    () => normalizeImages(detailRoomType),
    [detailRoomType],
  );

  async function loadPending() {
    setLoading(true);
    setError("");

    try {
      const response = await apiClient.get("/admin/room-types/pending");
      const payload = response.data;
      setRoomTypes(Array.isArray(payload) ? payload : []);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPending();
  }, []);

  useRealtimeRefresh("NOTIFICATION_CREATED", loadPending, { debounceMs: 120 });

  useEffect(() => {
    if (!detailRoomType) {
      return undefined;
    }

    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event) {
      if (event.key === "Escape") {
        setDetailRoomType(null);
      }

      if (event.key === "ArrowLeft" && detailImages.length > 1) {
        setDetailImageIndex(
          (current) =>
            (current - 1 + detailImages.length) % detailImages.length,
        );
      }

      if (event.key === "ArrowRight" && detailImages.length > 1) {
        setDetailImageIndex(
          (current) => (current + 1) % detailImages.length,
        );
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [detailRoomType, detailImages.length]);

  useEffect(() => {
    setDetailImageIndex((current) =>
      detailImages.length === 0
        ? 0
        : Math.min(current, detailImages.length - 1),
    );
  }, [detailImages.length]);

  function openDetail(roomType) {
    setDetailRoomType(roomType);
    setDetailImageIndex(0);
    setError("");
  }

  function requestApproveRoomType(roomType) {
    if (actionId) return;
    setError("");
    setMessage("");
    if (detailRoomType?.id === roomType.id) {
      setDetailRoomType(null);
    }
    setApprovalTarget(roomType);
  }

  async function confirmApproveRoomType() {
    const roomType = approvalTarget;
    if (!roomType || actionId) return;

    setActionId(roomType.id);
    setError("");
    setMessage("");

    try {
      await apiClient.patch(`/admin/room-types/${roomType.id}/approve`);
      setRoomTypes((current) =>
        current.filter((item) => item.id !== roomType.id),
      );
      setApprovalTarget(null);
      setMessage(`Đã phê duyệt loại phòng “${roomType.name}”.`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setActionId("");
    }
  }

  function beginReject(roomType) {
    if (actionId) return;
    setDetailRoomType(null);
    setRejectingRoomType(roomType);
    setRejectReason("");
    setError("");
    setMessage("");
  }

  function closeRejectModal() {
    if (actionId) return;
    setRejectingRoomType(null);
    setRejectReason("");
  }

  async function rejectRoomType() {
    if (!rejectingRoomType || actionId) return;

    const normalizedReason = rejectReason.trim();

    if (!normalizedReason) {
      setError("Vui lòng nhập lý do từ chối để đối tác biết cần chỉnh sửa gì.");
      return;
    }

    setActionId(rejectingRoomType.id);
    setError("");
    setMessage("");

    try {
      await apiClient.patch(
        `/admin/room-types/${rejectingRoomType.id}/reject`,
        { reason: normalizedReason },
      );

      setRoomTypes((current) =>
        current.filter((item) => item.id !== rejectingRoomType.id),
      );

      setMessage(`Đã từ chối loại phòng “${rejectingRoomType.name}”.`);
      setRejectingRoomType(null);
      setRejectReason("");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setActionId("");
    }
  }

  function previousImage() {
    if (detailImages.length <= 1) {
      return;
    }

    setDetailImageIndex(
      (current) =>
        (current - 1 + detailImages.length) % detailImages.length,
    );
  }

  function nextImage() {
    if (detailImages.length <= 1) {
      return;
    }

    setDetailImageIndex(
      (current) => (current + 1) % detailImages.length,
    );
  }

  if (loading) {
    return <Loading message="Đang tải loại phòng chờ duyệt..." />;
  }

  return (
    <div className="admin-roomtype-page">
      <section className="admin-roomtype-heading">
        <div>
          <span className="admin-roomtype-kicker">DUYỆT LOẠI PHÒNG</span>
          <h1>Loại phòng chờ duyệt</h1>
          <p>
            Xem đúng nội dung khách hàng sẽ nhìn thấy: hình ảnh, mô tả, giá,
            sức chứa, giường, chính sách thanh toán và toàn bộ tiện nghi trước
            khi phê duyệt.
          </p>
        </div>

        <button
          type="button"
          className="admin-roomtype-refresh"
          onClick={loadPending}
          disabled={loading || Boolean(actionId)}
          aria-busy={loading || undefined}
        >
          <RefreshCw size={18} aria-hidden="true" />
          Làm mới
        </button>
      </section>

      {error ? (
        <div className="admin-roomtype-notice error" role="alert">{error}</div>
      ) : null}

      {message ? (
        <div className="admin-roomtype-notice success" role="status">{message}</div>
      ) : null}

      {roomTypes.length === 0 ? (
        <section className="admin-roomtype-empty">
          <BadgeCheck size={52} />
          <h2>Không có loại phòng đang chờ duyệt</h2>
          <p>Các loại phòng mới gửi duyệt sẽ xuất hiện tại đây.</p>
        </section>
      ) : (
        <section className="admin-roomtype-list">
          {roomTypes.map((roomType) => {
            const images = normalizeImages(roomType);
            const amenities = Array.isArray(roomType.amenities)
              ? roomType.amenities
              : [];

            return (
              <article className="admin-roomtype-card" key={roomType.id}>
                <button
                  type="button"
                  className="admin-roomtype-cover"
                  onClick={() => openDetail(roomType)}
                  aria-label={`Xem đầy đủ ${roomType.name}`}
                >
                  {images[0]?.url ? (
                    <img src={images[0].url} alt={roomType.name} loading="lazy" decoding="async" />
                  ) : (
                    <div className="admin-roomtype-no-image">
                      <ImageIcon size={38} />
                      <span>Chưa có ảnh</span>
                    </div>
                  )}

                  <span className="admin-roomtype-cover-hover">
                    <Expand size={18} />
                    Xem đầy đủ
                  </span>

                  {images.length > 0 ? (
                    <span className="admin-roomtype-image-count">
                      {images.length} ảnh
                    </span>
                  ) : null}
                </button>

                <div className="admin-roomtype-summary">
                  <div className="admin-roomtype-title-row">
                    <div>
                      <button
                        type="button"
                        className="admin-roomtype-name"
                        onClick={() => openDetail(roomType)}
                      >
                        {roomType.name}
                      </button>

                      <StatusBadge
                        status={roomType.approvalStatus ?? roomType.status ?? "PENDING_APPROVAL"}
                        label="Chờ duyệt"
                        size="sm"
                      />
                    </div>

                    <strong className="admin-roomtype-price">
                      {money(roomType.basePrice)} / đêm
                    </strong>
                  </div>

                  <p className="admin-roomtype-description">
                    {roomType.description || "Chưa có mô tả loại phòng."}
                  </p>

                  <div className="admin-roomtype-facts">
                    <span>
                      <Building2 size={16} />
                      {roomType.hotelName ?? roomType.hotel?.name ?? "Chưa cập nhật khách sạn"}
                    </span>

                    <span>
                      <Users size={16} />
                      {capacityLabel(roomType)}
                    </span>

                    <span>
                      <Maximize2 size={16} />
                      {valueWithUnit(roomType.areaSqm, " m²")}
                    </span>

                    <span>
                      <BedDouble size={16} />
                      {bedLabel(roomType)}
                    </span>

                    <span>
                      <BedDouble size={16} />
                      {valueWithUnit(roomType.roomCount, " phòng")}
                    </span>
                  </div>

                  <div className="admin-roomtype-chip-row">
                    <span>
                      {roomType.breakfastIncluded
                        ? "Có bữa sáng"
                        : roomType.breakfastIncluded === false
                          ? "Không gồm bữa sáng"
                          : "Chưa cập nhật bữa sáng"}
                    </span>

                    <span>
                      {roomType.refundable
                        ? "Có thể hoàn tiền"
                        : roomType.refundable === false
                          ? "Không hoàn tiền"
                          : "Chưa cập nhật hoàn tiền"}
                    </span>

                    {paymentLabels(roomType).map((payment) => (
                      <span key={payment}>{payment}</span>
                    ))}

                    {amenities.slice(0, 7).map((amenity) => (
                      <span key={amenity}>{amenity}</span>
                    ))}

                    {amenities.length > 7 ? (
                      <button
                        type="button"
                        onClick={() => openDetail(roomType)}
                      >
                        +{amenities.length - 7} tiện nghi
                      </button>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="admin-roomtype-view-detail"
                    onClick={() => openDetail(roomType)}
                  >
                    <Expand size={17} />
                    Xem chi tiết
                  </button>
                </div>

                <div className="admin-roomtype-actions">
                  <button
                    type="button"
                    className="admin-roomtype-reject"
                    disabled={Boolean(actionId)}
                    onClick={() => beginReject(roomType)}
                  >
                    <XCircle size={17} />
                    Từ chối
                  </button>

                  <button
                    type="button"
                    className="admin-roomtype-approve"
                    disabled={Boolean(actionId)}
                    onClick={() => requestApproveRoomType(roomType)}
                  >
                    <ShieldCheck size={17} />
                    Phê duyệt
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {detailRoomType ? (
        <div
          className="admin-roomtype-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDetailRoomType(null);
            }
          }}
        >
          <section
            className="admin-roomtype-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-roomtype-detail-title"
          >
            <button
              type="button"
              className="admin-roomtype-modal-close"
              onClick={() => setDetailRoomType(null)}
              aria-label="Đóng"
            >
              <X size={22} />
            </button>

            <div className="admin-roomtype-gallery">
              <div className="admin-roomtype-main-image">
                {detailImages[detailImageIndex]?.url ? (
                  <img
                    src={detailImages[detailImageIndex].url}
                    alt={`${detailRoomType.name} - ảnh ${
                      detailImageIndex + 1
                    }`}
                  />
                ) : (
                  <div className="admin-roomtype-main-empty">
                    <ImageIcon size={56} />
                    <span>Loại phòng chưa có hình ảnh</span>
                  </div>
                )}

                {detailImages.length > 1 ? (
                  <>
                    <button
                      type="button"
                      className="admin-roomtype-gallery-arrow previous"
                      onClick={previousImage}
                      aria-label="Xem ảnh trước"
                    >
                      <ChevronLeft size={28} />
                    </button>

                    <button
                      type="button"
                      className="admin-roomtype-gallery-arrow next"
                      onClick={nextImage}
                      aria-label="Xem ảnh tiếp theo"
                    >
                      <ChevronRight size={28} />
                    </button>

                    <span className="admin-roomtype-gallery-counter">
                      {detailImageIndex + 1}/{detailImages.length}
                    </span>
                  </>
                ) : null}
              </div>

              {detailImages.length > 0 ? (
                <div className="admin-roomtype-thumbnails">
                  {detailImages.map((image, index) => (
                    <button
                      type="button"
                      key={`${image.id}-${image.url}`}
                      className={
                        detailImageIndex === index
                          ? "admin-roomtype-thumbnail active"
                          : "admin-roomtype-thumbnail"
                      }
                      onClick={() => setDetailImageIndex(index)}
                      aria-label={`Xem ảnh ${index + 1} của ${detailRoomType.name}`}
                      aria-current={detailImageIndex === index ? "true" : undefined}
                    >
                      <img src={image.url} alt="" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="admin-roomtype-detail">
              <span className="admin-roomtype-kicker">
                NỘI DUNG ĐANG CHỜ KIỂM DUYỆT
              </span>

              <div className="admin-roomtype-detail-title">
                <div>
                  <h2 id="admin-roomtype-detail-title">
                    {detailRoomType.name}
                  </h2>
                  <p>
                    <Building2 size={16} />
                    {detailRoomType.hotelName ??
                      detailRoomType.hotel?.name ??
                      "Chưa cập nhật khách sạn"}
                  </p>
                </div>

                <StatusBadge
                  status={detailRoomType.approvalStatus ?? detailRoomType.status ?? "PENDING_APPROVAL"}
                  label="Chờ duyệt"
                  size="sm"
                />
              </div>

              <div className="admin-roomtype-detail-facts">
                <div>
                  <small>Giá cơ bản / đêm</small>
                  <strong>{money(detailRoomType.basePrice)}</strong>
                </div>

                <div>
                  <small>Diện tích</small>
                  <strong>{valueWithUnit(detailRoomType.areaSqm, " m²")}</strong>
                </div>

                <div>
                  <small>Sức chứa</small>
                  <strong>{capacityLabel(detailRoomType, true)}</strong>
                </div>

                <div>
                  <small>Giường</small>
                  <strong>{bedLabel(detailRoomType)}</strong>
                </div>

                <div>
                  <small>Phòng</small>
                  <strong>{valueWithUnit(detailRoomType.roomCount, " phòng")}</strong>
                </div>

                <div>
                  <small>Hình ảnh</small>
                  <strong>{detailImages.length}</strong>
                </div>
              </div>

              <section className="admin-roomtype-detail-section">
                <h3>Mô tả loại phòng</h3>
                <p>
                  {detailRoomType.description ||
                    "Chưa có mô tả."}
                </p>
              </section>

              <section className="admin-roomtype-detail-section">
                <h3>Chính sách khách nhìn thấy</h3>

                <div className="admin-roomtype-policy-grid">
                  <div>
                    <Coffee size={20} />
                    <span>
                      <strong>Bữa sáng</strong>
                      <small>
                        {detailRoomType.breakfastIncluded
                          ? "Bao gồm trong giá"
                          : detailRoomType.breakfastIncluded === false
                            ? "Không bao gồm"
                            : "Chưa cập nhật"}
                      </small>
                    </span>
                  </div>

                  <div>
                    <WalletCards size={20} />
                    <span>
                      <strong>Hoàn tiền</strong>
                      <small>
                        {booleanLabel(
                          detailRoomType.refundable,
                          "Có thể hoàn tiền",
                          "Không hoàn tiền",
                        )}
                      </small>
                    </span>
                  </div>

                  <div>
                    <ShieldCheck size={20} />
                    <span>
                      <strong>Hút thuốc</strong>
                      <small>
                        {booleanLabel(
                          detailRoomType.smokingAllowed,
                          "Cho phép hút thuốc",
                          "Không hút thuốc",
                        )}
                      </small>
                    </span>
                  </div>
                </div>
              </section>

              <section className="admin-roomtype-detail-section">
                <h3>Phương thức thanh toán</h3>

                <div className="admin-roomtype-check-list">
                  {paymentLabels(detailRoomType).length > 0 ? (
                    paymentLabels(detailRoomType).map((payment) => (
                      <span key={payment}>
                        <Check size={17} />
                        {payment}
                      </span>
                    ))
                  ) : (
                    <p>Không có phương thức thanh toán nào được bật.</p>
                  )}
                </div>
              </section>

              <section className="admin-roomtype-detail-section">
                <h3>Toàn bộ tiện nghi phòng</h3>

                {Array.isArray(detailRoomType.amenities) &&
                detailRoomType.amenities.length > 0 ? (
                  <div className="admin-roomtype-amenity-grid">
                    {detailRoomType.amenities.map((amenity) => (
                      <span key={amenity}>
                        <Check size={17} />
                        {amenity}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p>Chưa cập nhật tiện nghi.</p>
                )}
              </section>

              <div className="admin-roomtype-review-note">
                <BadgeCheck size={20} />
                <div>
                  <strong>Kiểm tra trước khi duyệt</strong>
                  <p>
                    Hình ảnh, mô tả, giá, sức chứa, chính sách và tiện nghi ở
                    trên là thông tin sẽ hiển thị cho khách hàng sau
                    khi phê duyệt.
                  </p>
                </div>
              </div>

              <div className="admin-roomtype-modal-actions">
                <button
                  type="button"
                  className="admin-roomtype-reject"
                  disabled={Boolean(actionId)}
                  onClick={() => beginReject(detailRoomType)}
                >
                  <XCircle size={18} />
                  Từ chối và ghi lý do
                </button>

                <button
                  type="button"
                  className="admin-roomtype-approve"
                  disabled={Boolean(actionId)}
                  onClick={() => requestApproveRoomType(detailRoomType)}
                >
                  <ShieldCheck size={18} />
                  Phê duyệt loại phòng
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(approvalTarget)}
        title="Phê duyệt loại phòng"
        description={approvalTarget ? `Loại phòng “${approvalTarget.name}” sẽ được phép hiển thị cho khách sau khi phê duyệt.` : undefined}
        confirmLabel="Phê duyệt loại phòng"
        confirmTone="primary"
        busy={Boolean(approvalTarget && actionId === approvalTarget.id)}
        onCancel={() => {
          if (!actionId) {
            setApprovalTarget(null);
            setError("");
          }
        }}
        onConfirm={() => void confirmApproveRoomType()}
      >
        {approvalTarget && error ? <p className="admin-roomtype-confirm-error" role="alert">{error}</p> : null}
        <p>Hãy kiểm tra hình ảnh, giá, sức chứa, chính sách thanh toán và tiện nghi trước khi công khai loại phòng này.</p>
      </ConfirmDialog>

      <Modal
        open={Boolean(rejectingRoomType)}
        onClose={closeRejectModal}
        title="Từ chối loại phòng"
        description={
          rejectingRoomType
            ? `Gửi lý do cụ thể để đối tác chỉnh sửa “${rejectingRoomType.name}”.`
            : undefined
        }
        size="sm"
        closeOnBackdrop={!actionId}
        closeOnEscape={!actionId}
        footer={(
          <>
            <button
              type="button"
              className="admin-roomtype-modal-cancel"
              onClick={closeRejectModal}
              disabled={Boolean(actionId)}
            >
              Hủy
            </button>
            <button
              type="button"
              className="admin-roomtype-reject"
              onClick={rejectRoomType}
              disabled={!rejectReason.trim() || Boolean(actionId)}
              aria-busy={actionId === rejectingRoomType?.id || undefined}
            >
              <XCircle size={17} aria-hidden="true" />
              {actionId === rejectingRoomType?.id
                ? "Đang xử lý..."
                : "Xác nhận từ chối"}
            </button>
          </>
        )}
      >
        <label className="admin-roomtype-reject-field">
          <span>Lý do từ chối</span>
          <textarea
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            rows={5}
            maxLength={500}
            required
            autoFocus
            placeholder="Nêu rõ nội dung, hình ảnh hoặc chính sách cần bổ sung..."
          />
          <small>{rejectReason.length}/500 ký tự</small>
        </label>
      </Modal>
    </div>
  );
}
