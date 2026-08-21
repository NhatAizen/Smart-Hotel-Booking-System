import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock3,
  ImagePlus,
  MapPin,
  RotateCcw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import HotelLocationPicker from "../../components/map/HotelLocationPicker";
import { PageHeader } from "../../components/ui";
import {
  createHotel,
  uploadHotelImages,
} from "../../services/hotelAdminService";
import {
  cities,
  hotelAmenities,
} from "./hotelCatalogOptions";

import "./HotelCatalogAdmin.css";
import "./HotelCatalogExperience.css";

const initialForm = {
  name: "",
  description: "",
  address: "",
  ward: "",
  district: "",
  city: "",
  latitude: null,
  longitude: null,
  phone: "",
  email: "",
  starRating: 0,
  checkInTime: null,
  checkOutTime: null,
  amenities: [],
};

const HOURS = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0"),
);

const MINUTES = Array.from({ length: 12 }, (_, index) =>
  String(index * 5).padStart(2, "0"),
);

const CHECK_IN_PRESETS = ["13:00", "14:00", "14:30", "15:00"];
const CHECK_OUT_PRESETS = ["10:00", "11:00", "12:00", "12:30"];

function errorMessage(error) {
  const response = error.response?.data;

  if (response?.validationErrors) {
    return Object.values(response.validationErrors).join(" · ");
  }

  return response?.message ?? "Không thể lưu khách sạn.";
}

function parseTime(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return {
      hour: "",
      minute: "",
    };
  }

  const [hour, minute] = value.split(":");

  return {
    hour,
    minute,
  };
}

function describeTime(value) {
  if (!value) {
    return "Chưa thiết lập";
  }

  const { hour, minute } = parseTime(value);
  const numericHour = Number(hour);

  if (numericHour === 0) {
    return `${value} = 12:${minute} đêm`;
  }

  if (numericHour < 12) {
    return `${value} = ${numericHour}:${minute} sáng`;
  }

  if (numericHour === 12) {
    return `${value} = 12:${minute} trưa`;
  }

  if (numericHour < 18) {
    return `${value} = ${numericHour - 12}:${minute} chiều`;
  }

  return `${value} = ${numericHour - 12}:${minute} tối`;
}

function TimePickerField({
  label,
  value,
  presets,
  helpText,
  onChange,
}) {
  const { hour, minute } = parseTime(value);

  function updatePart(part, nextValue) {
    if (!nextValue) {
      onChange(null);
      return;
    }

    const nextHour =
      part === "hour"
        ? nextValue
        : hour || "00";

    const nextMinute =
      part === "minute"
        ? nextValue
        : minute || "00";

    onChange(`${nextHour}:${nextMinute}`);
  }

  return (
    <div className="catalog-field catalog-time-field">
      <div className="catalog-time-field__heading">
        <span>{label}</span>
        <small>Định dạng 24 giờ</small>
      </div>

      <div className="catalog-time-picker">
        <label className="catalog-time-part">
          <span>Giờ</span>
          <select
            value={hour}
            onChange={(event) =>
              updatePart("hour", event.target.value)
            }
            aria-label={`${label} - giờ`}
          >
            <option value="">--</option>
            {HOURS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <span className="catalog-time-picker__colon" aria-hidden="true">
          :
        </span>

        <label className="catalog-time-part">
          <span>Phút</span>
          <select
            value={minute}
            onChange={(event) =>
              updatePart("minute", event.target.value)
            }
            aria-label={`${label} - phút`}
          >
            <option value="">--</option>
            {MINUTES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        {value ? (
          <button
            type="button"
            className="catalog-time-clear"
            onClick={() => onChange(null)}
            title={`Xóa ${label.toLowerCase()}`}
          >
            <RotateCcw size={15} />
            Để trống
          </button>
        ) : null}
      </div>

      <div
        className={`catalog-time-preview${value ? " is-set" : ""}`}
        aria-live="polite"
      >
        <Clock3 size={16} />
        <strong>{describeTime(value)}</strong>
      </div>

      <div className="catalog-time-presets">
        <span>Chọn nhanh:</span>

        <div>
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              className={value === preset ? "active" : ""}
              onClick={() => onChange(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      <small className="catalog-time-help">{helpText}</small>
    </div>
  );
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

  useEffect(
    () => () =>
      previews.forEach((preview) =>
        URL.revokeObjectURL(preview.url),
      ),
    [previews],
  );

  function handleChange(event) {
    const { name, value } = event.target;

    setError("");

    setForm((current) => ({
      ...current,
      [name]:
        name === "starRating"
          ? Number(value)
          : value,
    }));
  }

  function handleTimeChange(field, value) {
    setError("");

    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toggleAmenity(value) {
    setForm((current) => ({
      ...current,
      amenities: current.amenities.includes(value)
        ? current.amenities.filter(
          (item) => item !== value,
        )
        : [...current.amenities, value],
    }));
  }

  function addFiles(event) {
    const selected = Array.from(
      event.target.files ?? [],
    );

    setFiles((current) => [
      ...current,
      ...selected,
    ]);

    event.target.value = "";
  }

  function removeFile(index) {
    setFiles((current) =>
      current.filter(
        (_, itemIndex) =>
          itemIndex !== index,
      ),
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (files.length === 0) {
      setError(
        "Vui lòng chọn ít nhất một ảnh khách sạn.",
      );
      return;
    }

    if (
      form.latitude == null
      || form.longitude == null
    ) {
      setError(
        "Vui lòng xác nhận vị trí chính xác của khách sạn trên bản đồ.",
      );
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

      await uploadHotelImages(
        hotel.id,
        files,
      );

      navigate(
        `/hotel-admin/room-types?hotelId=${hotel.id}`,
        {
          replace: true,
        },
      );
    } catch (requestError) {
      setError(
        errorMessage(requestError),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-page catalog-page catalog-experience catalog-create-hotel-page">
      <PageHeader
        className="catalog-heading catalog-experience__header"
        eyebrow="HỒ SƠ KHÁCH SẠN"
        title="Đăng ký khách sạn mới"
        description="Tạo hồ sơ nháp bằng thông tin vận hành thực tế, tải ảnh của cơ sở, rồi thiết lập loại phòng trước khi gửi xét duyệt."
        actions={(
          <Link
            to="/hotel-admin/hotels"
            className="hotel-back-link"
          >
            <ArrowLeft size={17} />
            Quay lại danh sách
          </Link>
        )}
      />

      {error ? (
        <div className="catalog-notice error">
          {error}
        </div>
      ) : null}

      <form
        className="catalog-form"
        onSubmit={handleSubmit}
      >
        <section className="catalog-card">
          <div className="catalog-section-title">
            <span>
              <Building2 size={22} />
            </span>

            <div>
              <h2>Thông tin cơ bản</h2>
              <p>
                Tên, liên hệ và mô tả nổi bật của khách sạn.
              </p>
            </div>
          </div>

          <div className="catalog-form-grid">
            <label className="catalog-field catalog-field-full">
              <span>Tên khách sạn *</span>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Nhập tên đúng theo hồ sơ đăng ký kinh doanh"
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
                placeholder="Nhập số điện thoại lễ tân hoặc bộ phận đặt phòng"
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
                placeholder="Nhập email nhận thông tin đặt phòng"
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
              <span>Thành phố *</span>
              <select
                name="city"
                value={form.city}
                onChange={handleChange}
                required
              >
                <option
                  value=""
                  disabled
                >
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
                value={form.description}
                onChange={handleChange}
                placeholder="Giới thiệu vị trí, phong cách, không gian và ưu điểm nổi bật..."
                required
                maxLength={5000}
              />
              <small>
                {form.description.length}/5000 ký tự
              </small>
            </label>
          </div>
        </section>

        <section className="catalog-card">
          <div className="catalog-section-title">
            <span>
              <MapPin size={22} />
            </span>

            <div>
              <h2>Địa chỉ khách sạn</h2>
              <p>
                Thông tin này được dùng khi khách hàng tìm kiếm.
              </p>
            </div>
          </div>

          <div className="catalog-form-grid">
            <label className="catalog-field catalog-field-full">
              <span>Số nhà, tên đường *</span>
              <input
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="Nhập số nhà và tên đường"
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
                placeholder="Nhập phường hoặc xã"
                maxLength={100}
              />
            </label>

            <label className="catalog-field">
              <span>Quận/huyện</span>
              <input
                name="district"
                value={form.district}
                onChange={handleChange}
                placeholder="Nhập quận hoặc huyện"
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
                onChange={({
                  latitude,
                  longitude,
                }) => {
                  setError("");

                  setForm((current) => ({
                    ...current,
                    latitude,
                    longitude,
                  }));
                }}
              />
            </div>
          </div>
        </section>

        <section className="catalog-card">
          <div className="catalog-section-title">
            <span>
              <Clock3 size={22} />
            </span>

            <div>
              <h2>
                Thời gian và tiện nghi chung
              </h2>
              <p>
                Thiết lập giờ nhận/trả phòng và dịch vụ khách sạn.
              </p>
            </div>
          </div>

          <div className="catalog-form-grid">
            <TimePickerField
              label="Giờ nhận phòng"
              value={form.checkInTime}
              presets={CHECK_IN_PRESETS}
              helpText="Có thể để trống nếu cơ sở chưa ban hành giờ nhận phòng."
              onChange={(value) =>
                handleTimeChange(
                  "checkInTime",
                  value,
                )
              }
            />

            <TimePickerField
              label="Giờ trả phòng"
              value={form.checkOutTime}
              presets={CHECK_OUT_PRESETS}
              helpText="Có thể để trống nếu cơ sở chưa ban hành giờ trả phòng."
              onChange={(value) =>
                handleTimeChange(
                  "checkOutTime",
                  value,
                )
              }
            />

            <div className="catalog-field catalog-field-full">
              <span>Tiện nghi khách sạn</span>

              <div className="catalog-check-grid">
                {hotelAmenities.map(
                  (amenity) => (
                    <label
                      className="catalog-check"
                      key={amenity}
                    >
                      <input
                        type="checkbox"
                        checked={
                          form.amenities.includes(
                            amenity,
                          )
                        }
                        onChange={() =>
                          toggleAmenity(
                            amenity,
                          )
                        }
                      />
                      {amenity}
                    </label>
                  ),
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="catalog-card">
          <div className="catalog-section-title">
            <span>
              <ImagePlus size={22} />
            </span>

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
              <strong>
                Chọn hoặc kéo nhiều ảnh khách sạn
              </strong>
              <span>
                JPG, PNG, WEBP, GIF · tối đa 10 MB mỗi ảnh
              </span>
            </label>
          </div>

          {previews.length > 0 ? (
            <div className="catalog-image-grid">
              {previews.map(
                (preview, index) => (
                  <div
                    className="catalog-image"
                    key={`${preview.file.name}-${index}`}
                  >
                    <img
                      src={preview.url}
                      alt={preview.file.name}
                    />

                    {index === 0 ? (
                      <span className="catalog-image-cover">
                        Ảnh bìa
                      </span>
                    ) : null}

                    <button
                      type="button"
                      onClick={() =>
                        removeFile(index)
                      }
                      aria-label="Xóa ảnh"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ),
              )}
            </div>
          ) : null}
        </section>

        <div className="catalog-actions">
          <Link
            to="/hotel-admin/hotels"
            className="catalog-secondary"
          >
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
