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

import "./HotelCatalogAdmin.css";

const HOTEL_CATALOG_CHANGED_KEY = "enziu:hotel-catalog-changed";

const labels = {
  DRAFT: "Bản nháp",
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Bị từ chối",
};

function errorMessage(error) {
  return error.response?.data?.message ?? "Không thể thực hiện thao tác.";
}

function resolveImageUrl(image) {
  if (!image) return "";
  if (typeof image === "string") return image;
  return image.imageUrl ?? image.url ?? image.fileUrl ?? image.publicUrl ?? "";
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
  const [timeForm, setTimeForm] = useState({ checkInTime: "14:00", checkOutTime: "12:00" });
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
      setMessage("Đã gửi hồ sơ khách sạn cho System Admin xét duyệt.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId("");
    }
  }

  async function handleDeleteHotel(hotel) {
    const confirmed = window.confirm(
      `Xóa khách sạn "${hotel.name}" khỏi danh sách?\n\nKhách sạn sẽ ngừng hoạt động và không còn hiển thị cho khách hàng.`,
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
      setMessage(`Đã xóa khách sạn "${hotel.name}" khỏi danh sách.`);
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
      checkInTime: String(hotel.checkInTime ?? "14:00").slice(0, 5),
      checkOutTime: String(hotel.checkOutTime ?? "12:00").slice(0, 5),
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
        checkInTime: String(locationHotel.checkInTime ?? "14:00").slice(0, 5),
        checkOutTime: String(locationHotel.checkOutTime ?? "12:00").slice(0, 5),
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
      await refreshHotel(editingHotel.id);
      setMessage("Đã đặt ảnh bìa. Ảnh này sẽ hiển thị ngoài danh sách khách sạn.");
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
    <div className="admin-page catalog-page">
      <section className="catalog-heading">
        <div>
          <span className="catalog-kicker">QUẢN LÝ CƠ SỞ LƯU TRÚ</span>
          <h1>Khách sạn của tôi</h1>
          <p>Quản lý thông tin, ảnh bìa, loại phòng và các phòng thực tế.</p>
        </div>
        <Link to="/hotel-admin/hotels/create" className="catalog-primary">
          <Plus size={18} /> Đăng ký khách sạn
        </Link>
      </section>

      {error ? <div className="catalog-notice error">{error}</div> : null}
      {message ? <div className="catalog-notice success">{message}</div> : null}

      {hotels.length === 0 ? (
        <section className="catalog-card catalog-empty">
          <Building2 size={48} />
          <h2>Bạn chưa có khách sạn</h2>
          <p>Hãy tạo hồ sơ khách sạn đầu tiên để bắt đầu kinh doanh.</p>
        </section>
      ) : (
        <section className="catalog-hotel-grid">
          {hotels.map((hotel) => (
            <article className="catalog-hotel-card" key={hotel.id}>
              <div className="catalog-hotel-cover">
                {hotel.coverImageUrl ? <img src={hotel.coverImageUrl} alt={hotel.name} /> : (
                  <div className="catalog-hotel-cover-empty"><ImageIcon size={44} /></div>
                )}
                <span className={`catalog-status ${hotel.approvalStatus?.toLowerCase() ?? "draft"}`}>
                  {hotel.approvalStatus === "APPROVED" ? <CheckCircle2 size={13} /> : hotel.approvalStatus === "REJECTED" ? <XCircle size={13} /> : <Clock3 size={13} />}
                  {" "}{labels[hotel.approvalStatus] ?? hotel.approvalStatus}
                </span>
              </div>

              <div className="catalog-hotel-body">
                <h2>{hotel.name}</h2>
                <div className="catalog-meta"><MapPin size={16} />{[hotel.address, hotel.ward, hotel.district, hotel.city].filter(Boolean).join(", ")}</div>
                <div className="catalog-meta"><Star size={16} />{hotel.starRating ? `${hotel.starRating} sao` : "Chưa xếp hạng"}</div>
                <div className="catalog-meta"><Clock3 size={16} />Nhận từ {String(hotel.checkInTime ?? "14:00").slice(0, 5)} · Trả trước {String(hotel.checkOutTime ?? "12:00").slice(0, 5)}</div>
                <div className="catalog-counts">
                  <div><strong>{hotel.images?.length ?? 0}</strong><small>Hình ảnh</small></div>
                  <div><strong>{hotel.roomTypeCount ?? 0}</strong><small>Loại phòng</small></div>
                  <div><strong>{hotel.roomCount ?? 0}</strong><small>Phòng</small></div>
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
                    {busyId === `delete-${hotel.id}` ? "Đang xóa..." : "Xóa"}
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
        <div className="room-detail-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setLocationHotel(null)}>
          <form className="catalog-card hotel-location-manager" onSubmit={saveLocation}>
            <button type="button" className="hotel-cover-manager-close" onClick={() => setLocationHotel(null)}><X size={20} /></button>
            <div className="catalog-section-title">
              <span><MapPin size={22} /></span>
              <div>
                <h2>Vị trí bản đồ của {locationHotel.name}</h2>
                <p>Không tự tin vào kết quả định vị thì hãy bấm trực tiếp đúng vị trí. Tọa độ bạn xác nhận sẽ được ưu tiên tuyệt đối.</p>
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
        <div className="room-detail-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setTimeHotel(null)}>
          <form className="catalog-card hotel-stay-time-manager" onSubmit={saveStayTimes}>
            <button type="button" className="hotel-cover-manager-close" onClick={() => setTimeHotel(null)}><X size={20} /></button>
            <div className="catalog-section-title">
              <span><Clock3 size={22} /></span>
              <div><h2>Giờ nhận và trả phòng</h2><p>{timeHotel.name}</p></div>
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
            <p className="hotel-stay-time-note">Giờ này sẽ hiển thị cho Customer và được dùng để tính thời hạn checkout tại quầy.</p>
            <div className="catalog-form-actions">
              <button type="button" className="catalog-secondary" onClick={() => setTimeHotel(null)}>Hủy</button>
              <button type="submit" className="catalog-primary" disabled={busyId === "stay-times"}>{busyId === "stay-times" ? "Đang lưu..." : "Lưu giờ nhận/trả"}</button>
            </div>
          </form>
        </div>
      ) : null}

      {editingHotel ? (
        <div className="room-detail-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setEditingHotel(null)}>
          <section className="catalog-card hotel-cover-manager">
            <button type="button" className="hotel-cover-manager-close" onClick={() => setEditingHotel(null)}><X size={20} /></button>
            <div className="catalog-section-title">
              <span><ImageIcon size={22} /></span>
              <div><h2>Chọn ảnh đại diện cho {editingHotel.name}</h2><p>Ảnh được đánh dấu “Ảnh bìa” sẽ xuất hiện ngoài trang danh sách khách sạn.</p></div>
            </div>

            <div className="catalog-image-grid">
              {hotelImages(editingHotel).map((image) => (
                <div className="catalog-image catalog-managed-image" key={image.id}>
                  <img src={image.url} alt={editingHotel.name} />
                  {image.isCover ? <span className="catalog-image-cover"><Check size={13} /> Ảnh bìa</span> : (
                    <button type="button" className="catalog-set-cover" onClick={() => chooseCover(image.id)} disabled={busyId === image.id}>Đặt làm ảnh bìa</button>
                  )}
                  <button type="button" className="catalog-delete-image" onClick={() => removeImage(image.id)} disabled={busyId === image.id}><Trash2 size={15} /></button>
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
