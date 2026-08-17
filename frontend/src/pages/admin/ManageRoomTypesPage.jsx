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

import "./ManageRoomTypesPage.css";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";

function money(value) {
  return `${Number(value ?? 0).toLocaleString("vi-VN")} đ`;
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
    result.push(`Đặt cọc ${roomType.depositPercent ?? 30}% online`);
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
      document.body.style.removeProperty("overflow");
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

  async function approveRoomType(roomType) {
    if (
      !window.confirm(
        `Phê duyệt loại phòng “${roomType.name}” và cho phép hiển thị công khai?`,
      )
    ) {
      return;
    }

    setActionId(roomType.id);
    setError("");
    setMessage("");

    try {
      await apiClient.patch(`/admin/room-types/${roomType.id}/approve`);
      setRoomTypes((current) =>
        current.filter((item) => item.id !== roomType.id),
      );

      if (detailRoomType?.id === roomType.id) {
        setDetailRoomType(null);
      }

      setMessage(`Đã phê duyệt loại phòng “${roomType.name}”.`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setActionId("");
    }
  }

  async function rejectRoomType(roomType) {
    const reason = window.prompt(
      `Nhập lý do từ chối loại phòng “${roomType.name}”:`,
      "",
    );

    if (reason === null) {
      return;
    }

    const normalizedReason = reason.trim();

    if (!normalizedReason) {
      setError("Vui lòng nhập lý do từ chối để đối tác biết cần chỉnh sửa gì.");
      return;
    }

    setActionId(roomType.id);
    setError("");
    setMessage("");

    try {
      await apiClient.patch(
        `/admin/room-types/${roomType.id}/reject`,
        { reason: normalizedReason },
      );

      setRoomTypes((current) =>
        current.filter((item) => item.id !== roomType.id),
      );

      if (detailRoomType?.id === roomType.id) {
        setDetailRoomType(null);
      }

      setMessage(`Đã từ chối loại phòng “${roomType.name}”.`);
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
        >
          <RefreshCw size={18} />
          Làm mới
        </button>
      </section>

      {error ? (
        <div className="admin-roomtype-notice error">{error}</div>
      ) : null}

      {message ? (
        <div className="admin-roomtype-notice success">{message}</div>
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
                    <img src={images[0].url} alt={roomType.name} />
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

                      <span className="admin-roomtype-status">
                        Chờ duyệt
                      </span>
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
                      {roomType.hotelName ?? roomType.hotel?.name ?? "Khách sạn"}
                    </span>

                    <span>
                      <Users size={16} />
                      {roomType.maxAdults ?? 0} người lớn ·{" "}
                      {roomType.maxChildren ?? 0} trẻ em
                    </span>

                    <span>
                      <Maximize2 size={16} />
                      {roomType.areaSqm ?? 0} m²
                    </span>

                    <span>
                      <BedDouble size={16} />
                      {roomType.bedCount ?? 0} ×{" "}
                      {roomType.bedType ?? "Chưa cập nhật"}
                    </span>

                    <span>
                      <BedDouble size={16} />
                      {roomType.roomCount ?? 0} phòng
                    </span>
                  </div>

                  <div className="admin-roomtype-chip-row">
                    <span>
                      {roomType.breakfastIncluded
                        ? "Có bữa sáng"
                        : "Không gồm bữa sáng"}
                    </span>

                    <span>
                      {roomType.refundable
                        ? "Có thể hoàn tiền"
                        : "Không hoàn tiền"}
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
                    disabled={actionId === roomType.id}
                    onClick={() => rejectRoomType(roomType)}
                  >
                    <XCircle size={17} />
                    Từ chối
                  </button>

                  <button
                    type="button"
                    className="admin-roomtype-approve"
                    disabled={actionId === roomType.id}
                    onClick={() => approveRoomType(roomType)}
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
                    >
                      <ChevronLeft size={28} />
                    </button>

                    <button
                      type="button"
                      className="admin-roomtype-gallery-arrow next"
                      onClick={nextImage}
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
                      "Khách sạn"}
                  </p>
                </div>

                <span className="admin-roomtype-status">Chờ duyệt</span>
              </div>

              <div className="admin-roomtype-detail-facts">
                <div>
                  <small>Giá cơ bản / đêm</small>
                  <strong>{money(detailRoomType.basePrice)}</strong>
                </div>

                <div>
                  <small>Diện tích</small>
                  <strong>{detailRoomType.areaSqm ?? 0} m²</strong>
                </div>

                <div>
                  <small>Sức chứa</small>
                  <strong>
                    {detailRoomType.maxAdults ?? 0} NL ·{" "}
                    {detailRoomType.maxChildren ?? 0} TE
                  </strong>
                </div>

                <div>
                  <small>Giường</small>
                  <strong>
                    {detailRoomType.bedCount ?? 0} ×{" "}
                    {detailRoomType.bedType ?? "—"}
                  </strong>
                </div>

                <div>
                  <small>Phòng</small>
                  <strong>{detailRoomType.roomCount ?? 0}</strong>
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
                          : "Không bao gồm"}
                      </small>
                    </span>
                  </div>

                  <div>
                    <WalletCards size={20} />
                    <span>
                      <strong>Hoàn tiền</strong>
                      <small>
                        {detailRoomType.refundable
                          ? "Có thể hoàn tiền"
                          : "Không hoàn tiền"}
                      </small>
                    </span>
                  </div>

                  <div>
                    <ShieldCheck size={20} />
                    <span>
                      <strong>Hút thuốc</strong>
                      <small>
                        {detailRoomType.smokingAllowed
                          ? "Cho phép hút thuốc"
                          : "Không hút thuốc"}
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
                  disabled={actionId === detailRoomType.id}
                  onClick={() => rejectRoomType(detailRoomType)}
                >
                  <XCircle size={18} />
                  Từ chối và ghi lý do
                </button>

                <button
                  type="button"
                  className="admin-roomtype-approve"
                  disabled={actionId === detailRoomType.id}
                  onClick={() => approveRoomType(detailRoomType)}
                >
                  <ShieldCheck size={18} />
                  Phê duyệt loại phòng
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}