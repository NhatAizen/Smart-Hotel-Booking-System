import {
  BedDouble,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  DoorOpen,
  Edit3,
  Image as ImageIcon,
  ImagePlus,
  MapPin,
  Plus,
  Save,
  Send,
  Star,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Loading from "../../components/common/Loading";
import HotelLocationPicker from "../../components/map/HotelLocationPicker";
import {
  deleteHotel,
  deleteHotelImage,
  getMyHotel,
  getMyHotels,
  setHotelCover,
  submitHotel,
  updateHotel,
  uploadHotelImages,
} from "../../services/hotelAdminService";
import {
  cities,
  hotelAmenities,
} from "./hotelCatalogOptions";

import "./HotelCatalogAdmin.css";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";

const HOTEL_CATALOG_CHANGED_KEY = "enziu:hotel-catalog-changed";

const labels = {
  DRAFT: "Bản nháp",
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Bị từ chối",
};

function errorMessage(error) {
  const response = error.response?.data;

  if (response?.validationErrors) {
    return Object.values(response.validationErrors).join(" · ");
  }

  return response?.message ?? "Không thể thực hiện thao tác.";
}

function resolveImageUrl(image) {
  if (!image) return "";
  if (typeof image === "string") return image;
  return image.imageUrl ?? image.url ?? image.fileUrl ?? image.publicUrl ?? "";
}

function notifyHotelImagesChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("enziu:hotel-images-changed"));
  window.localStorage.setItem(HOTEL_CATALOG_CHANGED_KEY, String(Date.now()));
}

function notifyHotelCatalogChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("enziu:hotel-catalog-changed"));
  window.localStorage.setItem(HOTEL_CATALOG_CHANGED_KEY, String(Date.now()));
}

function hotelImages(hotel) {
  const coverUrl = hotel?.coverImageUrl ?? "";
  const items = Array.isArray(hotel?.images) ? hotel.images : [];

  return items
    .map((image, index) => ({
      id: image?.id ?? image?.imageId ?? String(index),
      url: resolveImageUrl(image),
      isCover:
        Boolean(image?.cover ?? image?.isCover)
        || resolveImageUrl(image) === coverUrl,
      sortOrder: Number(image?.sortOrder ?? index),
    }))
    .filter((image) => image.url)
    .sort(
      (a, b) =>
        Number(b.isCover) - Number(a.isCover)
        || a.sortOrder - b.sortOrder,
    );
}

function createInfoForm(hotel) {
  return {
    name: hotel?.name ?? "",
    description: hotel?.description ?? "",
    address: hotel?.address ?? "",
    ward: hotel?.ward ?? "",
    district: hotel?.district ?? "",
    city: hotel?.city ?? "",
    phone: hotel?.phone ?? "",
    email: hotel?.email ?? "",
    starRating: Number(hotel?.starRating ?? 0),
    amenities: Array.from(hotel?.amenities ?? []),
  };
}

function normalizedText(value) {
  return String(value ?? "").trim();
}

export default function MyHotelsPage() {
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Modal chỉnh thông tin chung
  const [infoHotel, setInfoHotel] = useState(null);
  const [infoForm, setInfoForm] = useState(createInfoForm(null));

  // Modal ảnh
  const [editingHotel, setEditingHotel] = useState(null);
  const [newFiles, setNewFiles] = useState([]);

  // Modal giờ nhận/trả
  const [timeHotel, setTimeHotel] = useState(null);
  const [timeForm, setTimeForm] = useState({
    checkInTime: "14:00",
    checkOutTime: "12:00",
  });

  // Modal bản đồ
  const [locationHotel, setLocationHotel] = useState(null);
  const [locationDraft, setLocationDraft] = useState({
    latitude: null,
    longitude: null,
  });

  const previews = useMemo(
    () =>
      newFiles.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [newFiles],
  );

  useEffect(
    () => () =>
      previews.forEach((item) =>
        URL.revokeObjectURL(item.url),
      ),
    [previews],
  );

  async function loadHotels() {
    setLoading(true);
    setError("");

    try {
      const data = await getMyHotels();
      setHotels(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHotels();
  }, []);

  useRealtimeRefresh(
    "NOTIFICATION_CREATED",
    loadHotels,
    { debounceMs: 120 },
  );

  async function refreshHotel(hotelId) {
    const updated = await getMyHotel(hotelId);

    setEditingHotel(updated);
    setHotels((current) =>
      current.map((hotel) =>
        hotel.id === hotelId ? updated : hotel,
      ),
    );
  }

  async function handleSubmit(hotelId) {
    setBusyId(hotelId);
    setError("");
    setMessage("");

    try {
      const updated = await submitHotel(hotelId);

      setHotels((current) =>
        current.map((hotel) =>
          hotel.id === hotelId ? updated : hotel,
        ),
      );

      setMessage("Đã gửi hồ sơ khách sạn để xét duyệt.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId("");
    }
  }

  async function handleDeleteHotel(hotel) {
    const confirmed = window.confirm(
      `Xóa khách sạn "${hotel.name}" khỏi danh sách?\n\n`
      + "Khách sạn sẽ ngừng hoạt động và không còn hiển thị cho khách hàng.",
    );

    if (!confirmed) return;

    const deleteBusyId = `delete-${hotel.id}`;
    setBusyId(deleteBusyId);
    setError("");
    setMessage("");

    try {
      await deleteHotel(hotel.id);
      notifyHotelCatalogChanged();

      setHotels((current) =>
        current.filter((item) => item.id !== hotel.id),
      );

      setMessage(`Đã xóa khách sạn "${hotel.name}" khỏi danh sách.`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId("");
    }
  }

  // =========================================================
  // CHỈNH SỬA THÔNG TIN CHUNG KHÁCH SẠN
  // =========================================================

  function openInfoManager(hotel) {
    setInfoHotel(hotel);
    setInfoForm(createInfoForm(hotel));
    setError("");
    setMessage("");
  }

  function closeInfoManager() {
    if (busyId === "hotel-info") return;

    setInfoHotel(null);
    setInfoForm(createInfoForm(null));
    setError("");
  }

  function handleInfoChange(event) {
    const { name, value } = event.target;

    setError("");

    setInfoForm((current) => ({
      ...current,
      [name]:
        name === "starRating"
          ? Number(value)
          : value,
    }));
  }

  function toggleInfoAmenity(amenity) {
    setError("");

    setInfoForm((current) => ({
      ...current,
      amenities: current.amenities.includes(amenity)
        ? current.amenities.filter(
          (item) => item !== amenity,
        )
        : [...current.amenities, amenity],
    }));
  }

  async function saveHotelInfo(event) {
    event.preventDefault();

    if (!infoHotel) return;

    const name = normalizedText(infoForm.name);
    const description = normalizedText(infoForm.description);
    const address = normalizedText(infoForm.address);
    const ward = normalizedText(infoForm.ward);
    const district = normalizedText(infoForm.district);
    const city = normalizedText(infoForm.city);
    const phone = normalizedText(infoForm.phone);
    const email = normalizedText(infoForm.email);

    if (!name) {
      setError("Vui lòng nhập tên khách sạn.");
      return;
    }

    if (!description) {
      setError("Vui lòng nhập mô tả khách sạn.");
      return;
    }

    if (!address || !city) {
      setError("Vui lòng nhập đầy đủ địa chỉ và tỉnh/thành phố.");
      return;
    }

    if (!phone || !email) {
      setError("Vui lòng nhập số điện thoại và email liên hệ.");
      return;
    }

    const addressChanged =
      normalizedText(infoHotel.address) !== address
      || normalizedText(infoHotel.ward) !== ward
      || normalizedText(infoHotel.district) !== district
      || normalizedText(infoHotel.city) !== city;

    setBusyId("hotel-info");
    setError("");
    setMessage("");

    try {
      const updated = await updateHotel(infoHotel.id, {
        name,
        description,
        address,
        ward,
        district,
        city,

        // Nếu đổi địa chỉ thì để backend geocode lại.
        // Nếu không đổi địa chỉ thì giữ nguyên tọa độ hiện tại.
        latitude: addressChanged
          ? null
          : infoHotel.latitude ?? null,
        longitude: addressChanged
          ? null
          : infoHotel.longitude ?? null,

        phone,
        email,
        starRating: Number(infoForm.starRating ?? 0),

        // Giữ nguyên giờ nhận/trả ở modal riêng.
        checkInTime:
          infoHotel.checkInTime
            ? String(infoHotel.checkInTime).slice(0, 5)
            : null,
        checkOutTime:
          infoHotel.checkOutTime
            ? String(infoHotel.checkOutTime).slice(0, 5)
            : null,

        amenities: Array.from(infoForm.amenities ?? []),
        status: infoHotel.status ?? "ACTIVE",
      });

      setHotels((current) =>
        current.map((hotel) =>
          hotel.id === updated.id ? updated : hotel,
        ),
      );

      notifyHotelCatalogChanged();
      setInfoHotel(null);
      setInfoForm(createInfoForm(null));

      setMessage(
        addressChanged
          ? "Đã cập nhật thông tin và định vị lại địa chỉ khách sạn."
          : "Đã cập nhật thông tin khách sạn.",
      );
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId("");
    }
  }

  // =========================================================
  // ẢNH KHÁCH SẠN
  // =========================================================

  async function openImageManager(hotelId) {
    setBusyId(hotelId);
    setError("");

    try {
      setEditingHotel(await getMyHotel(hotelId));
      setNewFiles([]);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId("");
    }
  }

  function addFiles(event) {
    const selected = Array.from(event.target.files ?? []);

    setNewFiles((current) => {
      const known = new Set(
        current.map(
          (file) =>
            `${file.name}-${file.size}-${file.lastModified}`,
        ),
      );

      return [
        ...current,
        ...selected.filter(
          (file) =>
            !known.has(
              `${file.name}-${file.size}-${file.lastModified}`,
            ),
        ),
      ];
    });

    event.target.value = "";
  }

  async function uploadImages() {
    if (!editingHotel || newFiles.length === 0) return;

    setBusyId("upload");
    setError("");

    try {
      await uploadHotelImages(editingHotel.id, newFiles);
      notifyHotelImagesChanged();
      setNewFiles([]);
      await refreshHotel(editingHotel.id);
      setMessage("Đã tải thêm ảnh khách sạn.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId("");
    }
  }

  async function chooseCover(imageId) {
    setBusyId(imageId);
    setError("");

    try {
      await setHotelCover(editingHotel.id, imageId);
      notifyHotelImagesChanged();
      await refreshHotel(editingHotel.id);

      setMessage(
        "Đã đặt ảnh bìa. Ảnh này cũng được dùng làm "
        + "logo/ảnh đại diện khách sạn trong khu Hotel Admin.",
      );
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId("");
    }
  }

  async function removeImage(imageId) {
    if (!window.confirm("Xóa ảnh này khỏi khách sạn?")) return;

    setBusyId(imageId);
    setError("");

    try {
      await deleteHotelImage(editingHotel.id, imageId);
      notifyHotelImagesChanged();
      await refreshHotel(editingHotel.id);
      setMessage("Đã xóa ảnh khách sạn.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId("");
    }
  }

  // =========================================================
  // GIỜ NHẬN / TRẢ PHÒNG
  // =========================================================

  function openTimeManager(hotel) {
    setTimeHotel(hotel);

    setTimeForm({
      checkInTime:
        String(hotel.checkInTime ?? "14:00").slice(0, 5),
      checkOutTime:
        String(hotel.checkOutTime ?? "12:00").slice(0, 5),
    });

    setError("");
    setMessage("");
  }

  async function saveStayTimes(event) {
    event.preventDefault();

    if (!timeHotel) return;

    setBusyId("stay-times");
    setError("");
    setMessage("");

    try {
      const updated = await updateHotel(timeHotel.id, {
        name: timeHotel.name,
        description: timeHotel.description ?? "",
        address: timeHotel.address,
        ward: timeHotel.ward ?? "",
        district: timeHotel.district ?? "",
        city: timeHotel.city,
        latitude: timeHotel.latitude ?? null,
        longitude: timeHotel.longitude ?? null,
        phone: timeHotel.phone ?? "",
        email: timeHotel.email ?? "",
        starRating: Number(timeHotel.starRating ?? 0),
        checkInTime: timeForm.checkInTime,
        checkOutTime: timeForm.checkOutTime,
        amenities: Array.from(timeHotel.amenities ?? []),
        status: timeHotel.status ?? "ACTIVE",
      });

      setHotels((current) =>
        current.map((hotel) =>
          hotel.id === updated.id ? updated : hotel,
        ),
      );

      notifyHotelCatalogChanged();
      setTimeHotel(null);
      setMessage("Đã cập nhật giờ nhận và trả phòng.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId("");
    }
  }

  // =========================================================
  // VỊ TRÍ BẢN ĐỒ
  // =========================================================

  function openLocationManager(hotel) {
    setLocationHotel(hotel);

    setLocationDraft({
      latitude: hotel.latitude ?? null,
      longitude: hotel.longitude ?? null,
    });

    setError("");
    setMessage("");
  }

  async function saveLocation(event) {
    event.preventDefault();

    if (!locationHotel) return;

    if (
      locationDraft.latitude == null
      || locationDraft.longitude == null
    ) {
      setError(
        "Vui lòng chọn vị trí chính xác trên bản đồ trước khi lưu.",
      );
      return;
    }

    setBusyId("hotel-location");
    setError("");
    setMessage("");

    try {
      const updated = await updateHotel(locationHotel.id, {
        name: locationHotel.name,
        description: locationHotel.description ?? "",
        address: locationHotel.address,
        ward: locationHotel.ward ?? "",
        district: locationHotel.district ?? "",
        city: locationHotel.city,
        latitude: locationDraft.latitude,
        longitude: locationDraft.longitude,
        phone: locationHotel.phone ?? "",
        email: locationHotel.email ?? "",
        starRating: Number(locationHotel.starRating ?? 0),
        checkInTime:
          locationHotel.checkInTime
            ? String(locationHotel.checkInTime).slice(0, 5)
            : null,
        checkOutTime:
          locationHotel.checkOutTime
            ? String(locationHotel.checkOutTime).slice(0, 5)
            : null,
        amenities: Array.from(locationHotel.amenities ?? []),
        status: locationHotel.status ?? "ACTIVE",
      });

      setHotels((current) =>
        current.map((hotel) =>
          hotel.id === updated.id ? updated : hotel,
        ),
      );

      notifyHotelCatalogChanged();
      setLocationHotel(null);
      setMessage(
        "Đã lưu vị trí chính xác của khách sạn trên bản đồ.",
      );
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId("");
    }
  }

  if (loading) {
    return (
      <Loading message="Đang tải khách sạn của bạn..." />
    );
  }

  return (
    <div className="admin-page catalog-page">
      <section className="catalog-heading">
        <div>
          <span className="catalog-kicker">
            QUẢN LÝ CƠ SỞ LƯU TRÚ
          </span>

          <h1>Khách sạn của tôi</h1>

          <p>
            Quản lý hồ sơ, hình ảnh, vị trí, loại phòng
            và trạng thái xét duyệt của từng cơ sở.
          </p>
        </div>

        <Link
          to="/hotel-admin/hotels/create"
          className="catalog-primary"
        >
          <Plus size={18} />
          Đăng ký khách sạn
        </Link>
      </section>

      {error && !infoHotel ? (
        <div className="catalog-notice error">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="catalog-notice success">
          {message}
        </div>
      ) : null}

      {hotels.length === 0 ? (
        <section className="catalog-card catalog-empty">
          <Building2 size={48} />
          <h2>Bạn chưa có khách sạn</h2>
          <p>
            Hãy tạo hồ sơ khách sạn đầu tiên
            để bắt đầu kinh doanh.
          </p>
        </section>
      ) : (
        <section className="catalog-hotel-grid">
          {hotels.map((hotel) => (
            <article
              className="catalog-hotel-card"
              key={hotel.id}
            >
              <div className="catalog-hotel-cover">
                {hotel.coverImageUrl ? (
                  <img
                    src={hotel.coverImageUrl}
                    alt={hotel.name}
                  />
                ) : (
                  <div className="catalog-hotel-cover-empty">
                    <ImageIcon size={44} />
                  </div>
                )}

                <span
                  className={
                    `catalog-status ${
                      hotel.approvalStatus?.toLowerCase()
                      ?? "draft"
                    }`
                  }
                >
                  {hotel.approvalStatus === "APPROVED" ? (
                    <CheckCircle2 size={13} />
                  ) : hotel.approvalStatus === "REJECTED" ? (
                    <XCircle size={13} />
                  ) : (
                    <Clock3 size={13} />
                  )}

                  {" "}
                  {labels[hotel.approvalStatus]
                    ?? hotel.approvalStatus}
                </span>
              </div>

              <div className="catalog-hotel-body">
                <h2>{hotel.name}</h2>

                <div className="catalog-meta">
                  <MapPin size={16} />
                  {[
                    hotel.address,
                    hotel.ward,
                    hotel.district,
                    hotel.city,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </div>

                <div className="catalog-meta">
                  <Star size={16} />
                  {hotel.starRating
                    ? `${hotel.starRating} sao`
                    : "Chưa xếp hạng"}
                </div>

                <div className="catalog-meta">
                  <Clock3 size={16} />
                  Nhận phòng:{" "}
                  <strong>
                    {String(
                      hotel.checkInTime ?? "14:00",
                    ).slice(0, 5)}
                  </strong>
                  {" · "}
                  Trả phòng:{" "}
                  <strong>
                    {String(
                      hotel.checkOutTime ?? "12:00",
                    ).slice(0, 5)}
                  </strong>
                </div>

                <div className="catalog-counts">
                  <div>
                    <strong>
                      {hotel.images?.length ?? 0}
                    </strong>
                    <small>Hình ảnh</small>
                  </div>

                  <div>
                    <strong>
                      {hotel.roomTypeCount ?? 0}
                    </strong>
                    <small>Loại phòng</small>
                  </div>

                  <div>
                    <strong>
                      {hotel.roomCount ?? 0}
                    </strong>
                    <small>Phòng</small>
                  </div>
                </div>

                <div className="catalog-card-actions">
                  {/* NÚT MỚI */}
                  <button
                    type="button"
                    className="catalog-link-button"
                    onClick={() =>
                      openInfoManager(hotel)
                    }
                  >
                    <Edit3 size={16} />
                    Chỉnh sửa
                  </button>

                  <button
                    type="button"
                    className="catalog-link-button"
                    onClick={() =>
                      openImageManager(hotel.id)
                    }
                    disabled={busyId === hotel.id}
                  >
                    <ImageIcon size={16} />
                    Ảnh bìa
                  </button>

                  <Link
                    to={
                      `/hotel-admin/room-types`
                      + `?hotelId=${hotel.id}`
                    }
                    className="catalog-link-button"
                  >
                    <BedDouble size={16} />
                    Loại phòng
                  </Link>

                  <Link
                    to={
                      `/hotel-admin/rooms`
                      + `?hotelId=${hotel.id}`
                    }
                    className="catalog-link-button"
                  >
                    <DoorOpen size={16} />
                    Phòng
                  </Link>

                  <button
                    type="button"
                    className="catalog-link-button"
                    onClick={() =>
                      openTimeManager(hotel)
                    }
                  >
                    <Clock3 size={16} />
                    Giờ nhận/trả
                  </button>

                  <button
                    type="button"
                    className="catalog-link-button"
                    onClick={() =>
                      openLocationManager(hotel)
                    }
                  >
                    <MapPin size={16} />
                    Vị trí bản đồ
                  </button>

                  <button
                    type="button"
                    className="catalog-danger"
                    onClick={() =>
                      handleDeleteHotel(hotel)
                    }
                    disabled={
                      busyId === `delete-${hotel.id}`
                    }
                  >
                    <Trash2 size={16} />

                    {busyId === `delete-${hotel.id}`
                      ? "Đang xử lý..."
                      : "Ngừng hoạt động"}
                  </button>

                  {["DRAFT", "REJECTED"].includes(
                    hotel.approvalStatus,
                  ) ? (
                    <button
                      type="button"
                      className="catalog-primary"
                      onClick={() =>
                        handleSubmit(hotel.id)
                      }
                      disabled={busyId === hotel.id}
                    >
                      <Send size={16} />

                      {busyId === hotel.id
                        ? "Đang gửi..."
                        : "Gửi xét duyệt"}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {/* =====================================================
          MODAL CHỈNH SỬA THÔNG TIN CHUNG
          ===================================================== */}
      {infoHotel ? (
        <div
          className="room-detail-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeInfoManager();
            }
          }}
        >
          <form
            className="catalog-card hotel-location-manager"
            onSubmit={saveHotelInfo}
          >
            <button
              type="button"
              className="hotel-cover-manager-close"
              onClick={closeInfoManager}
              disabled={busyId === "hotel-info"}
              aria-label="Đóng"
            >
              <X size={20} />
            </button>

            <div className="catalog-section-title">
              <span>
                <Building2 size={22} />
              </span>

              <div>
                <h2>Chỉnh sửa khách sạn</h2>
                <p>
                  Cập nhật thông tin chung của{" "}
                  <strong>{infoHotel.name}</strong>.
                  Ảnh, giờ nhận/trả và vị trí chính xác
                  vẫn có khu vực quản lý riêng.
                </p>
              </div>
            </div>

            {error ? (
              <div className="catalog-notice error">
                {error}
              </div>
            ) : null}

            <div className="catalog-form-grid">
              <label className="catalog-field catalog-field-full">
                <span>Tên khách sạn *</span>
                <input
                  name="name"
                  value={infoForm.name}
                  onChange={handleInfoChange}
                  required
                  maxLength={150}
                />
              </label>

              <label className="catalog-field">
                <span>Số điện thoại *</span>
                <input
                  name="phone"
                  type="tel"
                  value={infoForm.phone}
                  onChange={handleInfoChange}
                  required
                  maxLength={30}
                />
              </label>

              <label className="catalog-field">
                <span>Email liên hệ *</span>
                <input
                  name="email"
                  type="email"
                  value={infoForm.email}
                  onChange={handleInfoChange}
                  required
                  maxLength={150}
                />
              </label>

              <label className="catalog-field">
                <span>Hạng sao</span>
                <select
                  name="starRating"
                  value={infoForm.starRating}
                  onChange={handleInfoChange}
                >
                  {[0, 1, 2, 3, 4, 5].map(
                    (rating) => (
                      <option
                        key={rating}
                        value={rating}
                      >
                        {rating === 0
                          ? "Chưa xếp hạng"
                          : `${rating} sao`}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label className="catalog-field">
                <span>Tỉnh/thành phố *</span>
                <select
                  name="city"
                  value={infoForm.city}
                  onChange={handleInfoChange}
                  required
                >
                  {!cities.includes(infoForm.city)
                    && infoForm.city ? (
                      <option value={infoForm.city}>
                        {infoForm.city}
                      </option>
                    ) : null}

                  <option value="" disabled>
                    Chọn tỉnh hoặc thành phố
                  </option>

                  {cities.map((city) => (
                    <option
                      key={city}
                      value={city}
                    >
                      {city}
                    </option>
                  ))}
                </select>
              </label>

              <label className="catalog-field catalog-field-full">
                <span>Mô tả khách sạn *</span>
                <textarea
                  name="description"
                  value={infoForm.description}
                  onChange={handleInfoChange}
                  required
                  maxLength={5000}
                  placeholder="Giới thiệu khách sạn..."
                />

                <small>
                  {infoForm.description.length}/5000 ký tự
                </small>
              </label>

              <label className="catalog-field catalog-field-full">
                <span>Số nhà, tên đường *</span>
                <input
                  name="address"
                  value={infoForm.address}
                  onChange={handleInfoChange}
                  required
                  maxLength={255}
                />
              </label>

              <label className="catalog-field">
                <span>Phường/xã</span>
                <input
                  name="ward"
                  value={infoForm.ward}
                  onChange={handleInfoChange}
                  maxLength={100}
                />
              </label>

              <label className="catalog-field">
                <span>Quận/huyện</span>
                <input
                  name="district"
                  value={infoForm.district}
                  onChange={handleInfoChange}
                  maxLength={100}
                />
              </label>

              <div className="catalog-field catalog-field-full">
                <span>Tiện nghi khách sạn</span>

                <div className="catalog-check-grid">
                  {hotelAmenities.map((amenity) => (
                    <label
                      className="catalog-check"
                      key={amenity}
                    >
                      <input
                        type="checkbox"
                        checked={
                          infoForm.amenities.includes(
                            amenity,
                          )
                        }
                        onChange={() =>
                          toggleInfoAmenity(amenity)
                        }
                      />
                      {amenity}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <p className="hotel-stay-time-note">
              Nếu bạn đổi địa chỉ, hệ thống sẽ thử
              định vị lại. Sau khi lưu, bạn có thể bấm
              <strong> Vị trí bản đồ </strong>
              để xác nhận đúng điểm ghim.
            </p>

            <div className="catalog-form-actions">
              <button
                type="button"
                className="catalog-secondary"
                onClick={closeInfoManager}
                disabled={busyId === "hotel-info"}
              >
                Hủy
              </button>

              <button
                type="submit"
                className="catalog-primary"
                disabled={busyId === "hotel-info"}
              >
                <Save size={17} />

                {busyId === "hotel-info"
                  ? "Đang lưu..."
                  : "Lưu thay đổi"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* =====================================================
          MODAL VỊ TRÍ
          ===================================================== */}
      {locationHotel ? (
        <div
          className="room-detail-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget
            && setLocationHotel(null)
          }
        >
          <form
            className="catalog-card hotel-location-manager"
            onSubmit={saveLocation}
          >
            <button
              type="button"
              className="hotel-cover-manager-close"
              onClick={() => setLocationHotel(null)}
            >
              <X size={20} />
            </button>

            <div className="catalog-section-title">
              <span>
                <MapPin size={22} />
              </span>

              <div>
                <h2>
                  Vị trí bản đồ của{" "}
                  {locationHotel.name}
                </h2>

                <p>
                  Bấm trực tiếp đúng vị trí khách sạn.
                  Tọa độ bạn xác nhận sẽ được lưu cho
                  bản đồ phía khách hàng.
                </p>
              </div>
            </div>

            <HotelLocationPicker
              address={locationHotel.address}
              ward={locationHotel.ward}
              district={locationHotel.district}
              city={locationHotel.city}
              latitude={locationDraft.latitude}
              longitude={locationDraft.longitude}
              onChange={setLocationDraft}
              height={420}
            />

            <div className="catalog-form-actions">
              <button
                type="button"
                className="catalog-secondary"
                onClick={() =>
                  setLocationHotel(null)
                }
              >
                Hủy
              </button>

              <button
                type="submit"
                className="catalog-primary"
                disabled={
                  busyId === "hotel-location"
                }
              >
                {busyId === "hotel-location"
                  ? "Đang lưu..."
                  : "Lưu vị trí"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* =====================================================
          MODAL GIỜ NHẬN / TRẢ
          ===================================================== */}
      {timeHotel ? (
        <div
          className="room-detail-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget
            && setTimeHotel(null)
          }
        >
          <form
            className="catalog-card hotel-stay-time-manager"
            onSubmit={saveStayTimes}
          >
            <button
              type="button"
              className="hotel-cover-manager-close"
              onClick={() => setTimeHotel(null)}
            >
              <X size={20} />
            </button>

            <div className="catalog-section-title">
              <span>
                <Clock3 size={22} />
              </span>

              <div>
                <h2>Giờ nhận và trả phòng</h2>
                <p>{timeHotel.name}</p>
              </div>
            </div>

            <div className="hotel-stay-time-grid">
              <label className="catalog-field">
                <span>
                  Khách được nhận phòng từ
                </span>

                <input
                  type="time"
                  value={timeForm.checkInTime}
                  onChange={(event) =>
                    setTimeForm((current) => ({
                      ...current,
                      checkInTime:
                        event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label className="catalog-field">
                <span>
                  Khách phải trả phòng trước
                </span>

                <input
                  type="time"
                  value={timeForm.checkOutTime}
                  onChange={(event) =>
                    setTimeForm((current) => ({
                      ...current,
                      checkOutTime:
                        event.target.value,
                    }))
                  }
                  required
                />
              </label>
            </div>

            <p className="hotel-stay-time-note">
              Giờ này sẽ hiển thị cho khách và được dùng
              để tính thời điểm nhận/trả phòng.
            </p>

            <div className="catalog-form-actions">
              <button
                type="button"
                className="catalog-secondary"
                onClick={() => setTimeHotel(null)}
              >
                Hủy
              </button>

              <button
                type="submit"
                className="catalog-primary"
                disabled={busyId === "stay-times"}
              >
                {busyId === "stay-times"
                  ? "Đang lưu..."
                  : "Lưu giờ nhận/trả"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* =====================================================
          MODAL QUẢN LÝ ẢNH
          ===================================================== */}
      {editingHotel ? (
        <div
          className="room-detail-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget
            && setEditingHotel(null)
          }
        >
          <section className="catalog-card hotel-cover-manager">
            <button
              type="button"
              className="hotel-cover-manager-close"
              onClick={() => setEditingHotel(null)}
            >
              <X size={20} />
            </button>

            <div className="catalog-section-title">
              <span>
                <ImageIcon size={22} />
              </span>

              <div>
                <h2>
                  Chọn ảnh đại diện cho{" "}
                  {editingHotel.name}
                </h2>

                <p>
                  Ảnh được đánh dấu “Ảnh bìa”
                  sẽ xuất hiện ngoài trang danh sách
                  khách sạn.
                </p>
              </div>
            </div>

            <div className="catalog-image-grid">
              {hotelImages(editingHotel).map(
                (image) => (
                  <div
                    className={
                      "catalog-image "
                      + "catalog-managed-image"
                    }
                    key={image.id}
                  >
                    <img
                      src={image.url}
                      alt={editingHotel.name}
                    />

                    {image.isCover ? (
                      <span className="catalog-image-cover">
                        <Check size={13} />
                        Ảnh bìa
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="catalog-set-cover"
                        onClick={() =>
                          chooseCover(image.id)
                        }
                        disabled={busyId === image.id}
                      >
                        Đặt làm ảnh bìa
                      </button>
                    )}

                    <button
                      type="button"
                      className="catalog-delete-image"
                      onClick={() =>
                        removeImage(image.id)
                      }
                      disabled={busyId === image.id}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ),
              )}
            </div>

            <div className="catalog-image-picker">
              <input
                id="more-hotel-images"
                type="file"
                accept={
                  "image/jpeg,image/png,"
                  + "image/webp,image/gif"
                }
                multiple
                onChange={addFiles}
              />

              <label htmlFor="more-hotel-images">
                <ImagePlus size={30} />
                <strong>Thêm ảnh mới</strong>
                <span>Có thể chọn nhiều ảnh</span>
              </label>
            </div>

            {previews.length ? (
              <>
                <div className="catalog-image-grid">
                  {previews.map(
                    (preview, index) => (
                      <div
                        className="catalog-image"
                        key={
                          `${preview.file.name}-${index}`
                        }
                      >
                        <img
                          src={preview.url}
                          alt="Ảnh mới"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            setNewFiles((current) =>
                              current.filter(
                                (_, itemIndex) =>
                                  itemIndex !== index,
                              ),
                            )
                          }
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ),
                  )}
                </div>

                <button
                  type="button"
                  className="catalog-primary"
                  onClick={uploadImages}
                  disabled={busyId === "upload"}
                >
                  {busyId === "upload"
                    ? "Đang tải..."
                    : `Tải lên ${newFiles.length} ảnh`}
                </button>
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}