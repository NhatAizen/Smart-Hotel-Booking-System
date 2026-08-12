import {
  ArrowLeft,
  BadgeCheck,
  BedDouble,
  CalendarDays,
  Check,
  Clock3,
  CreditCard,
  FileText,
  Hotel,
  Mail,
  Phone,
  ReceiptText,
  ShieldCheck,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import ErrorMessage from "../../components/common/ErrorMessage";
import Loading from "../../components/common/Loading";
import {
  createBookingsBatch,
  createRoomHold,
  getBookingPricingQuote,
  getHotelAvailability,
  subscribeHotelAvailability,
} from "../../services/bookingService";
import {
  createPayOsCheckout,
  createWalletCheckout,
  getMyWallet,
} from "../../services/paymentService";
import {
  getHotelById,
  getRoomsByHotel,
  getRoomTypesByHotel,
} from "../../services/hotelService";
import "./BookingCheckoutPage.css";

function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 1;
  return Math.max(
    1,
    Math.round(
      (new Date(`${checkOut}T00:00:00`) -
        new Date(`${checkIn}T00:00:00`)) /
        86400000,
    ),
  );
}

function money(value) {
  return `${Number(value ?? 0).toLocaleString("vi-VN")} ₫`;
}

function splitName(fullName) {
  const parts = String(fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length <= 1) {
    return { lastName: "", firstName: parts[0] ?? "" };
  }

  return {
    lastName: parts.slice(0, -1).join(" "),
    firstName: parts.at(-1),
  };
}

function dateLabel(value) {
  if (!value) return "Chưa chọn";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function policyEnabled(value) {
  return value !== false;
}

function rangesOverlap(firstCheckIn, firstCheckOut, secondCheckIn, secondCheckOut) {
  if (!firstCheckIn || !firstCheckOut || !secondCheckIn || !secondCheckOut) {
    return true;
  }
  return firstCheckIn < secondCheckOut && firstCheckOut > secondCheckIn;
}

function holdCountdown(expiresAt, nowMs) {
  if (!expiresAt) return "00:00";
  const remainingMs = Math.max(0, new Date(expiresAt).getTime() - nowMs);
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function holdStorageKey(hotelId, roomIds, checkIn, checkOut) {
  return `enziuroomsRoomHold:${hotelId}:${[...roomIds].sort().join(",")}:${checkIn}:${checkOut}`;
}

export default function BookingCheckoutPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const hotelId = searchParams.get("hotelId") ?? "";
  const roomIds = useMemo(
    () =>
      (searchParams.get("roomIds") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [searchParams],
  );
  const checkIn = searchParams.get("checkIn") ?? "";
  const checkOut = searchParams.get("checkOut") ?? "";
  const adults = Number(searchParams.get("adults") ?? 1);
  const children = Number(searchParams.get("children") ?? 0);

  const initialName = splitName(user?.fullName);
  const [hotel, setHotel] = useState(null);
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [paymentOption, setPaymentOption] = useState("");
  const [fundingMethod, setFundingMethod] = useState("PAYOS");
  const [wallet, setWallet] = useState(null);
  const [form, setForm] = useState({
    bookerLastName: initialName.lastName,
    bookerFirstName: initialName.firstName,
    bookerEmail: user?.email ?? "",
    bookerPhone: "",
    bookerIsGuest: true,
    guestLastName: "",
    guestFirstName: "",
    guestPhone: "",
    specialRequest: "",
    invoiceRequested: false,
    invoiceCompanyName: "",
    invoiceTaxCode: "",
    invoiceAddress: "",
    invoiceEmail: user?.email ?? "",
    termsAccepted: false,
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [roomConflict, setRoomConflict] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [bookingHold, setBookingHold] = useState(null);
  const [holdLoading, setHoldLoading] = useState(true);
  const [holdClockMs, setHoldClockMs] = useState(() => Date.now());
  const [pricingQuote, setPricingQuote] = useState(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState("");

  useEffect(() => {
    async function load() {
      if (!hotelId || roomIds.length === 0 || !checkIn || !checkOut) {
        setError("Thông tin phòng đã chọn không đầy đủ.");
        setLoading(false);
        return;
      }

      try {
        const [hotelData, roomsData, roomTypeData] = await Promise.all([
          getHotelById(hotelId),
          getRoomsByHotel(hotelId),
          getRoomTypesByHotel(hotelId),
        ]);

        const rooms = Array.isArray(roomsData) ? roomsData : [];
        const types = Array.isArray(roomTypeData) ? roomTypeData : [];
        const pickedRooms = roomIds
          .map((roomId) => rooms.find((room) => String(room.id) === roomId))
          .filter(Boolean);

        if (pickedRooms.length !== roomIds.length) {
          throw new Error("Một phòng đã chọn không còn được mở bán.");
        }

        setHotel(hotelData);
        setSelectedRooms(pickedRooms);
        setRoomTypes(types);
      } catch (requestError) {
        setError(
          requestError.response?.data?.message ??
            requestError.message ??
            "Không thể tải trang xác nhận đặt phòng.",
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [hotelId, roomIds, checkIn, checkOut]);

  useEffect(() => {
    if (!hotelId || !checkIn || !checkOut || roomIds.length === 0 || !user?.id) {
      return undefined;
    }

    let active = true;
    const storageKey = holdStorageKey(hotelId, roomIds, checkIn, checkOut);
    let holdToken = "";
    try {
      holdToken = sessionStorage.getItem(storageKey) ?? "";
    } catch {
      holdToken = "";
    }
    if (!holdToken && globalThis.crypto?.randomUUID) {
      holdToken = globalThis.crypto.randomUUID();
      try {
        sessionStorage.setItem(storageKey, holdToken);
      } catch {
        // sessionStorage không khả dụng vẫn tiếp tục bằng token trong bộ nhớ.
      }
    }

    setHoldLoading(true);
    createRoomHold({
      hotelId,
      roomIds,
      checkIn,
      checkOut,
      holdToken: holdToken || null,
    })
      .then((hold) => {
        if (!active) return;
        setBookingHold(hold);
        setRoomConflict(false);
        setHoldClockMs(Date.now());
        setError((current) =>
          current.includes("khách khác giữ") ? "" : current,
        );
      })
      .catch((requestError) => {
        if (!active) return;
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          // ignore
        }
        setBookingHold(null);
        setRoomConflict(true);
        setError(
          requestError.response?.data?.message
            ?? "Không thể giữ phòng. Phòng có thể vừa được khách khác chọn.",
        );
      })
      .finally(() => {
        if (active) setHoldLoading(false);
      });

    return () => {
      active = false;
    };
  }, [hotelId, roomIds, checkIn, checkOut, user?.id]);

  useEffect(() => {
    if (!bookingHold?.expiresAt) return undefined;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setHoldClockMs(now);
      if (now >= new Date(bookingHold.expiresAt).getTime()) {
        setRoomConflict(true);
        setError("Thời gian giữ phòng đã hết. Vui lòng quay lại chọn phòng.");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [bookingHold?.expiresAt]);

  const refreshSelectedRoomAvailability = useCallback(async () => {
    if (
      !hotelId
      || !checkIn
      || !checkOut
      || roomIds.length === 0
      || holdLoading
      || !bookingHold?.holdToken
    ) {
      return false;
    }

    try {
      const availability = await getHotelAvailability(
        hotelId,
        checkIn,
        checkOut,
        bookingHold?.holdToken ?? null,
      );
      const unavailable = new Set(
        (Array.isArray(availability?.unavailableRoomIds)
          ? availability.unavailableRoomIds
          : []).map(String),
      );
      const hasConflict = roomIds.some((roomId) => unavailable.has(String(roomId)));
      setRoomConflict(hasConflict);
      if (hasConflict) {
        setError(
          "Một phòng bạn chọn vừa được khách khác giữ hoặc đặt. Vui lòng quay lại chọn phòng khác.",
        );
      } else {
        setError((current) =>
          current.includes("khách khác giữ") ? "" : current,
        );
      }
      return hasConflict;
    } catch {
      return false;
    }
  }, [
    hotelId,
    checkIn,
    checkOut,
    roomIds,
    bookingHold?.holdToken,
    holdLoading,
  ]);

  useEffect(() => {
    refreshSelectedRoomAvailability();
  }, [refreshSelectedRoomAvailability]);

  useEffect(() => {
    if (!hotelId) return undefined;
    return subscribeHotelAvailability(
      hotelId,
      (event) => {
        if (rangesOverlap(event?.checkIn, event?.checkOut, checkIn, checkOut)) {
          refreshSelectedRoomAvailability();
        }
      },
      {
        onConnected: () => setRealtimeConnected(true),
        onError: () => setRealtimeConnected(false),
      },
    );
  }, [hotelId, checkIn, checkOut, refreshSelectedRoomAvailability]);

  useEffect(() => {
    if (!user?.id) return;
    getMyWallet()
      .then(setWallet)
      .catch(() => setWallet(null));
  }, [user?.id]);

  const typeMap = useMemo(
    () => Object.fromEntries(roomTypes.map((type) => [String(type.id), type])),
    [roomTypes],
  );

  useEffect(() => {
    if (
      !hotelId
      || roomIds.length === 0
      || !checkIn
      || !checkOut
      || selectedRooms.length !== roomIds.length
    ) {
      setPricingQuote(null);
      return undefined;
    }

    let active = true;
    setPricingLoading(true);
    setPricingError("");

    getBookingPricingQuote({
      hotelId,
      roomIds,
      checkIn,
      checkOut,
    })
      .then((quote) => {
        if (!active) return;
        setPricingQuote(quote);
      })
      .catch((requestError) => {
        if (!active) return;
        setPricingQuote(null);
        setPricingError(
          requestError.response?.data?.message
            ?? requestError.response?.data?.detail
            ?? "Không thể tính giá theo ngày. Vui lòng thử lại.",
        );
      })
      .finally(() => {
        if (active) setPricingLoading(false);
      });

    return () => {
      active = false;
    };
  }, [hotelId, roomIds, checkIn, checkOut, selectedRooms]);

  const selectedItems = useMemo(() => {
    const nights = nightsBetween(checkIn, checkOut);
    const quoteMap = Object.fromEntries(
      (pricingQuote?.rooms ?? []).map((item) => [String(item.roomId), item]),
    );

    return selectedRooms.map((room) => {
      const roomType = typeMap[String(room.roomTypeId)] ?? {};
      const roomQuote = quoteMap[String(room.id)] ?? null;
      const nightlyPrice = Number(
        roomQuote?.nights?.[0]?.basePrice
          ?? room.customPrice
          ?? roomType.basePrice
          ?? 0,
      );
      const totalPrice = roomQuote
        ? Number(roomQuote.totalAmount ?? 0)
        : nightlyPrice * nights;
      const depositPercent = Number(roomType.depositPercent ?? 30);

      return {
        room,
        roomType,
        nightlyPrice,
        totalPrice,
        baseAmount: Number(roomQuote?.baseAmount ?? nightlyPrice * nights),
        weekendSurchargeAmount: Number(roomQuote?.weekendSurchargeAmount ?? 0),
        specialDateSurchargeAmount: Number(roomQuote?.specialDateSurchargeAmount ?? 0),
        nights: Array.isArray(roomQuote?.nights) ? roomQuote.nights : [],
        depositPercent,
        depositAmount: Math.round((totalPrice * depositPercent) / 100),
      };
    });
  }, [selectedRooms, typeMap, checkIn, checkOut, pricingQuote]);

  const availableOptions = useMemo(() => {
    if (selectedItems.length === 0) {
      return {
        PAY_AT_HOTEL: false,
        DEPOSIT: false,
        FULL_PAYMENT: false,
      };
    }

    return {
      PAY_AT_HOTEL: selectedItems.every((item) =>
        policyEnabled(item.roomType.payAtHotelAllowed),
      ),
      DEPOSIT: selectedItems.every((item) =>
        policyEnabled(item.roomType.depositAllowed),
      ),
      FULL_PAYMENT: selectedItems.every((item) =>
        policyEnabled(item.roomType.fullPaymentAllowed),
      ),
    };
  }, [selectedItems]);

  const effectivePaymentOption = useMemo(() => {
    if (paymentOption && availableOptions[paymentOption]) {
      return paymentOption;
    }

    return (
      ["PAY_AT_HOTEL", "DEPOSIT", "FULL_PAYMENT"].find(
        (option) => availableOptions[option],
      ) ?? ""
    );
  }, [availableOptions, paymentOption]);

  const totals = useMemo(() => {
    const total = Number(
      pricingQuote?.totalAmount
        ?? selectedItems.reduce((sum, item) => sum + item.totalPrice, 0),
    );
    const baseAmount = Number(
      pricingQuote?.baseAmount
        ?? selectedItems.reduce((sum, item) => sum + item.baseAmount, 0),
    );
    const weekendSurchargeAmount = Number(
      pricingQuote?.weekendSurchargeAmount
        ?? selectedItems.reduce(
          (sum, item) => sum + item.weekendSurchargeAmount,
          0,
        ),
    );
    const specialDateSurchargeAmount = Number(
      pricingQuote?.specialDateSurchargeAmount
        ?? selectedItems.reduce(
          (sum, item) => sum + item.specialDateSurchargeAmount,
          0,
        ),
    );
    const deposit = selectedItems.reduce(
      (sum, item) => sum + item.depositAmount,
      0,
    );
    const payNow =
      effectivePaymentOption === "FULL_PAYMENT"
        ? total
        : effectivePaymentOption === "DEPOSIT"
          ? deposit
          : 0;

    return {
      total,
      baseAmount,
      weekendSurchargeAmount,
      specialDateSurchargeAmount,
      deposit,
      payNow,
      remaining: total - payNow,
    };
  }, [selectedItems, effectivePaymentOption, pricingQuote]);

  const depositPercents = useMemo(
    () => [...new Set(selectedItems.map((item) => item.depositPercent))],
    [selectedItems],
  );

  function handleChange(event) {
    const { name, value, checked, type } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!user?.id) {
      setError("Không xác định được tài khoản. Vui lòng đăng nhập lại.");
      return;
    }
    if (!effectivePaymentOption) {
      setError("Không có phương thức thanh toán phù hợp cho các phòng đã chọn.");
      return;
    }
    if (pricingLoading || !pricingQuote) {
      setError(
        pricingError || "Giá theo ngày chưa được backend xác nhận. Vui lòng chờ vài giây rồi thử lại.",
      );
      return;
    }
    if (!form.bookerIsGuest && (!form.guestFirstName || !form.guestLastName)) {
      setError("Vui lòng nhập đầy đủ họ tên khách lưu trú.");
      return;
    }
    if (
      form.invoiceRequested &&
      (!form.invoiceCompanyName ||
        !form.invoiceTaxCode ||
        !form.invoiceAddress ||
        !form.invoiceEmail)
    ) {
      setError("Vui lòng nhập đầy đủ thông tin xuất hóa đơn.");
      return;
    }

    const conflictNow = await refreshSelectedRoomAvailability();
    if (conflictNow) return;

    setSubmitting(true);

    try {
      const bookings = await createBookingsBatch({
        customerId: user.id,
        hotelId,
        roomIds,
        checkIn,
        checkOut,
        adults,
        children,
        paymentOption: effectivePaymentOption,
        holdToken: bookingHold?.holdToken ?? null,
        ...form,
        guestLastName: form.bookerIsGuest ? null : form.guestLastName,
        guestFirstName: form.bookerIsGuest ? null : form.guestFirstName,
        guestPhone: form.bookerIsGuest ? null : form.guestPhone || null,
        specialRequest: form.specialRequest.trim() || null,
        invoiceCompanyName: form.invoiceRequested
          ? form.invoiceCompanyName
          : null,
        invoiceTaxCode: form.invoiceRequested ? form.invoiceTaxCode : null,
        invoiceAddress: form.invoiceRequested ? form.invoiceAddress : null,
        invoiceEmail: form.invoiceRequested ? form.invoiceEmail : null,
      });

      const safeBookings = Array.isArray(bookings) ? bookings : [];
      const bookingIds = safeBookings.map((booking) => booking.id);

      try {
        sessionStorage.removeItem(
          holdStorageKey(hotelId, roomIds, checkIn, checkOut),
        );
      } catch {
        // ignore
      }

      sessionStorage.setItem(
        "enziuroomsLastCheckout",
        JSON.stringify({
          hotelName: hotel?.name,
          roomNames: selectedItems.map((item) => item.roomType.name),
          checkIn,
          checkOut,
        }),
      );

      if (effectivePaymentOption === "PAY_AT_HOTEL") {
        navigate(
          `/customer/booking-success?bookingIds=${bookingIds.join(",")}`,
          { replace: true },
        );
        return;
      }

      if (fundingMethod === "WALLET") {
        await createWalletCheckout(bookingIds);
        navigate(
          `/customer/booking-success?bookingIds=${bookingIds.join(",")}`,
          { replace: true },
        );
        return;
      }

      const paymentOrder = await createPayOsCheckout(bookingIds);
      sessionStorage.setItem(
        "enziuroomsPayOsOrder",
        JSON.stringify({
          orderCode: paymentOrder.orderCode,
          bookingIds,
          expiresAt: paymentOrder.expiresAt,
        }),
      );

      if (!paymentOrder.checkoutUrl) {
        throw new Error("PayOS không trả về đường dẫn thanh toán.");
      }
      window.location.assign(paymentOrder.checkoutUrl);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ??
          requestError.response?.data?.detail ??
          "Không thể tạo đơn đặt phòng. Phòng có thể vừa được người khác đặt.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <Loading message="Đang chuẩn bị thông tin đặt phòng..." />;
  }

  return (
    <main className="checkout-page">
      <div className="container checkout-shell">
        <Link to={`/hotels/${hotelId}`} className="checkout-back-link">
          <ArrowLeft size={18} /> Quay lại chọn phòng
        </Link>

        <div className="checkout-heading">
          <span>XÁC NHẬN ĐẶT PHÒNG</span>
          <h1>Hoàn tất thông tin của bạn</h1>
          <p>
            Kiểm tra phòng, nhập thông tin liên hệ và chọn cách thanh toán phù hợp.
          </p>
        </div>

        <ErrorMessage message={error} />
        <ErrorMessage message={pricingError} />

        <div className={`checkout-realtime-status ${realtimeConnected ? "online" : "reconnecting"}`}>
          <span />
          {realtimeConnected
            ? "Đang kiểm tra kho phòng theo thời gian thực"
            : "Đang kết nối lại kho phòng thời gian thực"}
        </div>

        <div className={`checkout-hold-banner ${roomConflict ? "expired" : "active"}`}>
          <Clock3 size={18} />
          <div>
            <strong>
              {holdLoading
                ? "Đang giữ phòng cho bạn..."
                : roomConflict
                  ? "Phiên giữ phòng không còn hiệu lực"
                  : "Phòng đang được giữ riêng cho bạn"}
            </strong>
            <span>
              {bookingHold?.expiresAt && !roomConflict
                ? `Còn ${holdCountdown(bookingHold.expiresAt, holdClockMs)} để hoàn tất đặt phòng`
                : "EnziuRooms sẽ tự mở phòng lại khi hết thời gian giữ."}
            </span>
          </div>
        </div>

        <form className="checkout-grid" onSubmit={handleSubmit}>
          <div className="checkout-main-column">
            <section className="checkout-card">
              <div className="checkout-card-title">
                <UserRound size={22} />
                <div>
                  <h2>Thông tin người đặt</h2>
                  <p>Thông tin này được lưu cùng booking và dùng để liên hệ.</p>
                </div>
              </div>

              <div className="checkout-form-grid">
                <label>
                  <span>Họ *</span>
                  <input
                    name="bookerLastName"
                    value={form.bookerLastName}
                    onChange={handleChange}
                    placeholder="Trần"
                    required
                  />
                </label>
                <label>
                  <span>Tên *</span>
                  <input
                    name="bookerFirstName"
                    value={form.bookerFirstName}
                    onChange={handleChange}
                    placeholder="Nhật"
                    required
                  />
                </label>
                <label>
                  <span>Email *</span>
                  <div className="checkout-input-icon">
                    <Mail size={18} />
                    <input
                      name="bookerEmail"
                      type="email"
                      value={form.bookerEmail}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </label>
                <label>
                  <span>Số điện thoại *</span>
                  <div className="checkout-input-icon">
                    <Phone size={18} />
                    <input
                      name="bookerPhone"
                      type="tel"
                      minLength="8"
                      value={form.bookerPhone}
                      onChange={handleChange}
                      placeholder="0912345678"
                      required
                    />
                  </div>
                </label>
              </div>

              <label className="checkout-checkbox prominent">
                <input
                  name="bookerIsGuest"
                  type="checkbox"
                  checked={form.bookerIsGuest}
                  onChange={handleChange}
                />
                Tôi cũng là người lưu trú
              </label>

              {!form.bookerIsGuest ? (
                <div className="checkout-guest-box">
                  <h3>Thông tin khách lưu trú chính</h3>
                  <div className="checkout-form-grid">
                    <label>
                      <span>Họ khách lưu trú *</span>
                      <input
                        name="guestLastName"
                        value={form.guestLastName}
                        onChange={handleChange}
                        required
                      />
                    </label>
                    <label>
                      <span>Tên khách lưu trú *</span>
                      <input
                        name="guestFirstName"
                        value={form.guestFirstName}
                        onChange={handleChange}
                        required
                      />
                    </label>
                    <label className="checkout-field-full">
                      <span>Số điện thoại khách lưu trú</span>
                      <input
                        name="guestPhone"
                        value={form.guestPhone}
                        onChange={handleChange}
                      />
                    </label>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="checkout-card">
              <div className="checkout-card-title">
                <FileText size={22} />
                <div>
                  <h2>Yêu cầu đặc biệt</h2>
                  <p>Khách sạn sẽ cố gắng đáp ứng nhưng không thể đảm bảo hoàn toàn.</p>
                </div>
              </div>
              <textarea
                name="specialRequest"
                value={form.specialRequest}
                onChange={handleChange}
                rows={4}
                maxLength={1000}
                placeholder="Ví dụ: nhận phòng muộn, phòng tầng cao, không hút thuốc..."
              />
            </section>

            <section className="checkout-card">
              <div className="checkout-card-title">
                <ReceiptText size={22} />
                <div>
                  <h2>Thông tin xuất hóa đơn</h2>
                  <p>Không bắt buộc cho booking cá nhân.</p>
                </div>
              </div>

              <label className="checkout-checkbox prominent">
                <input
                  name="invoiceRequested"
                  type="checkbox"
                  checked={form.invoiceRequested}
                  onChange={handleChange}
                />
                Tôi cần xuất hóa đơn
              </label>

              {form.invoiceRequested ? (
                <div className="checkout-form-grid checkout-invoice-grid">
                  <label>
                    <span>Tên công ty *</span>
                    <input
                      name="invoiceCompanyName"
                      value={form.invoiceCompanyName}
                      onChange={handleChange}
                      required
                    />
                  </label>
                  <label>
                    <span>Mã số thuế *</span>
                    <input
                      name="invoiceTaxCode"
                      value={form.invoiceTaxCode}
                      onChange={handleChange}
                      required
                    />
                  </label>
                  <label className="checkout-field-full">
                    <span>Địa chỉ công ty *</span>
                    <input
                      name="invoiceAddress"
                      value={form.invoiceAddress}
                      onChange={handleChange}
                      required
                    />
                  </label>
                  <label className="checkout-field-full">
                    <span>Email nhận hóa đơn *</span>
                    <input
                      name="invoiceEmail"
                      type="email"
                      value={form.invoiceEmail}
                      onChange={handleChange}
                      required
                    />
                  </label>
                </div>
              ) : null}
            </section>

            <section className="checkout-card">
              <div className="checkout-card-title">
                <WalletCards size={22} />
                <div>
                  <h2>Phương thức thanh toán</h2>
                  <p>Chỉ hiển thị lựa chọn Hotel Admin đã bật cho loại phòng.</p>
                </div>
              </div>

              <div className="checkout-payment-options">
                {availableOptions.PAY_AT_HOTEL ? (
                  <label
                    className={`checkout-payment-option ${
                      effectivePaymentOption === "PAY_AT_HOTEL" ? "selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentOption"
                      value="PAY_AT_HOTEL"
                      checked={effectivePaymentOption === "PAY_AT_HOTEL"}
                      onChange={(event) => setPaymentOption(event.target.value)}
                    />
                    <div>
                      <strong>Thanh toán tại khách sạn</strong>
                      <span>Không cần thanh toán ngay. Thanh toán khi check-in.</span>
                    </div>
                    <em>{money(0)} hôm nay</em>
                  </label>
                ) : null}

                {availableOptions.DEPOSIT ? (
                  <label
                    className={`checkout-payment-option ${
                      effectivePaymentOption === "DEPOSIT" ? "selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentOption"
                      value="DEPOSIT"
                      checked={effectivePaymentOption === "DEPOSIT"}
                      onChange={(event) => setPaymentOption(event.target.value)}
                    />
                    <div>
                      <strong>
                        Đặt cọc online {depositPercents.length === 1 ? `${depositPercents[0]}%` : ""}
                      </strong>
                      <span>
                        Thanh toán {money(totals.deposit)} bằng PayOS hoặc Ví Enziu, còn lại {money(totals.total - totals.deposit)} tại khách sạn.
                      </span>
                    </div>
                    <em>{money(totals.deposit)}</em>
                  </label>
                ) : null}

                {availableOptions.FULL_PAYMENT ? (
                  <label
                    className={`checkout-payment-option ${
                      effectivePaymentOption === "FULL_PAYMENT" ? "selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentOption"
                      value="FULL_PAYMENT"
                      checked={effectivePaymentOption === "FULL_PAYMENT"}
                      onChange={(event) => setPaymentOption(event.target.value)}
                    />
                    <div>
                      <strong>Thanh toán toàn bộ online</strong>
                      <span>Thanh toán 100% bằng PayOS/VietQR hoặc số dư Ví Enziu.</span>
                    </div>
                    <em>{money(totals.total)}</em>
                  </label>
                ) : null}
              </div>

              {effectivePaymentOption !== "PAY_AT_HOTEL" ? (
                <>
                  <div className="checkout-funding-methods">
                    <label className={`checkout-funding-option ${fundingMethod === "PAYOS" ? "selected" : ""}`}>
                      <input
                        type="radio"
                        name="fundingMethod"
                        value="PAYOS"
                        checked={fundingMethod === "PAYOS"}
                        onChange={(event) => setFundingMethod(event.target.value)}
                      />
                      <CreditCard size={20} />
                      <span><strong>PayOS / VietQR</strong><small>Thanh toán từ tài khoản ngân hàng.</small></span>
                    </label>

                    <label className={`checkout-funding-option ${fundingMethod === "WALLET" ? "selected" : ""} ${Number(wallet?.availableBalance ?? 0) < totals.payNow ? "disabled" : ""}`}>
                      <input
                        type="radio"
                        name="fundingMethod"
                        value="WALLET"
                        checked={fundingMethod === "WALLET"}
                        onChange={(event) => setFundingMethod(event.target.value)}
                        disabled={Number(wallet?.availableBalance ?? 0) < totals.payNow}
                      />
                      <WalletCards size={20} />
                      <span>
                        <strong>Ví Enziu · {money(wallet?.availableBalance)}</strong>
                        <small>
                          {Number(wallet?.availableBalance ?? 0) >= totals.payNow
                            ? `Đủ để thanh toán ${money(totals.payNow)} ngay.`
                            : `Thiếu ${money(Math.max(0, totals.payNow - Number(wallet?.availableBalance ?? 0)))}.`}
                        </small>
                      </span>
                    </label>
                  </div>

                  <div className="checkout-vnpay-note">
                    {fundingMethod === "WALLET" ? <WalletCards size={20} /> : <CreditCard size={20} />}
                    <div>
                      <strong>{fundingMethod === "WALLET" ? "Thanh toán bằng Ví Enziu" : "PayOS - chuyển khoản ngân hàng thật"}</strong>
                      <span>
                        {fundingMethod === "WALLET"
                          ? "Tiền được trừ từ số dư ví và booking được xác nhận ngay, không chuyển sang PayOS."
                          : "Bạn sẽ được chuyển đến trang PayOS để quét VietQR."}
                      </span>
                    </div>
                  </div>
                </>
              ) : null}
            </section>

            <section className="checkout-card checkout-terms-card">
              <label className="checkout-checkbox">
                <input
                  name="termsAccepted"
                  type="checkbox"
                  checked={form.termsAccepted}
                  onChange={handleChange}
                  required
                />
                <span>
                  Tôi đồng ý với điều khoản sử dụng và đã đọc chính sách hủy phòng.
                </span>
              </label>
              <div>
                <ShieldCheck size={19} />
                Giá và phòng sẽ được backend kiểm tra lại trước khi tạo booking.
              </div>
            </section>
          </div>

          <aside className="checkout-summary-card">
            <div className="checkout-summary-hotel">
              <Hotel size={23} />
              <div>
                <small>Khách sạn</small>
                <strong>{hotel?.name ?? "Khách sạn"}</strong>
                <span>{hotel?.city ?? hotel?.address ?? ""}</span>
              </div>
            </div>

            <div className="checkout-date-row">
              <CalendarDays size={20} />
              <div>
                <span>{dateLabel(checkIn)}</span>
                <small>Nhận phòng</small>
              </div>
              <strong>→</strong>
              <div>
                <span>{dateLabel(checkOut)}</span>
                <small>Trả phòng</small>
              </div>
            </div>

            <div className="checkout-summary-meta">
              <span>
                <BedDouble size={17} /> {roomIds.length} phòng
              </span>
              <span>
                <Users size={17} /> {adults} người lớn · {children} trẻ em
              </span>
              <span>
                <BadgeCheck size={17} /> {nightsBetween(checkIn, checkOut)} đêm
              </span>
            </div>

            <div className="checkout-room-summary-list">
              {selectedItems.map((item) => (
                <div className="checkout-room-price-breakdown" key={item.room.id}>
                  <div className="checkout-room-price-main">
                    <span>
                      {item.roomType.name ?? `Phòng ${item.room.roomNumber}`}
                      <small>Phòng {item.room.roomNumber}</small>
                    </span>
                    <strong>{money(item.totalPrice)}</strong>
                  </div>

                  {item.nights.some((night) => Number(night.surchargeAmount ?? 0) > 0) ? (
                    <div className="checkout-nightly-price-list">
                      {item.nights
                        .filter((night) => Number(night.surchargeAmount ?? 0) > 0)
                        .map((night) => (
                          <span key={`${item.room.id}-${night.stayDate}`}>
                            <small>{dateLabel(night.stayDate)} · {night.pricingLabel}</small>
                            <b>{money(night.finalPrice)}</b>
                          </span>
                        ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="checkout-pricing-rule-note">
              {pricingLoading ? (
                <span>Đang tính giá chính xác theo từng ngày...</span>
              ) : (
                <span>Thứ 2–6 giá thường · Thứ 7/CN +10% · Ngày đặc biệt ưu tiên mức phụ thu đã cấu hình.</span>
              )}
            </div>

            <div className="checkout-total-lines">
              <div>
                <span>Giá phòng cơ bản</span>
                <strong>{money(totals.baseAmount)}</strong>
              </div>
              {totals.weekendSurchargeAmount > 0 ? (
                <div className="surcharge">
                  <span>Phụ thu cuối tuần (+10%)</span>
                  <strong>+{money(totals.weekendSurchargeAmount)}</strong>
                </div>
              ) : null}
              {totals.specialDateSurchargeAmount > 0 ? (
                <div className="surcharge special">
                  <span>Phụ thu ngày đặc biệt</span>
                  <strong>+{money(totals.specialDateSurchargeAmount)}</strong>
                </div>
              ) : null}
              <div className="checkout-grand-total">
                <span>Tổng giá booking</span>
                <strong>{money(totals.total)}</strong>
              </div>
              <div className="highlight">
                <span>Thanh toán ngay</span>
                <strong>{money(totals.payNow)}</strong>
              </div>
              <div>
                <span>Còn lại</span>
                <strong>{money(totals.remaining)}</strong>
              </div>
            </div>

            <button type="submit" disabled={
                submitting
                || !effectivePaymentOption
                || roomConflict
                || holdLoading
                || !bookingHold?.holdToken
                || pricingLoading
                || !pricingQuote
              }>
              {pricingLoading
                ? "Đang tính giá theo ngày..."
                : submitting
                  ? "Đang tạo booking..."
                : effectivePaymentOption === "PAY_AT_HOTEL"
                  ? "Xác nhận đặt phòng"
                  : fundingMethod === "WALLET"
                    ? "Thanh toán bằng Ví Enziu"
                    : "Tiếp tục thanh toán PayOS"}
            </button>
            <p>
              <Check size={16} /> Nếu thu tiền mặt tại khách sạn, hoa hồng được hạch toán khi Hotel Admin xác nhận đã thu.
            </p>
          </aside>
        </form>
      </div>
    </main>
  );
}
