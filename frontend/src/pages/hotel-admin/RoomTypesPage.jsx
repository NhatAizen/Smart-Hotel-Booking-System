import {
  BedDouble,
  Check,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Edit3,
  ImagePlus,
  Maximize2,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Loading from "../../components/common/Loading";
import {
  createRoomType,
  createRoomsBatch,
  deactivateRoom,
  deactivateRoomType,
  deleteRoomTypeImage,
  getManagedRooms,
  getMyHotels,
  getRoomTypes,
  setRoomTypeCover,
  submitRoomType,
  updateRoomType,
  uploadRoomTypeImages,
} from "../../services/hotelAdminService";
import {
  bedTypes,
  roomAmenityGroups,
} from "./hotelCatalogOptions";

import "./HotelCatalogAdmin.css";

const emptyForm = {
  name: "",
  description: "",
  basePrice: "",
  maxAdults: 2,
  maxChildren: 0,
  bedType: "Giường đôi",
  bedCount: 1,
  areaSqm: "",
  breakfastIncluded: false,
  refundable: true,
  smokingAllowed: false,
  payAtHotelAllowed: true,
  depositAllowed: true,
  depositPercent: 30,
  fullPaymentAllowed: true,
  amenities: [],
  status: "ACTIVE",
  roomCount: 1,
  roomPrefix: "1",
  startNumber: 1,
  floor: 1,
};

function errorMessage(error) {
  const response = error.response?.data;

  if (response?.validationErrors) {
    return Object.values(response.validationErrors).join(" · ");
  }

  return response?.message ?? error?.message ?? "Không thể thực hiện thao tác.";
}

function money(value) {
  return `${Number(value ?? 0).toLocaleString("vi-VN")} đ`;
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

function roomTypeImages(roomType) {
  if (!roomType) {
    return [];
  }

  const coverUrl = roomType.coverImageUrl ?? "";
  const sourceImages = Array.isArray(roomType.images) ? roomType.images : [];
  const normalized = sourceImages
    .map((image, index) => ({
      id:
        typeof image === "object" && image !== null
          ? image.id ?? image.imageId ?? `${index}`
          : `${index}`,
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

  const unique = [];
  const seen = new Set();

  normalized
    .sort((left, right) => {
      const leftCover = left.isCover || left.url === coverUrl;
      const rightCover = right.isCover || right.url === coverUrl;

      if (leftCover !== rightCover) {
        return leftCover ? -1 : 1;
      }

      return left.sortOrder - right.sortOrder;
    })
    .forEach((image) => {
      if (!seen.has(image.url)) {
        seen.add(image.url);
        unique.push({
          ...image,
          isCover: image.isCover || image.url === coverUrl,
        });
      }
    });

  return unique;
}

function fileIdentity(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function amenityGroupFor(roomType, group) {
  const amenities = new Set(roomType?.amenities ?? []);
  return group.items.filter((item) => amenities.has(item));
}

export default function RoomTypesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [hotels, setHotels] = useState([]);
  const [hotelId, setHotelId] = useState(searchParams.get("hotelId") ?? "");
  const [roomTypes, setRoomTypes] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [files, setFiles] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [detailRoomType, setDetailRoomType] = useState(null);
  const [detailImageIndex, setDetailImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [imageActionId, setImageActionId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedHotel = useMemo(
    () => hotels.find((hotel) => hotel.id === hotelId),
    [hotels, hotelId],
  );

  const editingRoomType = useMemo(
    () => roomTypes.find((roomType) => roomType.id === editingId) ?? null,
    [editingId, roomTypes],
  );

  const existingEditImages = useMemo(
    () => roomTypeImages(editingRoomType),
    [editingRoomType],
  );

  const detailImages = useMemo(
    () => roomTypeImages(detailRoomType),
    [detailRoomType],
  );

  const newFilePreviews = useMemo(
    () =>
      files.map((file) => ({
        file,
        key: fileIdentity(file),
        url: URL.createObjectURL(file),
      })),
    [files],
  );

  useEffect(
    () => () => {
      newFilePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    },
    [newFilePreviews],
  );

  useEffect(() => {
    async function load() {
      try {
        const data = await getMyHotels();
        const safeHotels = Array.isArray(data) ? data : [];
        setHotels(safeHotels);

        const requested = searchParams.get("hotelId");
        const nextId = safeHotels.some((hotel) => hotel.id === requested)
          ? requested
          : safeHotels[0]?.id ?? "";

        setHotelId(nextId);
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
      setRoomTypes([]);
      return;
    }

    setSearchParams({ hotelId }, { replace: true });

    async function loadTypes() {
      setLoadingTypes(true);
      setError("");

      try {
        const data = await getRoomTypes(hotelId);
        setRoomTypes(Array.isArray(data) ? data : []);
      } catch (requestError) {
        setError(errorMessage(requestError));
      } finally {
        setLoadingTypes(false);
      }
    }

    loadTypes();
  }, [hotelId]);

  useEffect(() => {
    if (!detailRoomType?.id) {
      return;
    }

    const refreshed = roomTypes.find(
      (roomType) => roomType.id === detailRoomType.id,
    );

    if (refreshed) {
      setDetailRoomType(refreshed);
    }
  }, [roomTypes, detailRoomType?.id]);

  useEffect(() => {
    setDetailImageIndex((current) =>
      detailImages.length === 0 ? 0 : Math.min(current, detailImages.length - 1),
    );
  }, [detailImages.length]);

  useEffect(() => {
    if (!showForm && !detailRoomType) {
      document.body.style.removeProperty("overflow");
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        if (detailRoomType) {
          setDetailRoomType(null);
        } else {
          setShowForm(false);
        }
      }

      if (detailRoomType && event.key === "ArrowLeft") {
        setDetailImageIndex((current) =>
          detailImages.length
            ? (current - 1 + detailImages.length) % detailImages.length
            : 0,
        );
      }

      if (detailRoomType && event.key === "ArrowRight") {
        setDetailImageIndex((current) =>
          detailImages.length ? (current + 1) % detailImages.length : 0,
        );
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showForm, detailRoomType, detailImages.length]);

  async function refreshRoomTypes() {
    const data = await getRoomTypes(hotelId);
    const safeRoomTypes = Array.isArray(data) ? data : [];
    setRoomTypes(safeRoomTypes);
    return safeRoomTypes;
  }

  function openCreate() {
    setEditingId("");
    setForm(emptyForm);
    setFiles([]);
    setError("");
    setMessage("");
    setShowForm(true);
  }

  function openEdit(roomType) {
    setEditingId(roomType.id);
    setForm({
      name: roomType.name ?? "",
      description: roomType.description ?? "",
      basePrice: roomType.basePrice ?? "",
      maxAdults: roomType.maxAdults ?? 2,
      maxChildren: roomType.maxChildren ?? 0,
      bedType: roomType.bedType ?? "Giường đôi",
      bedCount: roomType.bedCount ?? 1,
      areaSqm: roomType.areaSqm ?? "",
      breakfastIncluded: Boolean(roomType.breakfastIncluded),
      refundable: Boolean(roomType.refundable),
      smokingAllowed: Boolean(roomType.smokingAllowed),
      payAtHotelAllowed: roomType.payAtHotelAllowed !== false,
      depositAllowed: roomType.depositAllowed !== false,
      depositPercent: Number(roomType.depositPercent ?? 30),
      fullPaymentAllowed: roomType.fullPaymentAllowed !== false,
      amenities: roomType.amenities ?? [],
      status: roomType.status ?? "ACTIVE",
      roomCount: Number(roomType.roomCount ?? 0),
      roomPrefix: "",
      startNumber: 1,
      floor: 1,
    });
    setFiles([]);
    setError("");
    setMessage("");
    setShowForm(true);
  }

  function openDetail(roomType) {
    setDetailRoomType(roomType);
    setDetailImageIndex(0);
  }

  function closeForm() {
    if (submitting) {
      return;
    }

    setShowForm(false);
    setEditingId("");
    setFiles([]);
  }

  function handleChange(event) {
    const { name, value, type, checked } = event.target;

    setForm((current) => ({
      ...current,
      [name]:
        type === "checkbox"
          ? checked
          : [
                "maxAdults",
                "maxChildren",
                "bedCount",
                "roomCount",
                "startNumber",
                "floor",
                "depositPercent",
              ].includes(name)
            ? Number(value)
            : value,
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
    const selectedFiles = Array.from(event.target.files ?? []);

    setFiles((current) => {
      const knownFiles = new Set(current.map(fileIdentity));

      return [
        ...current,
        ...selectedFiles.filter((file) => !knownFiles.has(fileIdentity(file))),
      ];
    });

    event.target.value = "";
  }

  function removeNewFile(fileKey) {
    setFiles((current) =>
      current.filter((file) => fileIdentity(file) !== fileKey),
    );
  }

  function buildRooms(roomTypeId) {
    const count = Math.max(0, Number(form.roomCount));

    if (count === 0) {
      return [];
    }

    const start = Number(form.startNumber);
    const prefix = form.roomPrefix.trim();

    return Array.from({ length: count }, (_, index) => {
      const sequence = start + index;
      const roomNumber = prefix
        ? `${prefix}${String(sequence).padStart(2, "0")}`
        : String(sequence);

      return {
        roomTypeId,
        roomNumber,
        floor: Number(form.floor),
        customPrice: null,
        note: "",
      };
    });
  }

  function roomBelongsToType(room, roomTypeId) {
    return (
      room?.roomTypeId === roomTypeId ||
      room?.roomType?.id === roomTypeId ||
      room?.roomType?.roomTypeId === roomTypeId
    );
  }

  function roomIsActive(room) {
    return String(room?.status ?? "").toUpperCase() !== "INACTIVE";
  }

  function roomCanBeDeactivated(room) {
    return ["AVAILABLE", "MAINTENANCE"].includes(
      String(room?.status ?? "").toUpperCase(),
    );
  }

  async function syncEditedRoomCount(roomTypeId) {
    const requestedCount = Math.max(0, Number(form.roomCount ?? 0));
    const managed = await getManagedRooms(hotelId);
    const allRooms = Array.isArray(managed)
      ? managed
      : Array.isArray(managed?.content)
        ? managed.content
        : Array.isArray(managed?.rooms)
          ? managed.rooms
          : [];

    const activeRooms = allRooms.filter(
      (room) => roomBelongsToType(room, roomTypeId) && roomIsActive(room),
    );
    const currentCount = activeRooms.length;

    if (requestedCount === currentCount) {
      return { added: 0, removed: 0 };
    }

    if (requestedCount > currentCount) {
      const addCount = requestedCount - currentCount;
      const start = Number(form.startNumber);
      const prefix = form.roomPrefix.trim();

      const rooms = Array.from({ length: addCount }, (_, index) => {
        const sequence = start + index;
        const roomNumber = prefix
          ? `${prefix}${String(sequence).padStart(2, "0")}`
          : String(sequence);

        return {
          roomTypeId,
          roomNumber,
          floor: Number(form.floor),
          customPrice: null,
          note: "",
        };
      });

      await createRoomsBatch(hotelId, rooms);
      return { added: rooms.length, removed: 0 };
    }

    const removeCount = currentCount - requestedCount;
    const removable = activeRooms
      .filter(roomCanBeDeactivated)
      .sort((left, right) =>
        String(right.roomNumber ?? "").localeCompare(
          String(left.roomNumber ?? ""),
          "vi",
          { numeric: true },
        ),
      );

    if (removable.length < removeCount) {
      throw new Error(
        `Không thể giảm xuống ${requestedCount} phòng. Cần ngừng ${removeCount} phòng nhưng chỉ có ${removable.length} phòng AVAILABLE/MAINTENANCE có thể ngừng an toàn. Phòng đang OCCUPIED/CLEANING không bị xóa tự động.`,
      );
    }

    const targets = removable.slice(0, removeCount);
    for (const room of targets) {
      await deactivateRoom(room.id);
    }

    return { added: 0, removed: targets.length };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      basePrice: Number(form.basePrice),
      maxAdults: Number(form.maxAdults),
      maxChildren: Number(form.maxChildren),
      bedType: form.bedType,
      bedCount: Number(form.bedCount),
      areaSqm: Number(form.areaSqm),
      breakfastIncluded: form.breakfastIncluded,
      refundable: form.refundable,
      smokingAllowed: form.smokingAllowed,
      payAtHotelAllowed: form.payAtHotelAllowed,
      depositAllowed: form.depositAllowed,
      depositPercent: Number(form.depositPercent),
      fullPaymentAllowed: form.fullPaymentAllowed,
      amenities: form.amenities,
      ...(editingId ? { status: form.status } : {}),
    };

    if (
      !form.payAtHotelAllowed &&
      !form.depositAllowed &&
      !form.fullPaymentAllowed
    ) {
      setError("Phải bật ít nhất một phương thức thanh toán.");
      setSubmitting(false);
      return;
    }

    if (
      form.depositAllowed &&
      (Number(form.depositPercent) < 1 || Number(form.depositPercent) > 99)
    ) {
      setError("Tỷ lệ đặt cọc phải từ 1% đến 99%.");
      setSubmitting(false);
      return;
    }

    try {
      if (editingId) {
        await updateRoomType(editingId, payload);

        if (files.length > 0) {
          await uploadRoomTypeImages(editingId, files);
        }

        const roomSync = await syncEditedRoomCount(editingId);

        await refreshRoomTypes();

        const roomMessage =
          roomSync.added > 0
            ? ` Đã tạo thêm ${roomSync.added} phòng thực tế.`
            : roomSync.removed > 0
              ? ` Đã ngừng hoạt động ${roomSync.removed} phòng thực tế.`
              : "";

        setMessage(`Đã cập nhật loại phòng.${roomMessage}`);
      } else {
        const saved = await createRoomType(hotelId, payload);

        if (files.length > 0) {
          await uploadRoomTypeImages(saved.id, files);
        }

        const rooms = buildRooms(saved.id);

        if (rooms.length > 0) {
          await createRoomsBatch(hotelId, rooms);
        }

        await refreshRoomTypes();
        setMessage(
          `Đã tạo loại phòng${rooms.length ? ` và ${rooms.length} phòng` : ""}.`,
        );
      }

      setShowForm(false);
      setEditingId("");
      setForm(emptyForm);
      setFiles([]);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetCover(image) {
    if (!editingId || !image.id || image.id === "cover-url") {
      return;
    }

    setImageActionId(String(image.id));
    setError("");

    try {
      await setRoomTypeCover(editingId, image.id);
      await refreshRoomTypes();
      setMessage("Đã đổi ảnh bìa loại phòng.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setImageActionId("");
    }
  }

  async function handleDeleteExistingImage(image) {
    if (!editingId || !image.id || image.id === "cover-url") {
      return;
    }

    if (!window.confirm("Xóa ảnh này khỏi loại phòng?")) {
      return;
    }

    setImageActionId(String(image.id));
    setError("");

    try {
      await deleteRoomTypeImage(editingId, image.id);
      await refreshRoomTypes();
      setMessage("Đã xóa ảnh loại phòng.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setImageActionId("");
    }
  }

  async function handleDelete(roomTypeId) {
    if (!window.confirm("Ngừng hoạt động loại phòng này?")) {
      return;
    }

    setError("");

    try {
      await deactivateRoomType(roomTypeId);
      setRoomTypes((current) =>
        current.map((item) =>
          item.id === roomTypeId ? { ...item, status: "INACTIVE" } : item,
        ),
      );
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function handleSubmitApproval(roomType) {
    if (!window.confirm(`Gửi loại phòng “${roomType.name}” cho System Admin xét duyệt?`)) {
      return;
    }
    setError("");
    try {
      const updated = await submitRoomType(roomType.id);
      setRoomTypes((current) => current.map((item) => item.id === roomType.id ? updated : item));
      setMessage("Đã gửi loại phòng chờ System Admin xét duyệt.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  function previousDetailImage() {
    setDetailImageIndex((current) =>
      detailImages.length
        ? (current - 1 + detailImages.length) % detailImages.length
        : 0,
    );
  }

  function nextDetailImage() {
    setDetailImageIndex((current) =>
      detailImages.length ? (current + 1) % detailImages.length : 0,
    );
  }

  if (loading) {
    return <Loading message="Đang tải loại phòng..." />;
  }

  return (
    <div className="admin-page catalog-page">
      <section className="catalog-heading">
        <div>
          <span className="catalog-kicker">DANH MỤC PHÒNG</span>
          <h1>Loại phòng khách sạn</h1>
          <p>
            Mỗi loại phòng có giá, sức chứa, diện tích, tiện nghi, nhiều hình
            ảnh và số lượng phòng thực tế riêng.
          </p>
        </div>

        <button
          type="button"
          className="catalog-primary"
          onClick={openCreate}
          disabled={!hotelId}
        >
          <Plus size={18} />
          Thêm loại phòng
        </button>
      </section>

      {error ? <div className="catalog-notice error">{error}</div> : null}
      {message ? <div className="catalog-notice success">{message}</div> : null}

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
                {hotel.name} · {hotel.approvalStatus}
              </option>
            ))}
          </select>
        </label>

        {selectedHotel ? (
          <div className="catalog-meta">
            <BedDouble size={18} />
            {selectedHotel.roomTypeCount ?? 0} loại phòng ·{" "}
            {selectedHotel.roomCount ?? 0} phòng thực tế
          </div>
        ) : null}
      </section>

      {loadingTypes ? (
        <Loading message="Đang tải loại phòng..." />
      ) : roomTypes.length === 0 ? (
        <section className="catalog-card catalog-empty">
          <BedDouble size={46} />
          <h2>Chưa có loại phòng</h2>
          <p>Hãy tạo loại phòng đầu tiên và nhập số lượng phòng tương ứng.</p>
          <button type="button" className="catalog-primary" onClick={openCreate}>
            <Plus size={18} />
            Tạo loại phòng
          </button>
        </section>
      ) : (
        <section className="catalog-type-list">
          {roomTypes.map((roomType) => {
            const images = roomTypeImages(roomType);

            return (
              <article className="catalog-type-card" key={roomType.id}>
                <button
                  type="button"
                  className="catalog-type-photo catalog-type-photo-button"
                  onClick={() => openDetail(roomType)}
                  aria-label={`Xem chi tiết ${roomType.name}`}
                >
                  {images[0]?.url ? (
                    <img src={images[0].url} alt={roomType.name} />
                  ) : (
                    <div className="catalog-hotel-cover-empty">
                      <ImagePlus size={40} />
                    </div>
                  )}

                  <span className="catalog-photo-hover">
                    <Maximize2 size={18} />
                    Xem ảnh và chi tiết
                  </span>

                  {images.length > 1 ? (
                    <span className="catalog-photo-count">
                      <ImagePlus size={14} />
                      {images.length} ảnh
                    </span>
                  ) : null}
                </button>

                <div className="catalog-type-info">
                  <button
                    type="button"
                    className="catalog-type-name-button"
                    onClick={() => openDetail(roomType)}
                  >
                    {roomType.name}
                  </button>

                  <div className="catalog-price">
                    {money(roomType.basePrice)} / đêm
                  </div>

                  <div className={`catalog-status ${String(roomType.approvalStatus ?? "DRAFT").toLowerCase()}`}>
                    {roomType.approvalStatus === "APPROVED" ? "Đã duyệt"
                      : roomType.approvalStatus === "PENDING" ? "Chờ duyệt"
                        : roomType.approvalStatus === "REJECTED" ? "Bị từ chối"
                          : "Bản nháp"}
                  </div>
                  {roomType.approvalStatus === "REJECTED" && roomType.rejectionReason ? (
                    <p className="catalog-rejection-reason">Lý do: {roomType.rejectionReason}</p>
                  ) : null}

                  <p>{roomType.description || "Chưa có mô tả."}</p>

                  <div className="catalog-meta">
                    <Users size={16} />
                    {roomType.maxAdults} người lớn · {roomType.maxChildren} trẻ em
                  </div>

                  <div className="catalog-tags">
                    <span>{roomType.areaSqm} m²</span>
                    <span>
                      {roomType.bedCount} × {roomType.bedType}
                    </span>
                    <span>{roomType.roomCount} phòng</span>
                    <span>{images.length} ảnh</span>
                    {roomType.breakfastIncluded ? <span>Có bữa sáng</span> : null}
                    {roomType.refundable ? <span>Hoàn tiền</span> : null}
                    {roomType.payAtHotelAllowed !== false ? (
                      <span>Trả tại khách sạn</span>
                    ) : null}
                    {roomType.depositAllowed !== false ? (
                      <span>Cọc {roomType.depositPercent ?? 30}%</span>
                    ) : null}
                    {roomType.fullPaymentAllowed !== false ? (
                      <span>Thanh toán toàn bộ</span>
                    ) : null}
                    {roomType.amenities?.slice(0, 5).map((amenity) => (
                      <span key={amenity}>{amenity}</span>
                    ))}
                  </div>
                </div>

                <div className="catalog-type-actions">
                  {["DRAFT", "REJECTED"].includes(roomType.approvalStatus ?? "DRAFT") && roomType.status === "ACTIVE" ? (
                    <button
                      type="button"
                      className="catalog-primary"
                      onClick={() => handleSubmitApproval(roomType)}
                    >
                      <ShieldCheck size={16} />
                      Gửi xét duyệt
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="catalog-secondary"
                    onClick={() => openEdit(roomType)}
                  >
                    <Edit3 size={16} />
                    Chỉnh sửa
                  </button>

                  <button
                    type="button"
                    className="catalog-danger"
                    onClick={() => handleDelete(roomType.id)}
                  >
                    <Trash2 size={16} />
                    Ngừng hoạt động
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {showForm ? (
        <div
          className="catalog-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeForm();
            }
          }}
        >
          <form className="catalog-modal" onSubmit={handleSubmit}>
            <div className="catalog-modal-header">
              <div>
                <span className="catalog-kicker">
                  {editingId ? "CẬP NHẬT" : "THÊM MỚI"}
                </span>
                <h2>{editingId ? "Chỉnh sửa loại phòng" : "Tạo loại phòng"}</h2>
              </div>

              <button
                type="button"
                className="catalog-icon-button"
                onClick={closeForm}
                aria-label="Đóng biểu mẫu"
              >
                <X size={19} />
              </button>
            </div>

            <div className="catalog-form-grid">
              <label className="catalog-field catalog-field-full">
                <span>Tên loại phòng *</span>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Phòng Superior Giường Đôi"
                  required
                />
              </label>

              <label className="catalog-field catalog-field-full">
                <span>Mô tả phòng *</span>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Mô tả không gian, hướng nhìn, nội thất, phòng tắm và ưu điểm nổi bật..."
                  required
                  maxLength={5000}
                />
                <small>{form.description.length}/5000 ký tự</small>
              </label>

              <label className="catalog-field">
                <span>Giá mỗi đêm *</span>
                <input
                  name="basePrice"
                  type="number"
                  min="0"
                  step="1000"
                  value={form.basePrice}
                  onChange={handleChange}
                  required
                />
              </label>

              <label className="catalog-field">
                <span>Diện tích m² *</span>
                <input
                  name="areaSqm"
                  type="number"
                  min="1"
                  step="0.1"
                  value={form.areaSqm}
                  onChange={handleChange}
                  required
                />
              </label>

              <label className="catalog-field">
                <span>Người lớn tối đa *</span>
                <input
                  name="maxAdults"
                  type="number"
                  min="1"
                  value={form.maxAdults}
                  onChange={handleChange}
                  required
                />
              </label>

              <label className="catalog-field">
                <span>Trẻ em tối đa</span>
                <input
                  name="maxChildren"
                  type="number"
                  min="0"
                  value={form.maxChildren}
                  onChange={handleChange}
                />
              </label>

              <label className="catalog-field">
                <span>Loại giường</span>
                <select
                  name="bedType"
                  value={form.bedType}
                  onChange={handleChange}
                >
                  {bedTypes.map((bed) => (
                    <option key={bed} value={bed}>
                      {bed}
                    </option>
                  ))}
                </select>
              </label>

              <label className="catalog-field">
                <span>Số giường</span>
                <input
                  name="bedCount"
                  type="number"
                  min="1"
                  value={form.bedCount}
                  onChange={handleChange}
                />
              </label>

              {editingId ? (
                <label className="catalog-field">
                  <span>Trạng thái</span>
                  <select
                    name="status"
                    value={form.status}
                    onChange={handleChange}
                  >
                    <option value="ACTIVE">Đang hoạt động</option>
                    <option value="INACTIVE">Ngừng hoạt động</option>
                  </select>
                </label>
              ) : null}

              <div className="catalog-field catalog-field-full">
                <span>Chính sách</span>
                <div className="catalog-check-grid">
                  <label className="catalog-check">
                    <input
                      name="breakfastIncluded"
                      type="checkbox"
                      checked={form.breakfastIncluded}
                      onChange={handleChange}
                    />
                    Bao gồm bữa sáng
                  </label>

                  <label className="catalog-check">
                    <input
                      name="refundable"
                      type="checkbox"
                      checked={form.refundable}
                      onChange={handleChange}
                    />
                    Có thể hoàn tiền
                  </label>

                  <label className="catalog-check">
                    <input
                      name="smokingAllowed"
                      type="checkbox"
                      checked={form.smokingAllowed}
                      onChange={handleChange}
                    />
                    Cho phép hút thuốc
                  </label>
                </div>
              </div>

              <div className="catalog-field catalog-field-full">
                <span>Phương thức thanh toán cho khách</span>
                <div className="catalog-payment-policy-box">
                  <label className="catalog-check">
                    <input
                      name="payAtHotelAllowed"
                      type="checkbox"
                      checked={form.payAtHotelAllowed}
                      onChange={handleChange}
                    />
                    Thanh toán tại khách sạn
                  </label>

                  <label className="catalog-check">
                    <input
                      name="depositAllowed"
                      type="checkbox"
                      checked={form.depositAllowed}
                      onChange={handleChange}
                    />
                    Cho phép đặt cọc online
                  </label>

                  <label className="catalog-deposit-percent">
                    <span>Tỷ lệ cọc</span>
                    <div>
                      <input
                        name="depositPercent"
                        type="number"
                        min="1"
                        max="99"
                        value={form.depositPercent}
                        disabled={!form.depositAllowed}
                        onChange={handleChange}
                      />
                      <strong>%</strong>
                    </div>
                  </label>

                  <label className="catalog-check">
                    <input
                      name="fullPaymentAllowed"
                      type="checkbox"
                      checked={form.fullPaymentAllowed}
                      onChange={handleChange}
                    />
                    Cho phép thanh toán toàn bộ online
                  </label>
                </div>
                <small>
                  Trang đặt phòng chỉ hiển thị các lựa chọn được bật tại đây.
                </small>
              </div>

              <div className="catalog-field catalog-field-full">
                <span>Tiện nghi phòng</span>

                <div className="catalog-amenity-editor">
                  {roomAmenityGroups.map((group) => (
                    <section className="catalog-amenity-editor-group" key={group.title}>
                      <h3>{group.title}</h3>
                      <div className="catalog-check-grid">
                        {group.items.map((amenity) => (
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
                    </section>
                  ))}
                </div>
              </div>

              <div className="catalog-field catalog-field-full">
                <span>Ảnh loại phòng</span>

                {editingId && existingEditImages.length > 0 ? (
                  <div className="catalog-existing-images">
                    <div className="catalog-subheading">
                      <strong>Ảnh đang lưu ({existingEditImages.length})</strong>
                      <small>Bấm “Đặt làm bìa” để đổi ảnh đại diện.</small>
                    </div>

                    <div className="catalog-image-grid">
                      {existingEditImages.map((image) => (
                        <div className="catalog-image catalog-managed-image" key={image.id}>
                          <img src={image.url} alt="Ảnh loại phòng" />

                          {image.isCover ? (
                            <span className="catalog-image-cover">Ảnh bìa</span>
                          ) : (
                            <button
                              type="button"
                              className="catalog-set-cover"
                              disabled={imageActionId === String(image.id)}
                              onClick={() => handleSetCover(image)}
                            >
                              Đặt làm bìa
                            </button>
                          )}

                          {image.id !== "cover-url" ? (
                            <button
                              type="button"
                              className="catalog-delete-image"
                              disabled={imageActionId === String(image.id)}
                              onClick={() => handleDeleteExistingImage(image)}
                              aria-label="Xóa ảnh"
                            >
                              <X size={16} />
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="catalog-image-picker">
                  <input
                    id={`room-type-images-${editingId || "new"}`}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    onChange={addFiles}
                  />
                  <label htmlFor={`room-type-images-${editingId || "new"}`}>
                    <ImagePlus size={31} />
                    <strong>Chọn hoặc thêm nhiều ảnh phòng</strong>
                    <span>
                      {files.length > 0
                        ? `${files.length} ảnh mới đã chọn`
                        : "Có thể chọn nhiều ảnh cùng lúc hoặc chọn thêm nhiều lần"}
                    </span>
                  </label>
                </div>

                {newFilePreviews.length > 0 ? (
                  <div className="catalog-new-image-section">
                    <div className="catalog-subheading">
                      <strong>Ảnh mới sẽ tải lên ({newFilePreviews.length})</strong>
                      <small>Ảnh đầu tiên sẽ là ảnh bìa khi tạo loại phòng mới.</small>
                    </div>

                    <div className="catalog-image-grid">
                      {newFilePreviews.map((preview, index) => (
                        <div className="catalog-image" key={preview.key}>
                          <img src={preview.url} alt={preview.file.name} />

                          {!editingId && index === 0 ? (
                            <span className="catalog-image-cover">Ảnh bìa mới</span>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => removeNewFile(preview.key)}
                            aria-label={`Xóa ${preview.file.name}`}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="catalog-field">
                <span>
                  {editingId
                    ? "Điều chỉnh số lượng phòng thực tế"
                    : "Tạo phòng thực tế cùng lúc"}
                </span>

                {editingId ? (
                  <small>
                    Số lượng hiện tại: {editingRoomType?.roomCount ?? 0} phòng.
                    Tăng số lượng sẽ tạo thêm phòng. Giảm số lượng sẽ ngừng hoạt
                    động các phòng AVAILABLE/MAINTENANCE, không tự đụng vào
                    phòng đang có khách hoặc đang dọn.
                  </small>
                ) : null}

                <div className="catalog-batch-box">
                  <label className="catalog-field">
                    <span>
                      {editingId ? "Số lượng phòng mong muốn" : "Số lượng phòng"}
                    </span>
                    <input
                      name="roomCount"
                      type="number"
                      min="0"
                      max="200"
                      value={form.roomCount}
                      onChange={handleChange}
                    />
                  </label>

                  <label className="catalog-field">
                    <span>Tiền tố số phòng mới</span>
                    <input
                      name="roomPrefix"
                      value={form.roomPrefix}
                      onChange={handleChange}
                      placeholder="2"
                    />
                  </label>

                  <label className="catalog-field">
                    <span>Số phòng mới bắt đầu từ</span>
                    <input
                      name="startNumber"
                      type="number"
                      min="0"
                      value={form.startNumber}
                      onChange={handleChange}
                    />
                  </label>

                  <label className="catalog-field">
                    <span>Tầng cho phòng mới</span>
                    <input
                      name="floor"
                      type="number"
                      value={form.floor}
                      onChange={handleChange}
                    />
                  </label>
                </div>

                <small>
                  Ví dụ tiền tố 2, bắt đầu 1 → phòng mới 201, 202, 203...
                  Khi chỉnh sửa mà chỉ đổi thông tin loại phòng, hãy giữ nguyên
                  số lượng hiện tại.
                </small>
              </div>

            <div className="catalog-actions">
              <button
                type="button"
                className="catalog-secondary"
                onClick={closeForm}
              >
                Hủy
              </button>

              <button
                type="submit"
                className="catalog-primary"
                disabled={submitting}
              >
                {submitting
                  ? "Đang lưu..."
                  : editingId
                    ? "Lưu thay đổi"
                    : "Tạo loại phòng"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {detailRoomType ? (
        <div
          className="room-detail-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDetailRoomType(null);
            }
          }}
        >
          <section
            className="room-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-detail-title"
          >
            <button
              type="button"
              className="room-detail-close"
              onClick={() => setDetailRoomType(null)}
              aria-label="Đóng chi tiết phòng"
            >
              <X size={21} />
            </button>

            <div className="room-detail-gallery">
              <div className="room-detail-main-image">
                {detailImages[detailImageIndex]?.url ? (
                  <img
                    src={detailImages[detailImageIndex].url}
                    alt={`${detailRoomType.name} - ảnh ${detailImageIndex + 1}`}
                  />
                ) : (
                  <div className="room-detail-no-image">
                    <ImagePlus size={56} />
                    <span>Loại phòng chưa có ảnh</span>
                  </div>
                )}

                {detailImages.length > 1 ? (
                  <>
                    <button
                      type="button"
                      className="room-detail-arrow previous"
                      onClick={previousDetailImage}
                      aria-label="Ảnh trước"
                    >
                      <ChevronLeft size={27} />
                    </button>

                    <button
                      type="button"
                      className="room-detail-arrow next"
                      onClick={nextDetailImage}
                      aria-label="Ảnh tiếp theo"
                    >
                      <ChevronRight size={27} />
                    </button>

                    <span className="room-detail-counter">
                      {detailImageIndex + 1}/{detailImages.length}
                    </span>
                  </>
                ) : null}
              </div>

              {detailImages.length > 0 ? (
                <div className="room-detail-thumbnails">
                  {detailImages.map((image, index) => (
                    <button
                      type="button"
                      className={
                        index === detailImageIndex
                          ? "room-detail-thumbnail active"
                          : "room-detail-thumbnail"
                      }
                      key={`${image.id}-${image.url}`}
                      onClick={() => setDetailImageIndex(index)}
                      aria-label={`Xem ảnh ${index + 1}`}
                    >
                      <img src={image.url} alt="" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="room-detail-content">
              <span className="room-detail-kicker">CHI TIẾT LOẠI PHÒNG</span>
              <h2 id="room-detail-title">{detailRoomType.name}</h2>

              <div className="room-detail-summary-tags">
                <span>
                  <Maximize2 size={16} />
                  {detailRoomType.areaSqm} m²
                </span>
                <span>
                  <BedDouble size={16} />
                  {detailRoomType.bedCount} × {detailRoomType.bedType}
                </span>
                <span>
                  <Users size={16} />
                  {detailRoomType.maxAdults} người lớn
                  {Number(detailRoomType.maxChildren) > 0
                    ? ` · ${detailRoomType.maxChildren} trẻ em`
                    : ""}
                </span>
              </div>

              <div className="room-detail-price-panel">
                <div>
                  <small>Giá cơ bản mỗi đêm</small>
                  <strong>{money(detailRoomType.basePrice)}</strong>
                </div>
                <span>{detailRoomType.roomCount ?? 0} phòng thực tế</span>
              </div>

              <section className="room-detail-section">
                <h3>Mô tả phòng</h3>
                <p>
                  {detailRoomType.description ||
                    "Khách sạn chưa cung cấp mô tả cho loại phòng này."}
                </p>
              </section>

              <section className="room-detail-section">
                <h3>Chính sách và lựa chọn</h3>
                <div className="room-detail-policy-grid">
                  <div>
                    <Coffee size={19} />
                    <span>
                      <strong>Bữa sáng</strong>
                      <small>
                        {detailRoomType.breakfastIncluded
                          ? "Đã bao gồm trong giá"
                          : "Không bao gồm"}
                      </small>
                    </span>
                  </div>

                  <div>
                    <WalletCards size={19} />
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
                    <ShieldCheck size={19} />
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

              <section className="room-detail-section">
                <h3>Phương thức thanh toán</h3>
                <div className="room-detail-payment-list">
                  {detailRoomType.payAtHotelAllowed !== false ? (
                    <span>
                      <Check size={17} /> Thanh toán tại khách sạn
                    </span>
                  ) : null}
                  {detailRoomType.depositAllowed !== false ? (
                    <span>
                      <Check size={17} /> Đặt cọc {detailRoomType.depositPercent ?? 30}% online
                    </span>
                  ) : null}
                  {detailRoomType.fullPaymentAllowed !== false ? (
                    <span>
                      <Check size={17} /> Thanh toán toàn bộ online
                    </span>
                  ) : null}
                </div>
              </section>

              {roomAmenityGroups.map((group) => {
                const availableAmenities = amenityGroupFor(
                  detailRoomType,
                  group,
                );

                if (availableAmenities.length === 0) {
                  return null;
                }

                return (
                  <section className="room-detail-section" key={group.title}>
                    <h3>{group.detailTitle ?? group.title}</h3>
                    <div className="room-detail-amenity-grid">
                      {availableAmenities.map((amenity) => (
                        <span key={amenity}>
                          <Check size={17} />
                          {amenity}
                        </span>
                      ))}
                    </div>
                  </section>
                );
              })}

              {(!detailRoomType.amenities ||
                detailRoomType.amenities.length === 0) ? (
                <section className="room-detail-section">
                  <h3>Tiện nghi phòng</h3>
                  <p>Khách sạn chưa cập nhật tiện nghi cho loại phòng này.</p>
                </section>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}