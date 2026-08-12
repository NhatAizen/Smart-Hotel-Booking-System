import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock3,
  ImagePlus,
  MapPin,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import HotelLocationPicker from "../../components/map/HotelLocationPicker";
import {
  createHotel,
  uploadHotelImages,
} from "../../services/hotelAdminService";
import {
  cities,
  hotelAmenities,
} from "./hotelCatalogOptions";

import "./HotelCatalogAdmin.css";

const initialForm = {
  name: "",
  description: "",
  address: "",
  ward: "",
  district: "",
  city: "Hồ Chí Minh",
  latitude: null,
  longitude: null,
  phone: "",
  email: "",
  starRating: 3,
  checkInTime: "14:00",
  checkOutTime: "12:00",
  amenities: [],
};

function errorMessage(error) {
  const response = error.response?.data;
  if (response?.validationErrors) {
    return Object.values(response.validationErrors).join(" · ");
  }
  return response?.message ?? "Không thể lưu khách sạn.";
}

export default function CreateHotelPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const previews = useMemo(
    () =>
      files.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [files],
  );

  function handleChange(event) {
    const { name, value } = event.target;
    setError("");

    setForm((current) => ({
      ...current,
      [name]: name === "starRating" ? Number(value) : value,
    }));
  }

  function toggleAmenity(value) {
    setForm((current) => ({
      ...current,
      amenities: current.amenities.includes(value)
        ? current.amenities.filter((item) => item !== value)
        : [...current.amenities, value],
    }));
  }

  function addFiles(event) {
    const selected = Array.from(event.target.files ?? []);
    setFiles((current) => [...current, ...selected]);
    event.target.value = "";
  }

  function removeFile(index) {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (files.length === 0) {
      setError("Vui lòng chọn ít nhất một ảnh khách sạn.");
      return;
    }

    if (form.latitude == null || form.longitude == null) {
      setError("Vui lòng xác nhận vị trí chính xác của khách sạn trên bản đồ.");
      return;
    }

    setSubmitting(true);

    try {
      const hotel = await createHotel({
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
        address: form.address.trim(),
        ward: form.ward.trim(),
        district: form.district.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
      });

      await uploadHotelImages(hotel.id, files);

      navigate(`/hotel-admin/room-types?hotelId=${hotel.id}`, {
        replace: true,
      });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-page catalog-page">
      <section className="catalog-heading">
        <div>
          <Link to="/hotel-admin/hotels" className="hotel-back-link">
            <ArrowLeft size={17} />
            Quay lại
          </Link>
          <span className="catalog-kicker">HỒ SƠ KHÁCH SẠN</span>
          <h1>Đăng ký khách sạn mới</h1>
          <p>
            Tạo hồ sơ nháp, tải ảnh, sau đó thêm loại phòng và số
            phòng thực tế trước khi gửi System Admin xét duyệt.
          </p>
        </div>
      </section>

      {error ? <div className="catalog-notice error">{error}</div> : null}

      <form className="catalog-form" onSubmit={handleSubmit}>
        <section className="catalog-card">
          <div className="catalog-section-title">
            <span><Building2 size={22} /></span>
            <div>
              <h2>Thông tin cơ bản</h2>
              <p>Tên, liên hệ và mô tả nổi bật của khách sạn.</p>
            </div>
          </div>

          <div className="catalog-form-grid">
            <label className="catalog-field catalog-field-full">
              <span>Tên khách sạn *</span>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Ví dụ: EnziuRooms Saigon Hotel"
                required
                maxLength={150}
              />
            </label>

            <label className="catalog-field">
              <span>Số điện thoại *</span>
              <input
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                placeholder="0909123456"
                required
                maxLength={30}
              />
            </label>

            <label className="catalog-field">
              <span>Email liên hệ *</span>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="hotel@enziurooms.vn"
                required
                maxLength={150}
              />
            </label>

            <label className="catalog-field">
              <span>Hạng sao</span>
              <select
                name="starRating"
                value={form.starRating}
                onChange={handleChange}
              >
                {[0, 1, 2, 3, 4, 5].map((rating) => (
                  <option key={rating} value={rating}>
                    {rating === 0 ? "Chưa xếp hạng" : `${rating} sao`}
                  </option>
                ))}
              </select>
            </label>

            <label className="catalog-field">
              <span>Thành phố *</span>
              <select
                name="city"
                value={form.city}
                onChange={handleChange}
                required
              >
                {cities.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </label>

            <label className="catalog-field catalog-field-full">
              <span>Mô tả khách sạn *</span>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Giới thiệu vị trí, phong cách, không gian và ưu điểm nổi bật..."
                required
                maxLength={5000}
              />
              <small>{form.description.length}/5000 ký tự</small>
            </label>
          </div>
        </section>

        <section className="catalog-card">
          <div className="catalog-section-title">
            <span><MapPin size={22} /></span>
            <div>
              <h2>Địa chỉ khách sạn</h2>
              <p>Thông tin này được dùng khi khách hàng tìm kiếm.</p>
            </div>
          </div>

          <div className="catalog-form-grid">
            <label className="catalog-field catalog-field-full">
              <span>Số nhà, tên đường *</span>
              <input
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="25 Nguyễn Huệ"
                required
                maxLength={255}
              />
            </label>

            <label className="catalog-field">
              <span>Phường/xã</span>
              <input
                name="ward"
                value={form.ward}
                onChange={handleChange}
                placeholder="Phường Bến Nghé"
                maxLength={100}
              />
            </label>

            <label className="catalog-field">
              <span>Quận/huyện</span>
              <input
                name="district"
                value={form.district}
                onChange={handleChange}
                placeholder="Quận 1"
                maxLength={100}
              />
            </label>

            <div className="catalog-field catalog-field-full">
              <HotelLocationPicker
                address={form.address}
                ward={form.ward}
                district={form.district}
                city={form.city}
                latitude={form.latitude}
                longitude={form.longitude}
                onChange={({ latitude, longitude }) => {
                  setError("");
                  setForm((current) => ({ ...current, latitude, longitude }));
                }}
              />
            </div>
          </div>
        </section>

        <section className="catalog-card">
          <div className="catalog-section-title">
            <span><Clock3 size={22} /></span>
            <div>
              <h2>Thời gian và tiện nghi chung</h2>
              <p>Thiết lập giờ nhận/trả phòng và dịch vụ khách sạn.</p>
            </div>
          </div>

          <div className="catalog-form-grid">
            <label className="catalog-field">
              <span>Giờ nhận phòng</span>
              <input
                name="checkInTime"
                type="time"
                value={form.checkInTime}
                onChange={handleChange}
              />
            </label>

            <label className="catalog-field">
              <span>Giờ trả phòng</span>
              <input
                name="checkOutTime"
                type="time"
                value={form.checkOutTime}
                onChange={handleChange}
              />
            </label>

            <div className="catalog-field catalog-field-full">
              <span>Tiện nghi khách sạn</span>
              <div className="catalog-check-grid">
                {hotelAmenities.map((amenity) => (
                  <label className="catalog-check" key={amenity}>
                    <input
                      type="checkbox"
                      checked={form.amenities.includes(amenity)}
                      onChange={() => toggleAmenity(amenity)}
                    />
                    {amenity}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="catalog-card">
          <div className="catalog-section-title">
            <span><ImagePlus size={22} /></span>
            <div>
              <h2>Hình ảnh khách sạn</h2>
              <p>
                Có thể chọn nhiều ảnh cùng lúc. Ảnh đầu tiên sẽ là ảnh bìa.
              </p>
            </div>
          </div>

          <div className="catalog-image-picker">
            <input
              id="hotel-images"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              onChange={addFiles}
            />
            <label htmlFor="hotel-images">
              <ImagePlus size={34} />
              <strong>Chọn hoặc kéo nhiều ảnh khách sạn</strong>
              <span>JPG, PNG, WEBP, GIF · tối đa 10 MB mỗi ảnh</span>
            </label>
          </div>

          {previews.length > 0 ? (
            <div className="catalog-image-grid">
              {previews.map((preview, index) => (
                <div
                  className="catalog-image"
                  key={`${preview.file.name}-${index}`}
                >
                  <img src={preview.url} alt={preview.file.name} />
                  {index === 0 ? (
                    <span className="catalog-image-cover">Ảnh bìa</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    aria-label="Xóa ảnh"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <div className="catalog-actions">
          <Link to="/hotel-admin/hotels" className="catalog-secondary">
            Hủy
          </Link>
          <button
            type="submit"
            className="catalog-primary"
            disabled={submitting}
          >
            <CheckCircle2 size={18} />
            {submitting
              ? "Đang lưu và tải ảnh..."
              : "Lưu khách sạn và thêm loại phòng"}
          </button>
        </div>
      </form>
    </div>
  );
}
