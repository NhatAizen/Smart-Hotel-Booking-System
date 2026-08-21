import {
  BadgeCheck,
  Building2,
  Clock3,
  ExternalLink,
  Eye,
  ImageIcon,
  Images,
  Mail,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  ShieldCheck,
  Star,
  XCircle,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import { Modal, StatusBadge } from "../../components/ui";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";
import {
  approveHotel,
  getPendingHotels,
  rejectHotel,
} from "../../services/adminService";
import {
  hotelStoredPosition,
  loadLeaflet,
} from "../../utils/openStreetMap";

import "../../styles/components/modal.css";
import "./ManageHotelsPage.css";

function resolveImageUrl(image) {
  if (!image) return "";
  if (typeof image === "string") return image;

  return image.imageUrl ?? image.url ?? image.fileUrl ?? image.publicUrl ?? "";
}

function hotelImages(hotel) {
  const values = [
    resolveImageUrl(hotel?.coverImageUrl),
    resolveImageUrl(hotel?.imageUrl),
    resolveImageUrl(hotel?.coverImage),
    ...(Array.isArray(hotel?.images)
      ? hotel.images.map(resolveImageUrl)
      : []),
  ].filter(Boolean);

  return [...new Set(values)];
}

function hotelCoverUrl(hotel) {
  return hotelImages(hotel)[0] ?? "";
}

function hotelAddress(hotel) {
  const parts = [hotel?.address, hotel?.ward, hotel?.district, hotel?.city]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);

  return [...new Set(parts)].join(", ") || "Chưa cập nhật địa chỉ";
}

function hotelAmenities(hotel) {
  const source = Array.isArray(hotel?.amenities) ? hotel.amenities : [];

  return source
    .map((item) => {
      if (typeof item === "string") return item.trim();
      return String(item?.name ?? item?.label ?? item?.amenityName ?? "").trim();
    })
    .filter(Boolean);
}

function formatTime(value) {
  if (!value) return "Chưa thiết lập";

  const text = String(value).trim();
  const match = text.match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : text;
}

function openStreetMapUrl(hotel) {
  const position = hotelStoredPosition(hotel);
  if (!position) return "";

  const { lat, lng } = position;
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}

function HotelReviewMap({ hotel }) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const [mapError, setMapError] = useState("");
  const position = hotelStoredPosition(hotel);
  const latitude = position?.lat ?? null;
  const longitude = position?.lng ?? null;

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      if (!mapNodeRef.current || latitude === null || longitude === null) return;

      setMapError("");

      try {
        const L = await loadLeaflet();
        if (cancelled || !mapNodeRef.current) return;

        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }

        const map = L.map(mapNodeRef.current, {
          center: [latitude, longitude],
          zoom: 17,
          zoomControl: true,
          attributionControl: true,
          scrollWheelZoom: false,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        }).addTo(map);

        L.marker([latitude, longitude]).addTo(map);

        mapRef.current = map;
        window.setTimeout(() => map.invalidateSize(), 80);
      } catch {
        if (!cancelled) {
          setMapError("Không thể tải OpenStreetMap lúc này.");
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [hotel, latitude, longitude]);

  if (latitude === null || longitude === null) {
    return (
      <div className="manage-hotels-review__map-empty">
        <MapPin size={28} aria-hidden="true" />
        <strong>Khách sạn chưa lưu tọa độ</strong>
        <span>Cần yêu cầu đối tác ghim vị trí chính xác trước khi phê duyệt.</span>
      </div>
    );
  }

  return (
    <div className="manage-hotels-review__map-wrap">
      {mapError ? (
        <div className="manage-hotels-review__map-warning">{mapError}</div>
      ) : null}
      <div ref={mapNodeRef} className="manage-hotels-review__map" />
    </div>
  );
}

export default function ManageHotelsPage() {
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewTarget, setReviewTarget] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState(null);

  const loadHotels = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getPendingHotels();
      setHotels(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? "Không thể tải khách sạn chờ duyệt.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHotels();
  }, [loadHotels]);

  useRealtimeRefresh("NOTIFICATION_CREATED", loadHotels, { debounceMs: 120 });

  const reviewImages = useMemo(
    () => (reviewTarget ? hotelImages(reviewTarget) : []),
    [reviewTarget],
  );

  const reviewAmenities = useMemo(
    () => (reviewTarget ? hotelAmenities(reviewTarget) : []),
    [reviewTarget],
  );

  function openReview(hotel) {
    if (busyId) return;
    setError("");
    setReviewTarget(hotel);
  }

  function closeReview() {
    if (busyId) return;
    setReviewTarget(null);
    setError("");
  }

  async function confirmApprove() {
    const hotel = reviewTarget;
    if (!hotel || busyId) return;

    setBusyId(hotel.id);
    setError("");

    try {
      await approveHotel(hotel.id);
      setHotels((current) => current.filter((item) => item.id !== hotel.id));
      setReviewTarget(null);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? "Duyệt khách sạn thất bại.",
      );
    } finally {
      setBusyId(null);
    }
  }

  function openRejectModal(hotel) {
    if (busyId) return;
    setRejecting(hotel);
    setReviewTarget(null);
    setReason("");
    setError("");
  }

  function closeRejectModal() {
    if (busyId) return;
    setRejecting(null);
    setReason("");
    setError("");
  }

  async function handleReject() {
    if (!rejecting || busyId) return;

    if (!reason.trim()) {
      setError("Vui lòng nhập lý do từ chối.");
      return;
    }

    setBusyId(rejecting.id);
    setError("");

    try {
      await rejectHotel(rejecting.id, reason.trim());
      setHotels((current) => current.filter((item) => item.id !== rejecting.id));
      setRejecting(null);
      setReason("");
    } catch (requestError) {
      setError(
        requestError.response?.data?.message
          ?? "Từ chối khách sạn thất bại.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="admin-page manage-hotels-page">
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">DUYỆT KHÁCH SẠN</span>
          <h1>Khách sạn chờ duyệt</h1>
          <p>
            Kiểm tra hồ sơ, hình ảnh, thông tin vận hành và vị trí thực tế trước khi công khai khách sạn.
          </p>
        </div>

        <button
          type="button"
          className="admin-secondary-button"
          onClick={loadHotels}
          disabled={loading || Boolean(busyId)}
          aria-busy={loading || undefined}
        >
          <RefreshCw size={18} aria-hidden="true" />
          Làm mới
        </button>
      </div>

      <ErrorMessage message={!reviewTarget && !rejecting ? error : ""} onRetry={loadHotels} />

      {loading ? (
        <Loading />
      ) : hotels.length === 0 ? (
        <div className="admin-empty-state">
          <Building2 size={48} />
          <strong>Không có khách sạn chờ duyệt</strong>
          <span>Tất cả đăng ký khách sạn đã được xử lý.</span>
        </div>
      ) : (
        <div className="admin-card-list">
          {hotels.map((hotel) => (
            <article key={hotel.id} className="admin-review-card">
              <div className="admin-review-main">
                <div className="manage-hotels-page__cover">
                  {hotelCoverUrl(hotel) ? (
                    <img
                      src={hotelCoverUrl(hotel)}
                      alt={`Ảnh ${hotel.name}`}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="manage-hotels-page__cover-empty">
                      <ImageIcon size={28} aria-hidden="true" />
                      Chưa có ảnh
                    </span>
                  )}
                </div>

                <div className="manage-hotels-page__content">
                  <div className="admin-review-title-row">
                    <h2>{hotel.name}</h2>
                    <StatusBadge
                      status={hotel.status ?? "PENDING_APPROVAL"}
                      label="Chờ duyệt"
                      size="sm"
                    />
                  </div>

                  <p>{hotel.description || "Chưa có mô tả"}</p>

                  <div className="admin-review-meta">
                    <span>
                      <MapPin size={15} aria-hidden="true" />
                      {hotelAddress(hotel)}
                    </span>
                    <span>
                      <Phone size={15} aria-hidden="true" />
                      {hotel.phone || "Chưa cập nhật số điện thoại"}
                    </span>
                    <span>
                      <Mail size={15} aria-hidden="true" />
                      {hotel.email || "Chưa cập nhật email"}
                    </span>
                    <span>
                      <Star size={15} aria-hidden="true" />
                      {hotel.starRating === null || hotel.starRating === undefined
                        ? "Chưa cập nhật hạng sao"
                        : `${hotel.starRating}/5 sao`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="admin-card-actions manage-hotels-page__actions">
                <button
                  type="button"
                  className="admin-secondary-button manage-hotels-page__details-button"
                  onClick={() => openReview(hotel)}
                  disabled={Boolean(busyId)}
                >
                  <Eye size={17} aria-hidden="true" />
                  Xem hồ sơ
                </button>

                <button
                  type="button"
                  className="admin-reject-button"
                  onClick={() => openRejectModal(hotel)}
                  disabled={Boolean(busyId)}
                >
                  <XCircle size={17} aria-hidden="true" />
                  Từ chối
                </button>

                <button
                  type="button"
                  className="admin-approve-button"
                  onClick={() => openReview(hotel)}
                  disabled={Boolean(busyId)}
                >
                  <BadgeCheck size={17} aria-hidden="true" />
                  Phê duyệt
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(reviewTarget)}
        onClose={closeReview}
        title="Hồ sơ xét duyệt khách sạn"
        description={
          reviewTarget
            ? `Kiểm tra toàn bộ thông tin của “${reviewTarget.name}” trước khi đưa lên EnziuRooms.`
            : undefined
        }
        size="xl"
        className="manage-hotels-dialog manage-hotels-review-dialog"
        bodyClassName="manage-hotels-review"
        closeOnBackdrop={!busyId}
        closeOnEscape={!busyId}
        hideCloseButton={Boolean(busyId)}
        footer={
          reviewTarget ? (
            <>
              <button
                type="button"
                className="admin-reject-button"
                onClick={() => openRejectModal(reviewTarget)}
                disabled={Boolean(busyId)}
              >
                <XCircle size={17} aria-hidden="true" />
                Từ chối hồ sơ
              </button>

              <button
                type="button"
                className="admin-cancel-button"
                onClick={closeReview}
                disabled={Boolean(busyId)}
              >
                Đóng
              </button>

              <button
                type="button"
                className="admin-approve-button"
                onClick={() => void confirmApprove()}
                disabled={busyId === reviewTarget.id}
                aria-busy={busyId === reviewTarget.id || undefined}
              >
                <BadgeCheck size={17} aria-hidden="true" />
                {busyId === reviewTarget.id
                  ? "Đang xử lý..."
                  : "Phê duyệt khách sạn"}
              </button>
            </>
          ) : null
        }
      >
        <ErrorMessage message={reviewTarget ? error : ""} />

        {reviewTarget ? (
          <>
            <section className="manage-hotels-review__hero">
              <div className="manage-hotels-review__hero-image">
                {hotelCoverUrl(reviewTarget) ? (
                  <img
                    src={hotelCoverUrl(reviewTarget)}
                    alt={`Ảnh bìa ${reviewTarget.name}`}
                  />
                ) : (
                  <span>
                    <ImageIcon size={34} aria-hidden="true" />
                    Chưa có ảnh bìa
                  </span>
                )}
              </div>

              <div className="manage-hotels-review__hero-content">
                <div className="manage-hotels-review__status-row">
                  <StatusBadge
                    status={reviewTarget.status ?? "PENDING_APPROVAL"}
                    label="Đang chờ kiểm duyệt"
                    size="sm"
                  />
                  <span className="manage-hotels-review__star">
                    <Star size={16} fill="currentColor" aria-hidden="true" />
                    {reviewTarget.starRating === null || reviewTarget.starRating === undefined
                      ? "Chưa xếp hạng"
                      : `${reviewTarget.starRating}/5 sao`}
                  </span>
                </div>

                <h3>{reviewTarget.name}</h3>
                <p>{reviewTarget.description || "Khách sạn chưa cập nhật mô tả."}</p>

                <div className="manage-hotels-review__hero-meta">
                  <span>
                    <MapPin size={16} aria-hidden="true" />
                    {hotelAddress(reviewTarget)}
                  </span>
                  <span>
                    <Phone size={16} aria-hidden="true" />
                    {reviewTarget.phone || "Chưa có số điện thoại"}
                  </span>
                  <span>
                    <Mail size={16} aria-hidden="true" />
                    {reviewTarget.email || "Chưa có email"}
                  </span>
                </div>
              </div>
            </section>

            <div className="manage-hotels-review__info-grid">
              <section className="manage-hotels-review__section">
                <div className="manage-hotels-review__section-title">
                  <ShieldCheck size={19} aria-hidden="true" />
                  <div>
                    <strong>Thông tin vận hành</strong>
                    <span>Thông tin khách hàng sẽ nhìn thấy khi đặt phòng.</span>
                  </div>
                </div>

                <dl className="manage-hotels-review__facts">
                  <div>
                    <dt>Hạng khách sạn</dt>
                    <dd>
                      {reviewTarget.starRating === null || reviewTarget.starRating === undefined
                        ? "Chưa cập nhật"
                        : `${reviewTarget.starRating} sao`}
                    </dd>
                  </div>
                  <div>
                    <dt>Giờ nhận phòng</dt>
                    <dd>{formatTime(reviewTarget.checkInTime)}</dd>
                  </div>
                  <div>
                    <dt>Giờ trả phòng</dt>
                    <dd>{formatTime(reviewTarget.checkOutTime)}</dd>
                  </div>
                  <div>
                    <dt>Trạng thái hồ sơ</dt>
                    <dd>Chờ System Admin kiểm duyệt</dd>
                  </div>
                </dl>
              </section>

              <section className="manage-hotels-review__section">
                <div className="manage-hotels-review__section-title">
                  <Clock3 size={19} aria-hidden="true" />
                  <div>
                    <strong>Liên hệ khách sạn</strong>
                    <span>Dùng để đối chiếu trước khi công khai.</span>
                  </div>
                </div>

                <dl className="manage-hotels-review__facts manage-hotels-review__facts--single">
                  <div>
                    <dt>Số điện thoại</dt>
                    <dd>{reviewTarget.phone || "Chưa cập nhật"}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{reviewTarget.email || "Chưa cập nhật"}</dd>
                  </div>
                  {reviewTarget.ownerName || reviewTarget.partnerName ? (
                    <div>
                      <dt>Người đăng ký</dt>
                      <dd>{reviewTarget.ownerName || reviewTarget.partnerName}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            </div>

            <section className="manage-hotels-review__section manage-hotels-review__location-section">
              <div className="manage-hotels-review__section-title manage-hotels-review__section-title--spread">
                <div className="manage-hotels-review__section-title-main">
                  <Navigation size={19} aria-hidden="true" />
                  <div>
                    <strong>Địa chỉ & vị trí OpenStreetMap</strong>
                    <span>Đối chiếu địa chỉ khai báo với pin tọa độ do Hotel Admin lưu.</span>
                  </div>
                </div>

                {openStreetMapUrl(reviewTarget) ? (
                  <a
                    className="manage-hotels-review__osm-link"
                    href={openStreetMapUrl(reviewTarget)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mở trên OpenStreetMap
                    <ExternalLink size={15} aria-hidden="true" />
                  </a>
                ) : null}
              </div>

              <div className="manage-hotels-review__address-card">
                <MapPin size={18} aria-hidden="true" />
                <div>
                  <strong>{hotelAddress(reviewTarget)}</strong>
                  {hotelStoredPosition(reviewTarget) ? (
                    <span>
                      Tọa độ đã lưu: {hotelStoredPosition(reviewTarget).lat.toFixed(6)}, {" "}
                      {hotelStoredPosition(reviewTarget).lng.toFixed(6)}
                    </span>
                  ) : (
                    <span>Chưa có tọa độ được lưu.</span>
                  )}
                </div>
              </div>

              <HotelReviewMap hotel={reviewTarget} />
            </section>

            <section className="manage-hotels-review__section">
              <div className="manage-hotels-review__section-title">
                <ShieldCheck size={19} aria-hidden="true" />
                <div>
                  <strong>Tiện nghi chung</strong>
                  <span>Các tiện ích do khách sạn khai báo.</span>
                </div>
              </div>

              {reviewAmenities.length ? (
                <div className="manage-hotels-review__amenities">
                  {reviewAmenities.map((amenity) => (
                    <span key={amenity}>{amenity}</span>
                  ))}
                </div>
              ) : (
                <p className="manage-hotels-review__muted">
                  Khách sạn chưa khai báo tiện nghi chung.
                </p>
              )}
            </section>

            <section className="manage-hotels-review__section">
              <div className="manage-hotels-review__section-title">
                <Images size={19} aria-hidden="true" />
                <div>
                  <strong>Hình ảnh khách sạn</strong>
                  <span>{reviewImages.length} ảnh trong hồ sơ.</span>
                </div>
              </div>

              {reviewImages.length ? (
                <div className="manage-hotels-review__gallery">
                  {reviewImages.map((image, index) => (
                    <a
                      key={image}
                      href={image}
                      target="_blank"
                      rel="noreferrer"
                      className={index === 0 ? "is-cover" : ""}
                    >
                      <img
                        src={image}
                        alt={`${reviewTarget.name} - ảnh ${index + 1}`}
                        loading={index === 0 ? "eager" : "lazy"}
                      />
                      {index === 0 ? <span>Ảnh bìa</span> : null}
                    </a>
                  ))}
                </div>
              ) : (
                <div className="manage-hotels-review__gallery-empty">
                  <ImageIcon size={30} aria-hidden="true" />
                  Khách sạn chưa có hình ảnh để kiểm duyệt.
                </div>
              )}
            </section>

            <div className="manage-hotels-review__approval-note">
              <BadgeCheck size={20} aria-hidden="true" />
              <div>
                <strong>Trước khi phê duyệt</strong>
                <p>
                  Hãy kiểm tra hình ảnh, thông tin liên hệ, mô tả, giờ vận hành và đặc biệt là pin OpenStreetMap có đúng với địa chỉ khách sạn hay không.
                </p>
              </div>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(rejecting)}
        onClose={closeRejectModal}
        title="Từ chối khách sạn"
        description={
          rejecting
            ? `Gửi lý do cụ thể để “${rejecting.name}” có thể chỉnh sửa hồ sơ.`
            : undefined
        }
        size="sm"
        className="manage-hotels-dialog manage-hotels-dialog--reject"
        bodyClassName="manage-hotels-dialog__body"
        closeOnBackdrop={!busyId}
        closeOnEscape={!busyId}
        footer={
          <>
            <button
              type="button"
              className="admin-cancel-button"
              onClick={closeRejectModal}
              disabled={Boolean(busyId)}
            >
              Hủy
            </button>
            <button
              type="button"
              className="admin-reject-button"
              onClick={() => void handleReject()}
              disabled={!reason.trim() || busyId === rejecting?.id}
              aria-busy={busyId === rejecting?.id || undefined}
            >
              {busyId === rejecting?.id ? "Đang xử lý..." : "Xác nhận từ chối"}
            </button>
          </>
        }
      >
        <ErrorMessage message={rejecting ? error : ""} />

        <label className="admin-form-field manage-hotels-page__reject-field">
          <span>Lý do từ chối</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={5}
            maxLength={500}
            required
            autoFocus
            placeholder="Nêu rõ thông tin cần bổ sung hoặc điều chỉnh..."
          />
          <small>{reason.length}/500 ký tự</small>
        </label>
      </Modal>
    </div>
  );
}
