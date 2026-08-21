import {
  BedDouble,
  Check,
  ChevronLeft,
  ChevronRight,
  Coffee,
  DoorOpen,
  Edit3,
  ImagePlus,
  Images,
  Info,
  Maximize2,
  Minus,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Loading from "../../components/common/Loading";
import {
  EmptyState,
  PageHeader,
  StatusBadge,
} from "../../components/ui";
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
  updateRoom,
  updateRoomType,
  uploadRoomTypeImages,
} from "../../services/hotelAdminService";
import {
  bedTypeLabel,
  statusLabel,
  statusTone,
} from "../../utils/presentation";
import {
  bedTypes,
  roomAmenityGroups,
} from "./hotelCatalogOptions";

import "./HotelCatalogAdmin.css";
import "./HotelCatalogExperience.css";
import useRealtimeRefresh from "../../realtime/useRealtimeRefresh";

const APPROVAL_LABELS = {
  PENDING: "Chờ duyệt",
  REJECTED: "Đã từ chối",
};

const emptyForm = {
  name: "",
  description: "",
  basePrice: "",
  maxAdults: "",
  maxChildren: 0,
  bedType: "",
  bedCount: "",
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
  roomCount: 0,
  roomChangeMode: "KEEP",
  roomChangeCount: 0,
  startNumber: "",
  floor: "",
  renameRoomId: "",
  renameRoomNumber: "",
  renameFloor: "",
};

function errorMessage(error) {
  const response = error.response?.data;

  if (response?.validationErrors) {
    return Object.values(response.validationErrors).join(" · ");
  }

  return response?.message ?? error?.message ?? "Không thể thực hiện thao tác.";
}

function money(value) {
  if (value === null || value === undefined || value === "") {
    return "Chưa cập nhật";
  }

  const amount = Number(value);
  return Number.isFinite(amount)
    ? `${amount.toLocaleString("vi-VN")} đ`
    : "Chưa cập nhật";
}

function approvalLabel(value) {
  if (!value) return "Chưa cập nhật";
  return statusLabel(value, APPROVAL_LABELS);
}

function valueWithUnit(value, unit) {
  return value === null || value === undefined || value === ""
    ? "Chưa cập nhật"
    : `${value}${unit}`;
}

function displayedBedType(value) {
  return value ? bedTypeLabel(value) : "Chưa cập nhật";
}

function capacityLabel(roomType) {
  const adults = roomType?.maxAdults;
  const children = roomType?.maxChildren;

  if (adults === null || adults === undefined) return "Chưa cập nhật sức chứa";
  if (children === null || children === undefined) {
    return `${adults} người lớn · Chưa cập nhật số trẻ em`;
  }

  return `${adults} người lớn · ${children} trẻ em`;
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
  const [realtimeTick, setRealtimeTick] = useState(0);
  useRealtimeRefresh("NOTIFICATION_CREATED", () => setRealtimeTick((value) => value + 1), { debounceMs: 120 });
  const [searchParams, setSearchParams] = useSearchParams();
  const setSearchParamsRef = useRef(setSearchParams);
  const roomTypesRequestRef = useRef(0);
  const [hotels, setHotels] = useState([]);
  const [hotelId, setHotelId] = useState(searchParams.get("hotelId") ?? "");
  const [roomTypes, setRoomTypes] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [renumberRooms, setRenumberRooms] = useState([]);
  const [loadingRenumberRooms, setLoadingRenumberRooms] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [files, setFiles] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [detailRoomType, setDetailRoomType] = useState(null);
  const [detailImageIndex, setDetailImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [imageActionId, setImageActionId] = useState("");
  const [imageManagerRoomType, setImageManagerRoomType] = useState(null);
  const [imageManagerUploading, setImageManagerUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setSearchParamsRef.current = setSearchParams;
  }, [setSearchParams]);

  useEffect(() => {
    const requestedHotelId = searchParams.get("hotelId") ?? "";

    setHotelId((current) => {
      const requestedIsValid =
        requestedHotelId &&
        (hotels.length === 0 ||
          hotels.some((hotel) => hotel.id === requestedHotelId));

      const nextHotelId = requestedIsValid
        ? requestedHotelId
        : hotels.some((hotel) => hotel.id === current)
          ? current
          : hotels[0]?.id ?? "";

      return current === nextHotelId ? current : nextHotelId;
    });
  }, [hotels, searchParams]);

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

  const imageManagerImages = useMemo(
    () => roomTypeImages(imageManagerRoomType),
    [imageManagerRoomType],
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

  useEffect(() => {
    if (!hotelId) {
      roomTypesRequestRef.current += 1;
      setRoomTypes([]);
      setLoadingTypes(false);
      return;
    }

    const requestId = roomTypesRequestRef.current + 1;
    roomTypesRequestRef.current = requestId;

    async function loadTypes() {
      setLoadingTypes(true);
      setError("");

      try {
        const data = await getRoomTypes(hotelId);
        if (roomTypesRequestRef.current === requestId) {
          setRoomTypes(Array.isArray(data) ? data : []);
        }
      } catch (requestError) {
        if (roomTypesRequestRef.current === requestId) {
          setError(errorMessage(requestError));
        }
      } finally {
        if (roomTypesRequestRef.current === requestId) {
          setLoadingTypes(false);
        }
      }
    }

    loadTypes();
  }, [hotelId, realtimeTick]);

  useEffect(() => {
    if (!hotelId || hotels.length === 0) return;

    const nextSearch = new URLSearchParams({ hotelId });
    setSearchParamsRef.current((current) =>
      current.toString() === nextSearch.toString() ? current : nextSearch,
      { replace: true },
    );
  }, [hotelId, hotels.length]);

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
    if (!imageManagerRoomType?.id) return;

    const refreshed = roomTypes.find(
      (roomType) => roomType.id === imageManagerRoomType.id,
    );

    if (refreshed) setImageManagerRoomType(refreshed);
  }, [roomTypes, imageManagerRoomType?.id]);

  useEffect(() => {
    if (!showForm && !detailRoomType && !imageManagerRoomType) {
      document.body.style.removeProperty("overflow");
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        if (imageManagerRoomType) {
          setImageManagerRoomType(null);
        } else if (detailRoomType) {
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
  }, [showForm, detailRoomType, imageManagerRoomType, detailImages.length]);

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
      maxAdults: roomType.maxAdults ?? "",
      maxChildren: roomType.maxChildren ?? "",
      bedType: roomType.bedType ?? "",
      bedCount: roomType.bedCount ?? "",
      areaSqm: roomType.areaSqm ?? "",
      breakfastIncluded: Boolean(roomType.breakfastIncluded),
      refundable: Boolean(roomType.refundable),
      smokingAllowed: Boolean(roomType.smokingAllowed),
      payAtHotelAllowed: roomType.payAtHotelAllowed !== false,
      depositAllowed: roomType.depositAllowed !== false,
      depositPercent: Number(roomType.depositPercent ?? 30),
      fullPaymentAllowed: roomType.fullPaymentAllowed !== false,
      amenities: roomType.amenities ?? [],
      status: roomType.status ?? "",
      roomCount: roomType.roomCount ?? 0,
      roomChangeMode: "KEEP",
      roomChangeCount: 0,
      startNumber: "",
      floor: "",
      renameRoomId: "",
      renameRoomNumber: "",
      renameFloor: "",
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

  function openImageManager(roomType) {
    setImageManagerRoomType(roomType);
    setError("");
    setMessage("");
  }

  function closeImageManager() {
    if (!imageManagerUploading && !imageActionId) {
      setImageManagerRoomType(null);
    }
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
                "roomChangeCount",
                "startNumber",
                "floor",
                "renameFloor",
                "depositPercent",
              ].includes(name)
            ? (value === "" ? "" : Number(value))
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

    if (count === 0) return [];

    const start = Number(form.startNumber);

    return Array.from({ length: count }, (_, index) => ({
      roomTypeId,
      roomNumber: String(start + index),
      floor: form.floor === "" ? null : Number(form.floor),
      customPrice: null,
      note: "",
    }));
  }

  function previewNewRoomNumbers(count = Number(form.roomChangeCount || form.roomCount || 0)) {
    const start = Number(form.startNumber);
    if (!Number.isInteger(start) || start < 0 || !Number.isInteger(count) || count <= 0) {
      return [];
    }

    return Array.from({ length: Math.min(count, 6) }, (_, index) =>
      String(start + index),
    );
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

  function managedRoomsFromResponse(managed) {
    return Array.isArray(managed)
      ? managed
      : Array.isArray(managed?.content)
        ? managed.content
        : Array.isArray(managed?.rooms)
          ? managed.rooms
          : [];
  }

  async function loadRoomsForRenumber(roomTypeId) {
    const managed = await getManagedRooms(hotelId);
    return managedRoomsFromResponse(managed)
      .filter((room) => roomBelongsToType(room, roomTypeId) && roomIsActive(room))
      .sort((left, right) =>
        String(left.roomNumber ?? "").localeCompare(
          String(right.roomNumber ?? ""),
          "vi",
          { numeric: true },
        ),
      );
  }

  async function activateRenumberMode() {
    if (!editingId) return;

    setForm((current) => ({
      ...current,
      roomChangeMode: "RENAME",
      roomChangeCount: 0,
      startNumber: "",
      floor: "",
      renameRoomId: "",
      renameRoomNumber: "",
      renameFloor: "",
    }));

    setLoadingRenumberRooms(true);
    setError("");

    try {
      const rooms = await loadRoomsForRenumber(editingId);
      setRenumberRooms(rooms);
    } catch (requestError) {
      setRenumberRooms([]);
      setError(errorMessage(requestError));
    } finally {
      setLoadingRenumberRooms(false);
    }
  }

  function selectRoomForRenumber(roomId) {
    const room = renumberRooms.find((item) => String(item.id) === String(roomId));

    setForm((current) => ({
      ...current,
      renameRoomId: roomId,
      renameRoomNumber: room?.roomNumber ?? "",
      renameFloor: room?.floor ?? "",
    }));
  }

  async function syncRenamedRoom(roomTypeId) {
    const roomId = String(form.renameRoomId ?? "").trim();
    const nextRoomNumber = String(form.renameRoomNumber ?? "").trim();

    if (!roomId) {
      throw new Error("Vui lòng chọn phòng cần đổi số.");
    }

    if (!nextRoomNumber) {
      throw new Error("Vui lòng nhập số phòng mới.");
    }

    const rooms = await loadRoomsForRenumber(roomTypeId);
    const target = rooms.find((room) => String(room.id) === roomId);

    if (!target) {
      throw new Error("Không tìm thấy phòng cần đổi số. Hãy tải lại trang và thử lại.");
    }

    const currentStatus = String(target.status ?? "").toUpperCase();
    if (["OCCUPIED", "CLEANING"].includes(currentStatus)) {
      throw new Error(
        `Phòng ${target.roomNumber} đang ${currentStatus === "OCCUPIED" ? "có khách lưu trú" : "chờ dọn"}. Hãy đổi số sau khi phòng trở về trạng thái trống hoặc bảo trì.`,
      );
    }

    const nextFloor = form.renameFloor === "" ? null : Number(form.renameFloor);
    if (form.renameFloor !== "" && !Number.isInteger(nextFloor)) {
      throw new Error("Tầng phải là số nguyên hoặc để trống.");
    }

    const sameNumber = String(target.roomNumber ?? "").trim() === nextRoomNumber;
    const currentFloor = target.floor == null ? null : Number(target.floor);
    if (sameNumber && currentFloor === nextFloor) {
      throw new Error("Số phòng và tầng chưa thay đổi.");
    }

    await updateRoom(target.id, {
      roomTypeId: target.roomTypeId ?? target.roomType?.id ?? roomTypeId,
      roomNumber: nextRoomNumber,
      floor: nextFloor,
      status: target.status,
      customPrice: target.customPrice ?? null,
      note: target.note ?? "",
    });

    return {
      previousRoomNumber: target.roomNumber,
      nextRoomNumber,
    };
  }

  async function syncEditedRooms(roomTypeId) {
    const mode = form.roomChangeMode ?? "KEEP";
    const changeCount = Math.max(0, Number(form.roomChangeCount ?? 0));

    if (mode === "KEEP") {
      return { added: 0, removed: 0 };
    }

    if (mode === "RENAME") {
      const renamed = await syncRenamedRoom(roomTypeId);
      return { added: 0, removed: 0, renamed };
    }

    if (changeCount === 0) {
      return { added: 0, removed: 0 };
    }

    const managed = await getManagedRooms(hotelId);
    const allRooms = managedRoomsFromResponse(managed);

    const activeRooms = allRooms.filter(
      (room) => roomBelongsToType(room, roomTypeId) && roomIsActive(room),
    );

    if (mode === "ADD") {
      if (activeRooms.length + changeCount > 200) {
        throw new Error("Mỗi loại phòng chỉ được quản lý tối đa 200 phòng hoạt động.");
      }

      const start = Number(form.startNumber);
      const rooms = Array.from({ length: changeCount }, (_, index) => ({
        roomTypeId,
        roomNumber: String(start + index),
        floor: form.floor === "" ? null : Number(form.floor),
        customPrice: null,
        note: "",
      }));

      await createRoomsBatch(hotelId, rooms);
      return { added: rooms.length, removed: 0 };
    }

    if (mode !== "REDUCE") {
      return { added: 0, removed: 0 };
    }

    if (changeCount > activeRooms.length) {
      throw new Error(`Không thể ngừng ${changeCount} phòng vì loại phòng hiện chỉ có ${activeRooms.length} phòng hoạt động.`);
    }

    const removable = activeRooms
      .filter(roomCanBeDeactivated)
      .sort((left, right) =>
        String(right.roomNumber ?? "").localeCompare(
          String(left.roomNumber ?? ""),
          "vi",
          { numeric: true },
        ),
      );

    if (removable.length < changeCount) {
      throw new Error(
        `Bạn muốn ngừng ${changeCount} phòng nhưng hiện chỉ có ${removable.length} phòng đang trống hoặc bảo trì có thể ngừng an toàn. Phòng đang có khách hoặc cần dọn sẽ được giữ nguyên.`,
      );
    }

    const targets = removable.slice(0, changeCount);
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
      bedType: form.bedType || null,
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

    const currentRoomCount = editingId
      ? Number(editingRoomType?.roomCount ?? 0)
      : 0;
    const startNumber = Number(form.startNumber);

    if (!editingId) {
      const requestedRoomCount = Number(form.roomCount);

      if (
        form.roomCount === ""
        || !Number.isInteger(requestedRoomCount)
        || requestedRoomCount < 0
        || requestedRoomCount > 200
      ) {
        setError("Số lượng phòng ban đầu phải là số nguyên từ 0 đến 200.");
        setSubmitting(false);
        return;
      }

      if (
        requestedRoomCount > 0
        && (form.startNumber === "" || !Number.isInteger(startNumber) || startNumber < 0)
      ) {
        setError("Vui lòng nhập số phòng đầu tiên. Ví dụ: 101 để tạo 101, 102, 103...");
        setSubmitting(false);
        return;
      }
    } else if (form.roomChangeMode === "RENAME") {
      if (!String(form.renameRoomId ?? "").trim()) {
        setError("Vui lòng chọn phòng cần đổi số.");
        setSubmitting(false);
        return;
      }

      if (!String(form.renameRoomNumber ?? "").trim()) {
        setError("Vui lòng nhập số phòng mới.");
        setSubmitting(false);
        return;
      }

      if (form.renameFloor !== "" && !Number.isInteger(Number(form.renameFloor))) {
        setError("Tầng phải là số nguyên hoặc để trống.");
        setSubmitting(false);
        return;
      }
    } else if (form.roomChangeMode !== "KEEP") {
      const changeCount = Number(form.roomChangeCount);

      if (!Number.isInteger(changeCount) || changeCount < 1 || changeCount > 200) {
        setError("Vui lòng nhập số phòng muốn thêm/ngừng từ 1 đến 200.");
        setSubmitting(false);
        return;
      }

      if (
        form.roomChangeMode === "ADD"
        && (form.startNumber === "" || !Number.isInteger(startNumber) || startNumber < 0)
      ) {
        setError("Vui lòng nhập số phòng đầu tiên cho các phòng mới, ví dụ 106.");
        setSubmitting(false);
        return;
      }

      if (form.roomChangeMode === "REDUCE" && changeCount > currentRoomCount) {
        setError(`Loại phòng hiện chỉ có ${currentRoomCount} phòng hoạt động.`);
        setSubmitting(false);
        return;
      }
    }

    if (form.floor !== "" && !Number.isInteger(Number(form.floor))) {
      setError("Tầng của phòng mới phải là số nguyên hoặc để trống.");
      setSubmitting(false);
      return;
    }

    try {
      if (editingId) {
        const previousApproval = editingRoomType?.approvalStatus;
        await updateRoomType(editingId, payload);

        if (files.length > 0) {
          await uploadRoomTypeImages(editingId, files);
        }

        const roomSync = await syncEditedRooms(editingId);
        const refreshedTypes = await refreshRoomTypes();
        const refreshedRoomType = refreshedTypes.find((item) => item.id === editingId);

        const roomMessage =
          roomSync.renamed
            ? ` Đã đổi phòng ${roomSync.renamed.previousRoomNumber} thành ${roomSync.renamed.nextRoomNumber}.`
            : roomSync.added > 0
              ? ` Đã tạo thêm ${roomSync.added} phòng.`
              : roomSync.removed > 0
                ? ` Đã ngừng hoạt động ${roomSync.removed} phòng.`
                : "";

        const approvalMessage =
          previousApproval === "APPROVED"
            ? refreshedRoomType?.approvalStatus === "APPROVED"
              ? " Thay đổi nhỏ đã áp dụng ngay, không cần xét duyệt lại."
              : " Thay đổi quan trọng cần System Admin xét duyệt lại trước khi công khai."
            : "";

        setMessage(`Đã cập nhật loại phòng.${roomMessage}${approvalMessage}`);
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

  async function refreshImageTarget(roomTypeId) {
    const types = await refreshRoomTypes();
    const refreshed = types.find((item) => item.id === roomTypeId) ?? null;

    if (imageManagerRoomType?.id === roomTypeId && refreshed) {
      setImageManagerRoomType(refreshed);
    }

    return refreshed;
  }

  async function handleSetCover(roomTypeId, image) {
    if (!roomTypeId || !image.id || image.id === "cover-url") return;

    setImageActionId(String(image.id));
    setError("");

    try {
      await setRoomTypeCover(roomTypeId, image.id);
      await refreshImageTarget(roomTypeId);
      setMessage("Đã đổi ảnh bìa loại phòng. Thay đổi ảnh không cần xét duyệt lại.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setImageActionId("");
    }
  }

  async function handleDeleteExistingImage(roomTypeId, image) {
    if (!roomTypeId || !image.id || image.id === "cover-url") return;

    if (!window.confirm("Xóa ảnh này khỏi loại phòng?")) return;

    setImageActionId(String(image.id));
    setError("");

    try {
      await deleteRoomTypeImage(roomTypeId, image.id);
      await refreshImageTarget(roomTypeId);
      setMessage("Đã xóa ảnh loại phòng. Thay đổi ảnh không cần xét duyệt lại.");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setImageActionId("");
    }
  }

  async function handleImageManagerUpload(event) {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (!imageManagerRoomType?.id || selectedFiles.length === 0) return;

    setImageManagerUploading(true);
    setError("");

    try {
      await uploadRoomTypeImages(imageManagerRoomType.id, selectedFiles);
      await refreshImageTarget(imageManagerRoomType.id);
      setMessage(`Đã thêm ${selectedFiles.length} ảnh. Ảnh mới không làm mất trạng thái đã duyệt.`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setImageManagerUploading(false);
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
    if (!window.confirm(`Gửi loại phòng “${roomType.name}” để xét duyệt?`)) {
      return;
    }
    setError("");
    try {
      const updated = await submitRoomType(roomType.id);
      setRoomTypes((current) => current.map((item) => item.id === roomType.id ? updated : item));
      setMessage("Đã gửi loại phòng để xét duyệt.");
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
    <div className="admin-page catalog-page catalog-experience catalog-room-types-page">
      <PageHeader
        className="catalog-heading catalog-experience__header"
        eyebrow="DANH MỤC PHÒNG"
        title="Loại phòng khách sạn"
        description="Quản lý giá, sức chứa, tiện nghi, hình ảnh, chính sách thanh toán và số phòng thực tế của từng loại phòng."
        actions={(
          <button
            type="button"
            className="catalog-primary"
            onClick={openCreate}
            disabled={!hotelId}
          >
            <Plus size={18} />
            Thêm loại phòng
          </button>
        )}
      />

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
                {hotel.name} · {approvalLabel(hotel.approvalStatus)}
              </option>
            ))}
          </select>
        </label>

        {selectedHotel ? (
          <div className="catalog-meta">
            <BedDouble size={18} />
            {valueWithUnit(selectedHotel.roomTypeCount, " loại phòng")} ·{" "}
            {valueWithUnit(selectedHotel.roomCount, " phòng")}
          </div>
        ) : null}
      </section>

      {loadingTypes ? (
        <Loading message="Đang tải loại phòng..." />
      ) : roomTypes.length === 0 ? (
        <EmptyState
          className="catalog-card catalog-empty"
          icon={<BedDouble size={46} />}
          title="Chưa có loại phòng"
          description="Tạo loại phòng đầu tiên bằng thông tin và hình ảnh thực tế của khách sạn."
          actions={hotelId ? (
            <button type="button" className="catalog-primary" onClick={openCreate}>
              <Plus size={18} />
              Tạo loại phòng
            </button>
          ) : null}
        />
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
                    <img src={images[0].url} alt={roomType.name} loading="lazy" decoding="async" />
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

                  <StatusBadge
                    className="catalog-status"
                    status={roomType.approvalStatus}
                    label={approvalLabel(roomType.approvalStatus)}
                    tone={statusTone(roomType.approvalStatus)}
                    size="sm"
                  />
                  {roomType.approvalStatus === "REJECTED" ? (
                    <div className="catalog-rejection-callout compact" role="status">
                      <strong>Lý do từ chối</strong>
                      <span>{roomType.rejectionReason || "Chưa cập nhật"}</span>
                    </div>
                  ) : null}

                  <p>{roomType.description || "Chưa có mô tả."}</p>

                  <div className="catalog-meta">
                    <Users size={16} />
                    {capacityLabel(roomType)}
                  </div>

                  <div className="catalog-tags">
                    <span>{valueWithUnit(roomType.areaSqm, " m²")}</span>
                    <span>
                      {roomType.bedCount === null || roomType.bedCount === undefined
                        ? "Chưa cập nhật số giường"
                        : `${roomType.bedCount} × ${displayedBedType(roomType.bedType)}`}
                    </span>
                    <span>{valueWithUnit(roomType.roomCount, " phòng")}</span>
                    <span>{images.length} ảnh</span>
                    {roomType.breakfastIncluded ? <span>Có bữa sáng</span> : null}
                    {roomType.refundable ? <span>Hoàn tiền</span> : null}
                    {roomType.payAtHotelAllowed !== false ? (
                      <span>Trả tại khách sạn</span>
                    ) : null}
                    {roomType.depositAllowed !== false ? (
                      <span>
                        {roomType.depositPercent === null || roomType.depositPercent === undefined
                          ? "Đặt cọc · Chưa cập nhật tỷ lệ"
                          : `Đặt cọc ${roomType.depositPercent}%`}
                      </span>
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
                    onClick={() => openImageManager(roomType)}
                  >
                    <Images size={16} />
                    Quản lý ảnh
                  </button>

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
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeForm();
            }
          }}
        >
          <form
            className="catalog-modal"
            onSubmit={handleSubmit}
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-type-form-title"
          >
            <div className="catalog-modal-header">
              <div>
                <span className="catalog-kicker">
                  {editingId ? "CẬP NHẬT" : "THÊM MỚI"}
                </span>
                <h2 id="room-type-form-title">{editingId ? "Chỉnh sửa loại phòng" : "Tạo loại phòng"}</h2>
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

            {editingId && editingRoomType?.approvalStatus === "APPROVED" ? (
              <div className="catalog-smart-approval-note">
                <Info size={19} />
                <div>
                  <strong>Không phải chỉnh sửa nào cũng cần duyệt lại</strong>
                  <p>
                    Mô tả, tiện nghi, hình ảnh, số phòng và điều chỉnh giá không quá 25%
                    được áp dụng ngay. Đổi tên, thay sức chứa/giường/diện tích, chính sách
                    thanh toán hoặc tăng giá hơn 25% sẽ chuyển về trạng thái cần xét duyệt lại.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="catalog-form-grid">
              <label className="catalog-field catalog-field-full">
                <span>Tên loại phòng *</span>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Nhập tên loại phòng đang sử dụng tại khách sạn"
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
                  required
                />
              </label>

              <label className="catalog-field">
                <span>Loại giường</span>
                <select
                  name="bedType"
                  value={form.bedType}
                  onChange={handleChange}
                >
                  <option value="">Chưa cập nhật</option>
                  {form.bedType && !bedTypes.includes(form.bedType) ? (
                    <option value={form.bedType}>{displayedBedType(form.bedType)}</option>
                  ) : null}
                  {bedTypes.map((bed) => (
                    <option key={bed} value={bed}>
                      {displayedBedType(bed)}
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
                  required
                />
              </label>

              {editingId ? (
                <label className="catalog-field">
                  <span>Trạng thái</span>
                  <select
                    name="status"
                    value={form.status}
                    onChange={handleChange}
                    required
                  >
                    <option value="" disabled>Chọn trạng thái</option>
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
                          <img src={image.url} alt="Ảnh loại phòng" loading="lazy" decoding="async" />

                          {image.isCover ? (
                            <span className="catalog-image-cover">Ảnh bìa</span>
                          ) : (
                            <button
                              type="button"
                              className="catalog-set-cover"
                              disabled={imageActionId === String(image.id)}
                              onClick={() => handleSetCover(editingId, image)}
                            >
                              Đặt làm bìa
                            </button>
                          )}

                          {image.id !== "cover-url" ? (
                            <button
                              type="button"
                              className="catalog-delete-image"
                              disabled={imageActionId === String(image.id)}
                              onClick={() => handleDeleteExistingImage(editingId, image)}
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

            <div className="catalog-field catalog-field-full catalog-room-inventory-editor">
              <span>{editingId ? "Phòng thực tế" : "Tạo phòng ban đầu"}</span>

              {editingId ? (
                <>
                  <div className="catalog-room-current">
                    <div>
                      <DoorOpen size={21} />
                      <span>Đang có</span>
                      <strong>{valueWithUnit(editingRoomType?.roomCount, " phòng")}</strong>
                    </div>
                    <p>
                      Chỉ chọn một thao tác khi bạn thật sự muốn thay đổi số phòng.
                      Nếu chỉ sửa tên, mô tả, giá hoặc tiện nghi, hãy để “Giữ nguyên”.
                    </p>
                  </div>

                  <div className="catalog-room-change-modes" role="group" aria-label="Chọn cách thay đổi số phòng">
                    <button
                      type="button"
                      className={form.roomChangeMode === "KEEP" ? "active" : ""}
                      onClick={() => setForm((current) => ({ ...current, roomChangeMode: "KEEP", roomChangeCount: 0, startNumber: "", floor: "", renameRoomId: "", renameRoomNumber: "", renameFloor: "" }))}
                    >
                      <Check size={18} />
                      <span><strong>Giữ nguyên</strong><small>Không tạo hoặc ngừng phòng</small></span>
                    </button>
                    <button
                      type="button"
                      className={form.roomChangeMode === "ADD" ? "active" : ""}
                      onClick={() => setForm((current) => ({ ...current, roomChangeMode: "ADD", roomChangeCount: current.roomChangeCount || 1, renameRoomId: "", renameRoomNumber: "", renameFloor: "" }))}
                    >
                      <Plus size={18} />
                      <span><strong>Thêm phòng</strong><small>Tạo thêm phòng thực tế</small></span>
                    </button>
                    <button
                      type="button"
                      className={form.roomChangeMode === "REDUCE" ? "active danger" : ""}
                      onClick={() => setForm((current) => ({ ...current, roomChangeMode: "REDUCE", roomChangeCount: current.roomChangeCount || 1, startNumber: "", floor: "", renameRoomId: "", renameRoomNumber: "", renameFloor: "" }))}
                    >
                      <Minus size={18} />
                      <span><strong>Giảm phòng</strong><small>Ngừng phòng trống/bảo trì</small></span>
                    </button>
                    <button
                      type="button"
                      className={form.roomChangeMode === "RENAME" ? "active" : ""}
                      onClick={activateRenumberMode}
                    >
                      <Edit3 size={18} />
                      <span><strong>Đổi số phòng</strong><small>Ví dụ 106 → 208</small></span>
                    </button>
                  </div>

                  {form.roomChangeMode === "ADD" ? (
                    <div className="catalog-room-change-panel">
                      <label className="catalog-field">
                        <span>Số phòng muốn thêm</span>
                        <input name="roomChangeCount" type="number" min="1" max="200" value={form.roomChangeCount} onChange={handleChange} />
                      </label>
                      <label className="catalog-field">
                        <span>Số phòng đầu tiên</span>
                        <input name="startNumber" type="number" min="0" value={form.startNumber} onChange={handleChange} placeholder="Ví dụ: 106" />
                        <small>Ví dụ thêm 3 phòng từ 106 → 106, 107, 108.</small>
                      </label>
                      <label className="catalog-field">
                        <span>Tầng</span>
                        <input name="floor" type="number" value={form.floor} onChange={handleChange} placeholder="Ví dụ: 1" />
                      </label>
                      {previewNewRoomNumbers().length > 0 ? (
                        <div className="catalog-room-preview">
                          <span>Sẽ tạo:</span>
                          <strong>{previewNewRoomNumbers().join(", ")}{Number(form.roomChangeCount) > 6 ? "…" : ""}</strong>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {form.roomChangeMode === "RENAME" ? (
                    <div className="catalog-room-change-panel catalog-room-rename-panel">
                      <div className="catalog-room-rename-heading">
                        <strong>Đổi số một phòng thực tế</strong>
                        <small>Thao tác này không thay đổi loại phòng và không cần System Admin duyệt lại.</small>
                      </div>

                      <label className="catalog-field">
                        <span>Phòng hiện tại</span>
                        <select
                          value={form.renameRoomId}
                          onChange={(event) => selectRoomForRenumber(event.target.value)}
                          disabled={loadingRenumberRooms}
                        >
                          <option value="">
                            {loadingRenumberRooms ? "Đang tải phòng..." : "Chọn phòng cần đổi"}
                          </option>
                          {renumberRooms.map((room) => (
                            <option key={room.id} value={room.id}>
                              Phòng {room.roomNumber}
                              {room.floor != null ? ` · Tầng ${room.floor}` : ""}
                              {room.status ? ` · ${statusLabel(room.status)}` : ""}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="catalog-field">
                        <span>Số phòng mới</span>
                        <input
                          name="renameRoomNumber"
                          value={form.renameRoomNumber}
                          onChange={handleChange}
                          maxLength={40}
                          placeholder="Ví dụ: 208"
                          disabled={!form.renameRoomId}
                        />
                      </label>

                      <label className="catalog-field">
                        <span>Tầng</span>
                        <input
                          name="renameFloor"
                          type="number"
                          value={form.renameFloor}
                          onChange={handleChange}
                          placeholder="Ví dụ: 2"
                          disabled={!form.renameRoomId}
                        />
                        <small>Giữ nguyên số tầng hiện tại hoặc sửa nếu phòng chuyển tầng.</small>
                      </label>

                      {form.renameRoomId && form.renameRoomNumber ? (
                        <div className="catalog-room-preview catalog-room-rename-preview">
                          <span>Kết quả:</span>
                          <strong>
                            Phòng {form.renameRoomNumber}
                            {form.renameFloor !== "" ? ` · Tầng ${form.renameFloor}` : ""}
                          </strong>
                        </div>
                      ) : null}

                      <div className="catalog-room-safety-note">
                        <Info size={18} />
                        <p>
                          Không đổi số khi phòng đang <strong>có khách</strong> hoặc <strong>chờ dọn</strong>.
                          Số phòng mới phải chưa tồn tại trong cùng khách sạn.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {form.roomChangeMode === "REDUCE" ? (
                    <div className="catalog-room-change-panel catalog-room-reduce-panel">
                      <label className="catalog-field">
                        <span>Số phòng muốn ngừng hoạt động</span>
                        <input name="roomChangeCount" type="number" min="1" max={Math.max(1, Number(editingRoomType?.roomCount ?? 1))} value={form.roomChangeCount} onChange={handleChange} />
                      </label>
                      <div className="catalog-room-safety-note">
                        <Info size={18} />
                        <p>
                          Hệ thống chỉ ngừng các phòng đang <strong>trống</strong> hoặc <strong>bảo trì</strong>,
                          ưu tiên số phòng lớn nhất. Phòng đang có khách hoặc đang chờ dọn sẽ không bị đụng tới.
                        </p>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="catalog-room-create-panel">
                  <label className="catalog-field">
                    <span>Số lượng phòng ban đầu</span>
                    <input name="roomCount" type="number" min="0" max="200" value={form.roomCount} onChange={handleChange} required />
                  </label>
                  <label className="catalog-field">
                    <span>Số phòng đầu tiên</span>
                    <input name="startNumber" type="number" min="0" value={form.startNumber} onChange={handleChange} required={Number(form.roomCount) > 0} placeholder="Ví dụ: 101" />
                    <small>Nếu tạo 5 phòng từ 101, hệ thống sẽ tạo 101 → 105.</small>
                  </label>
                  <label className="catalog-field">
                    <span>Tầng</span>
                    <input name="floor" type="number" value={form.floor} onChange={handleChange} placeholder="Ví dụ: 1" />
                  </label>
                  {previewNewRoomNumbers(Number(form.roomCount)).length > 0 ? (
                    <div className="catalog-room-preview">
                      <span>Sẽ tạo:</span>
                      <strong>{previewNewRoomNumbers(Number(form.roomCount)).join(", ")}{Number(form.roomCount) > 6 ? "…" : ""}</strong>
                    </div>
                  ) : null}
                </div>
              )}
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

      {imageManagerRoomType ? (
        <div
          className="catalog-modal-backdrop catalog-image-manager-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeImageManager();
          }}
        >
          <section
            className="catalog-image-manager-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-image-manager-title"
          >
            <div className="catalog-image-manager-header">
              <div>
                <span className="catalog-kicker">HÌNH ẢNH LOẠI PHÒNG</span>
                <h2 id="room-image-manager-title">Quản lý ảnh · {imageManagerRoomType.name}</h2>
                <p>Chọn ảnh đại diện khách hàng sẽ thấy đầu tiên. Đổi ảnh hoặc ảnh bìa không cần xét duyệt lại.</p>
              </div>
              <button type="button" className="catalog-icon-button" onClick={closeImageManager} aria-label="Đóng quản lý ảnh">
                <X size={19} />
              </button>
            </div>

            <label className="catalog-image-manager-upload">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                disabled={imageManagerUploading}
                onChange={handleImageManagerUpload}
              />
              <ImagePlus size={20} />
              <span>{imageManagerUploading ? "Đang tải ảnh..." : "Thêm ảnh mới"}</span>
            </label>

            {imageManagerImages.length === 0 ? (
              <div className="catalog-image-manager-empty">
                <ImagePlus size={42} />
                <strong>Loại phòng chưa có ảnh</strong>
                <span>Hãy thêm ảnh để khách hàng dễ hình dung phòng hơn.</span>
              </div>
            ) : (
              <div className="catalog-image-manager-grid">
                {imageManagerImages.map((image, index) => (
                  <article className={`catalog-image-manager-item${image.isCover ? " is-cover" : ""}`} key={image.id}>
                    <img src={image.url} alt={`${imageManagerRoomType.name} - ảnh ${index + 1}`} loading="lazy" decoding="async" />
                    <div className="catalog-image-manager-item-bar">
                      {image.isCover ? (
                        <span className="catalog-image-manager-cover-badge"><Check size={14} /> Ảnh bìa</span>
                      ) : (
                        <button
                          type="button"
                          className="catalog-image-manager-cover-button"
                          disabled={imageActionId === String(image.id)}
                          onClick={() => handleSetCover(imageManagerRoomType.id, image)}
                        >
                          Đặt làm ảnh bìa
                        </button>
                      )}
                      {image.id !== "cover-url" ? (
                        <button
                          type="button"
                          className="catalog-image-manager-delete"
                          disabled={imageActionId === String(image.id)}
                          onClick={() => handleDeleteExistingImage(imageManagerRoomType.id, image)}
                          aria-label={`Xóa ảnh ${index + 1}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {detailRoomType ? (
        <div
          className="room-detail-backdrop"
          role="presentation"
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
              <div className="room-detail-approval">
                <StatusBadge
                  status={detailRoomType.approvalStatus}
                  label={approvalLabel(detailRoomType.approvalStatus)}
                  tone={statusTone(detailRoomType.approvalStatus)}
                  size="sm"
                />
                {detailRoomType.approvalStatus === "REJECTED" ? (
                  <div className="catalog-rejection-callout compact" role="status">
                    <strong>Lý do từ chối</strong>
                    <span>{detailRoomType.rejectionReason || "Chưa cập nhật"}</span>
                  </div>
                ) : null}
              </div>

              <div className="room-detail-summary-tags">
                <span>
                  <Maximize2 size={16} />
                  {valueWithUnit(detailRoomType.areaSqm, " m²")}
                </span>
                <span>
                  <BedDouble size={16} />
                  {detailRoomType.bedCount === null || detailRoomType.bedCount === undefined
                    ? "Chưa cập nhật số giường"
                    : `${detailRoomType.bedCount} × ${displayedBedType(detailRoomType.bedType)}`}
                </span>
                <span>
                  <Users size={16} />
                  {capacityLabel(detailRoomType)}
                </span>
              </div>

              <div className="room-detail-price-panel">
                <div>
                  <small>Giá cơ bản mỗi đêm</small>
                  <strong>{money(detailRoomType.basePrice)}</strong>
                </div>
                <span>{valueWithUnit(detailRoomType.roomCount, " phòng")}</span>
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
                      <Check size={17} />
                      {detailRoomType.depositPercent === null || detailRoomType.depositPercent === undefined
                        ? "Đặt cọc online · Chưa cập nhật tỷ lệ"
                        : `Đặt cọc ${detailRoomType.depositPercent}% online`}
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