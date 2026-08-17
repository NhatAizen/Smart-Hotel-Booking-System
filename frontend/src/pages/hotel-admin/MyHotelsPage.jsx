import {
  BedDouble,
  Building2,
  Check,
  Clock3,
  DoorOpen,
  Edit3,
  Image as ImageIcon,
  ImagePlus,
  MapPin,
  Plus,
  Send,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Loading from "../../components/common/Loading";
import HotelLocationPicker from "../../components/map/HotelLocationPicker";
import {
  EmptyState,
  PageHeader,
  StatusBadge,
} from "../../components/ui";
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
  statusLabel,
  statusTone,
} from "../../utils/presentation";

import "./HotelCatalogAdmin.css";
import "./HotelCatalogExperience.css";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";

const HOTEL_CATALOG_CHANGED_KEY = "enziu:hotel-catalog-changed";

const APPROVAL_LABELS = {
  PENDING: "Chờ duyệt",
  REJECTED: "Đã từ chối",
};

function errorMessage(error) {
  return error.response?.data?.message ?? "Không thể thực hiện thao tác.";
}

function resolveImageUrl(image) {
  if (!image) return "";
  if (typeof image === "string") return image;
  return image.imageUrl ?? image.url ?? image.fileUrl ?? image.publicUrl ?? "";
}

function approvalLabel(value) {
  if (!value) return "Chưa cập nhật";
  return statusLabel(value, APPROVAL_LABELS);
}

function stayTime(value) {
  return value ? String(value).slice(0, 5) : "Chưa cập nhật";
}

function countValue(value) {
  return value === null || value === undefined ? "—" : value;
}


function notifyHotelImagesChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("enziu:hotel-images-changed"));
  window.localStorage.setItem(HOTEL_CATALOG_CHANGED_KEY, String(Date.now()));
}

function hotelImages(hotel) {
  const coverUrl = hotel?.coverImageUrl ?? "";
  const items = Array.isArray(hotel?.images) ? hotel.images : [];

  return items
    .map((image, index) => ({
      id: image?.id ?? image?.imageId ?? String(index),
      url: resolveImageUrl(image),
      isCover: Boolean(image?.cover ?? image?.isCover) || resolveImageUrl(image) === coverUrl,
      sortOrder: Number(image?.sortOrder ?? index),
    }))
    .filter((image) => image.url)
    .sort((a, b) => Number(b.isCover) - Number(a.isCover) || a.sortOrder - b.sortOrder);
}

export default function MyHotelsPage() {
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingHotel, setEditingHotel] = useState(null);
  const [timeHotel, setTimeHotel] = useState(null);
  const [locationHotel, setLocationHotel] = useState(null);
  const [locationDraft, setLocationDraft] = useState({ latitude: null, longitude: null });
  const [timeForm, setTimeForm] = useState({ checkInTime: "", checkOutTime: "" });
  const [newFiles, setNewFiles] = useState([]);

  const previews = useMemo(
    () => newFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [newFiles],
  );

  useEffect(() => () => previews.forEach((item) => URL.revokeObjectURL(item.url)), [previews]);

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

  useRealtimeRefresh("NOTIFICATION_CREATED", loadHotels, { debounceMs: 120 });

  async function refreshHotel(hotelId) {
    const updated = await getMyHotel(hotelId);
    setEditingHotel(updated);
    setHotels((current) => current.map((hotel) => (hotel.id === hotelId ? updated : hotel)));
  }

  async function handleSubmit(hotelId) {
    setBusyId(hotelId);
    setError("");
    setMessage("");
    try {
      const updated = await submitHotel(hotelId);
      setHotels((current) => current.map((hotel) => (hotel.id === hotelId ? updated : hotel)));
      setMessage("Đã gửi hồ sơ khách sạn để xét duyệt.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId("");
    }
  }

  async function handleDeleteHotel(hotel) {
    const confirmed = window.confirm(
      `Ngừng hoạt động khách sạn "${hotel.name}"?\n\nKhách sạn sẽ không còn hiển thị cho khách hàng.`,
    );
    if (!confirmed) return;

    const deleteBusyId = `delete-${hotel.id}`;
    setBusyId(deleteBusyId);
    setError("");
    setMessage("");
    try {
      await deleteHotel(hotel.id);
      window.localStorage.setItem(HOTEL_CATALOG_CHANGED_KEY, String(Date.now()));
      setHotels((current) => current.filter((item) => item.id !== hotel.id));
      setMessage(`Đã ngừng hoạt động khách sạn "${hotel.name}".`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId("");
    }
  }

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
      const known = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      return [...current, ...selected.filter((file) => !known.has(`${file.name}-${file.size}-${file.lastModified}`))];
    });
    event.target.value = "";
  }


  function openTimeManager(hotel) {
    setTimeHotel(hotel);
    setTimeForm({
      checkInTime: hotel.checkInTime ? String(hotel.checkInTime).slice(0, 5) : "",
      checkOutTime: hotel.checkOutTime ? String(hotel.checkOutTime).slice(0, 5) : "",
    });
    setError("");
    setMessage("");
  }

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
    if (locationDraft.latitude == null || locationDraft.longitude == null) {
      setError("Vui lòng chọn vị trí chính xác trên bản đồ trước khi lưu.");
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
        checkInTime: locationHotel.checkInTime
          ? String(locationHotel.checkInTime).slice(0, 5)
          : null,
        checkOutTime: locationHotel.checkOutTime
          ? String(locationHotel.checkOutTime).slice(0, 5)
          : null,
        amenities: Array.from(locationHotel.amenities ?? []),
        status: locationHotel.status ?? "ACTIVE",
      });

      setHotels((current) => current.map((hotel) => (hotel.id === updated.id ? updated : hotel)));
      setLocationHotel(null);
      setMessage("Đã lưu vị trí chính xác của khách sạn trên bản đồ.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId("");
    }
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

      setHotels((current) => current.map((hotel) => (hotel.id === updated.id ? updated : hotel)));
      setTimeHotel(null);
      setMessage("Đã cập nhật giờ nhận và trả phòng.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId("");
    }
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
      setMessage("Đã đặt ảnh bìa. Ảnh này cũng được dùng làm logo/ảnh đại diện khách sạn trong khu Hotel Admin.");
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

  if (loading) return <Loading message="Đang tải khách sạn của bạn..." />;

  return (
    <div className="admin-page catalog-page catalog-experience catalog-hotels-page">
      <PageHeader
        className="catalog-heading catalog-experience__header"
        eyebrow="QUẢN LÝ CƠ SỞ LƯU TRÚ"
        title="Khách sạn của tôi"
        description="Quản lý hồ sơ, hình ảnh, vị trí, loại phòng và trạng thái xét duyệt của từng cơ sở."
        actions={(
          <Link to="/hotel-admin/hotels/create" className="catalog-primary">
            <Plus size={18} /> Đăng ký khách sạn
          </Link>
        )}
      />

      {error ? <div className="catalog-notice error">{error}</div> : null}
      {message ? <div className="catalog-notice success">{message}</div> : null}

      {hotels.length === 0 ? (
        <EmptyState
          className="catalog-card catalog-empty"
          icon={<Building2 size={48} />}
          title="Bạn chưa có khách sạn"
          description="Tạo hồ sơ cơ sở lưu trú đầu tiên để bắt đầu thiết lập loại phòng và vận hành."
          actions={(
            <Link to="/hotel-admin/hotels/create" className="catalog-primary">
              <Plus size={18} /> Đăng ký khách sạn
            </Link>
          )}
        />
      ) : (
        <section className="catalog-hotel-grid">
          {hotels.map((hotel) => (
            <article className="catalog-hotel-card" key={hotel.id}>
              <div className="catalog-hotel-cover">
                {hotel.coverImageUrl ? <img src={hotel.coverImageUrl} alt={hotel.name} /> : (
                  <div className="catalog-hotel-cover-empty"><ImageIcon size={44} /></div>
                )}
                <StatusBadge
                  className="catalog-status"
                  status={hotel.approvalStatus}
                  label={approvalLabel(hotel.approvalStatus)}
                  tone={statusTone(hotel.approvalStatus)}
                  size="sm"
                />
              </div>

              <div className="catalog-hotel-body">
                <h2>{hotel.name}</h2>
                <div className="catalog-meta"><MapPin size={16} />{[hotel.address, hotel.ward, hotel.district, hotel.city].filter(Boolean).join(", ") || "Chưa cập nhật địa chỉ"}</div>
                <div className="catalog-meta"><Star size={16} />{hotel.starRating ? `${hotel.starRating} sao` : "Chưa xếp hạng"}</div>
                <div className="catalog-meta catalog-stay-times">
                  <Clock3 size={16} />
                  <span>Nhận phòng: <strong>{stayTime(hotel.checkInTime)}</strong> · Trả phòng: <strong>{stayTime(hotel.checkOutTime)}</strong></span>
                </div>
                {hotel.approvalStatus === "REJECTED" ? (
                  <div className="catalog-rejection-callout" role="status">
                    <strong>Lý do từ chối</strong>
                    <span>{hotel.rejectionReason || "Chưa cập nhật"}</span>
                  </div>
                ) : null}
                <div className="catalog-counts">
                  <div><strong>{Array.isArray(hotel.images) ? hotel.images.length : "—"}</strong><small>Hình ảnh</small></div>
                  <div><strong>{countValue(hotel.roomTypeCount)}</strong><small>Loại phòng</small></div>
                  <div><strong>{countValue(hotel.roomCount)}</strong><small>Phòng</small></div>
                </div>
                <div className="catalog-card-actions">
                  <button type="button" className="catalog-link-button" onClick={() => openImageManager(hotel.id)} disabled={busyId === hotel.id}>
                    <Edit3 size={16} /> Ảnh bìa
                  </button>
                  <Link to={`/hotel-admin/room-types?hotelId=${hotel.id}`} className="catalog-link-button"><BedDouble size={16} /> Loại phòng</Link>
                  <Link to={`/hotel-admin/rooms?hotelId=${hotel.id}`} className="catalog-link-button"><DoorOpen size={16} /> Phòng</Link>
                  <button type="button" className="catalog-link-button" onClick={() => openTimeManager(hotel)}><Clock3 size={16} /> Giờ nhận/trả</button>
                  <button type="button" className="catalog-link-button" onClick={() => openLocationManager(hotel)}><MapPin size={16} /> Vị trí bản đồ</button>
                  <button
                    type="button"
                    className="catalog-danger"
                    onClick={() => handleDeleteHotel(hotel)}
                    disabled={busyId === `delete-${hotel.id}`}
                  >
                    <Trash2 size={16} />
                    {busyId === `delete-${hotel.id}` ? "Đang xử lý..." : "Ngừng hoạt động"}
                  </button>
                  {["DRAFT", "REJECTED"].includes(hotel.approvalStatus) ? (
                    <button type="button" className="catalog-primary" onClick={() => handleSubmit(hotel.id)} disabled={busyId === hotel.id}>
                      <Send size={16} />{busyId === hotel.id ? "Đang gửi..." : "Gửi xét duyệt"}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {locationHotel ? (
        <div className="room-detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setLocationHotel(null)}>
          <form className="catalog-card hotel-location-manager" onSubmit={saveLocation} role="dialog" aria-modal="true" aria-labelledby="hotel-location-title">
            <button type="button" className="hotel-cover-manager-close" onClick={() => setLocationHotel(null)} aria-label="Đóng hộp thoại vị trí"><X size={20} /></button>
            <div className="catalog-section-title">
              <span><MapPin size={22} /></span>
              <div>
                <h2 id="hotel-location-title">Vị trí bản đồ của {locationHotel.name}</h2>
                <p>Nếu kết quả định vị chưa chính xác, hãy chọn trực tiếp đúng vị trí trên bản đồ trước khi lưu.</p>
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
              <button type="button" className="catalog-secondary" onClick={() => setLocationHotel(null)}>Hủy</button>
              <button type="submit" className="catalog-primary" disabled={busyId === "hotel-location"}>
                {busyId === "hotel-location" ? "Đang lưu..." : "Lưu vị trí"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {timeHotel ? (
        <div className="room-detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setTimeHotel(null)}>
          <form className="catalog-card hotel-stay-time-manager" onSubmit={saveStayTimes} role="dialog" aria-modal="true" aria-labelledby="hotel-stay-time-title">
            <button type="button" className="hotel-cover-manager-close" onClick={() => setTimeHotel(null)} aria-label="Đóng hộp thoại giờ nhận trả phòng"><X size={20} /></button>
            <div className="catalog-section-title">
              <span><Clock3 size={22} /></span>
              <div><h2 id="hotel-stay-time-title">Giờ nhận và trả phòng</h2><p>{timeHotel.name}</p></div>
            </div>
            <div className="hotel-stay-time-grid">
              <label className="catalog-field">
                <span>Khách được nhận phòng từ</span>
                <input type="time" value={timeForm.checkInTime} onChange={(event) => setTimeForm((current) => ({ ...current, checkInTime: event.target.value }))} required />
              </label>
              <label className="catalog-field">
                <span>Khách phải trả phòng trước</span>
                <input type="time" value={timeForm.checkOutTime} onChange={(event) => setTimeForm((current) => ({ ...current, checkOutTime: event.target.value }))} required />
              </label>
            </div>
            <p className="hotel-stay-time-note">Giờ này sẽ hiển thị cho khách và được dùng để tính thời điểm trả phòng.</p>
            <div className="catalog-form-actions">
              <button type="button" className="catalog-secondary" onClick={() => setTimeHotel(null)}>Hủy</button>
              <button type="submit" className="catalog-primary" disabled={busyId === "stay-times"}>{busyId === "stay-times" ? "Đang lưu..." : "Lưu giờ nhận/trả"}</button>
            </div>
          </form>
        </div>
      ) : null}

      {editingHotel ? (
        <div className="room-detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setEditingHotel(null)}>
          <section className="catalog-card hotel-cover-manager" role="dialog" aria-modal="true" aria-labelledby="hotel-cover-manager-title">
            <button type="button" className="hotel-cover-manager-close" onClick={() => setEditingHotel(null)} aria-label="Đóng trình quản lý ảnh"><X size={20} /></button>
            <div className="catalog-section-title">
              <span><ImageIcon size={22} /></span>
              <div><h2 id="hotel-cover-manager-title">Chọn ảnh đại diện cho {editingHotel.name}</h2><p>Ảnh được đánh dấu “Ảnh bìa” sẽ xuất hiện ngoài trang danh sách khách sạn.</p></div>
            </div>

            <div className="catalog-image-grid">
              {hotelImages(editingHotel).map((image) => (
                <div className="catalog-image catalog-managed-image" key={image.id}>
                  <img src={image.url} alt={editingHotel.name} />
                  {image.isCover ? <span className="catalog-image-cover"><Check size={13} /> Ảnh bìa</span> : (
                    <button type="button" className="catalog-set-cover" onClick={() => chooseCover(image.id)} disabled={busyId === image.id}>Đặt làm ảnh bìa</button>
                  )}
                  <button type="button" className="catalog-delete-image" onClick={() => removeImage(image.id)} disabled={busyId === image.id} aria-label={`Xóa ảnh của ${editingHotel.name}`}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>

            <div className="catalog-image-picker">
              <input id="more-hotel-images" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={addFiles} />
              <label htmlFor="more-hotel-images"><ImagePlus size={30} /><strong>Thêm ảnh mới</strong><span>Có thể chọn nhiều ảnh</span></label>
            </div>

            {previews.length ? (
              <><div className="catalog-image-grid">{previews.map((preview, index) => (
                <div className="catalog-image" key={`${preview.file.name}-${index}`}><img src={preview.url} alt="Ảnh mới" /><button type="button" onClick={() => setNewFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button></div>
              ))}</div>
              <button type="button" className="catalog-primary" onClick={uploadImages} disabled={busyId === "upload"}>{busyId === "upload" ? "Đang tải..." : `Tải lên ${newFiles.length} ảnh`}</button></>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
