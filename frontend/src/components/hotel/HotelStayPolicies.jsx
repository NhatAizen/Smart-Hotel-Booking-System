import {
  Baby, Ban, BedDouble, CheckCircle2, ChevronDown, Clock3, CreditCard,
  FileKey2, Info, PawPrint, QrCode, RotateCcw, ShieldCheck, Star, Users,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getHotelPolicy, getPlatformPolicy } from "../../services/policyService";
import { statusLabel } from "../../utils/presentation";
import "./HotelStayPolicies.css";

const MISSING_COPY = "Khách sạn chưa cung cấp thông tin.";

function formatTime(value) {
  return value ? String(value).slice(0, 5) : null;
}

function truthCopy(value, yesCopy, noCopy) {
  if (value === true) return { copy: yesCopy };
  if (value === false) return { copy: noCopy };
  return { copy: MISSING_COPY, missing: true };
}

function paymentPolicy(types) {
  if (!types.length) return { copy: MISSING_COPY, missing: true };
  const options = [];
  if (types.some((type) => type.payAtHotelAllowed === true)) options.push("thanh toán tại khách sạn");
  if (types.some((type) => type.fullPaymentAllowed === true)) options.push("thanh toán toàn bộ online");
  const rates = [...new Set(types
    .filter((type) => type.depositAllowed === true)
    .map((type) => Number(type.depositPercent))
    .filter((value) => Number.isFinite(value) && value > 0))]
    .sort((left, right) => left - right);
  if (rates.length) options.push(`đặt cọc ${rates.map((value) => `${value}%`).join(" hoặc ")}`);
  return options.length
    ? { copy: `Tùy loại phòng: ${options.join(", ")}.` }
    : { copy: MISSING_COPY, missing: true };
}

function refundPolicy(types) {
  if (!types.length) return { copy: MISSING_COPY, missing: true };
  const refundable = types.filter((type) => type.refundable === true).length;
  if (refundable === types.length) return { copy: "Các loại phòng đang mở bán có áp dụng hoàn tiền." };
  if (refundable === 0) return { copy: "Các loại phòng đang mở bán hiện không áp dụng hoàn tiền." };
  return { copy: `${refundable}/${types.length} loại phòng đang mở bán có áp dụng hoàn tiền.` };
}

function capacityPolicy(types) {
  const values = types
    .map((type) => Number(type.maxAdults ?? 0) + Number(type.maxChildren ?? 0))
    .filter((value) => value > 0);
  return values.length
    ? { copy: `Tối đa ${Math.max(...values)} khách/phòng, tùy đúng loại phòng đã chọn.` }
    : { copy: MISSING_COPY, missing: true };
}

function PolicyRow({ icon: Icon, title, copy, missing = false, source }) {
  return (
    <div className={`hotel-policy-row${missing ? " is-missing" : ""}`}>
      <span className="hotel-policy-row-icon" aria-hidden="true"><Icon size={19} /></span>
      <div>
        <span className="hotel-policy-row-heading">
          <strong>{title}</strong>
          <small>{source ?? (missing ? "Chưa cung cấp" : "Thông tin hiện có")}</small>
        </span>
        <p>{copy}</p>
      </div>
    </div>
  );
}

function PolicyGroup({ eyebrow, title, icon: Icon, children, wide = false }) {
  return (
    <details className={`hotel-policy-group${wide ? " is-wide" : ""}`} open>
      <summary>
        <span><Icon size={20} /></span>
        <div><small>{eyebrow}</small><strong>{title}</strong></div>
        <ChevronDown className="hotel-policy-chevron" size={19} />
      </summary>
      <div className="hotel-policy-group-body">{children}</div>
    </details>
  );
}

export default function HotelStayPolicies({ hotel, roomTypes }) {
  const [hotelPolicy, setHotelPolicy] = useState(null);
  const [platformPolicy, setPlatformPolicy] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hotel?.id) return undefined;
    let active = true;
    setLoading(true);
    Promise.allSettled([getHotelPolicy(hotel.id), getPlatformPolicy()])
      .then(([hotelResult, platformResult]) => {
        if (!active) return;
        setHotelPolicy(hotelResult.status === "fulfilled" ? hotelResult.value : null);
        setPlatformPolicy(platformResult.status === "fulfilled" ? platformResult.value : null);
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [hotel?.id]);

  const types = useMemo(
    () => (Array.isArray(roomTypes) ? roomTypes.filter(Boolean) : []),
    [roomTypes],
  );
  const payment = paymentPolicy(types);
  const refund = refundPolicy(types);
  const capacity = capacityPolicy(types);
  const checkIn = formatTime(hotelPolicy?.checkInTime ?? hotel?.checkInTime);
  const checkOut = formatTime(hotelPolicy?.checkOutTime ?? hotel?.checkOutTime);
  const crib = truthCopy(hotelPolicy?.cribAvailable, "Khách sạn có nôi theo cấu hình hiện tại.", "Khách sạn không cung cấp nôi.");
  const extraBed = truthCopy(hotelPolicy?.extraBedAvailable, "Khách sạn có giường phụ theo cấu hình hiện tại.", "Khách sạn không cung cấp giường phụ.");
  const pets = truthCopy(hotelPolicy?.petsAllowed, "Khách sạn cho phép vật nuôi.", "Khách sạn không cho phép vật nuôi.");
  const smoking = truthCopy(hotelPolicy?.smokingAllowed, "Khách sạn cho phép hút thuốc theo khu vực/quy định đã cung cấp.", "Khách sạn không cho phép hút thuốc.");
  const parties = truthCopy(hotelPolicy?.partiesAllowed, "Khách sạn cho phép tiệc hoặc sự kiện.", "Khách sạn không cho phép tiệc hoặc sự kiện.");
  const identity = truthCopy(hotelPolicy?.identityDocumentRequired, "Cần xuất trình giấy tờ khi nhận phòng.", "Khách sạn không đánh dấu yêu cầu giấy tờ riêng.");
  const lateCheckout = truthCopy(hotelPolicy?.lateCheckoutAllowed, "Khách sạn cho phép trả phòng trễ khi đáp ứng điều kiện đã cung cấp.", "Khách sạn không cho phép trả phòng trễ.");
  const quietHours = hotelPolicy?.quietHoursFrom && hotelPolicy?.quietHoursTo
    ? { copy: `${formatTime(hotelPolicy.quietHoursFrom)} – ${formatTime(hotelPolicy.quietHoursTo)}.` }
    : { copy: MISSING_COPY, missing: true };
  const minimumAge = platformPolicy?.minimumCheckInAge;

  return (
    <div className="hotel-stay-policies">
      <header className="hotel-policy-intro">
        <div>
          <span className="hotel-policy-kicker"><ShieldCheck size={15} /> CHÍNH SÁCH & QUY ĐỊNH LƯU TRÚ</span>
          <h2>Biết rõ trước khi xác nhận.</h2>
          <p>Quy định của chỗ nghỉ và chính sách nền tảng được tách riêng để bạn biết ai cung cấp từng điều kiện.</p>
        </div>
        <span className="hotel-policy-trust-note"><CheckCircle2 size={17} /> Thông tin cập nhật cho chỗ nghỉ này</span>
      </header>

      {loading ? <div className="hotel-policy-loading">Đang tải chính sách...</div> : null}

      <section className="hotel-policy-layer is-hotel">
        <div className="hotel-policy-layer-title">
          <span><Users size={20} /></span>
          <div><small>QUY ĐỊNH CHỖ NGHỈ</small><h3>Quy định của khách sạn</h3><p>Do khách sạn cung cấp và áp dụng riêng cho chỗ nghỉ này.</p></div>
        </div>
        <div className="hotel-policy-grid">
          <PolicyGroup eyebrow="Thời gian" title="Nhận & trả phòng" icon={Clock3}>
            <PolicyRow icon={Clock3} title="Giờ nhận phòng" copy={checkIn ?? MISSING_COPY} missing={!checkIn} source={checkIn ? "Hồ sơ khách sạn" : undefined} />
            <PolicyRow icon={Clock3} title="Giờ trả phòng" copy={checkOut ?? MISSING_COPY} missing={!checkOut} source={checkOut ? "Hồ sơ khách sạn" : undefined} />
            <PolicyRow icon={RotateCcw} title="Trả phòng trễ" copy={hotelPolicy?.lateCheckoutDetails || lateCheckout.copy} missing={lateCheckout.missing} />
          </PolicyGroup>
          <PolicyGroup eyebrow="Gia đình" title="Trẻ em & giường" icon={Baby}>
            <PolicyRow icon={Baby} title="Chính sách trẻ em" copy={hotelPolicy?.childrenPolicy || MISSING_COPY} missing={!hotelPolicy?.childrenPolicy} />
            <PolicyRow icon={Baby} title="Nôi" {...crib} />
            <PolicyRow icon={BedDouble} title="Giường phụ" {...extraBed} />
            <PolicyRow icon={Users} title="Số khách tối đa" {...capacity} source={capacity.missing ? undefined : "Theo loại phòng"} />
          </PolicyGroup>
          <PolicyGroup eyebrow="Chỗ nghỉ" title="Hành vi & không gian" icon={ShieldCheck}>
            <PolicyRow icon={PawPrint} title="Vật nuôi" {...pets} />
            <PolicyRow icon={Ban} title="Hút thuốc" {...smoking} />
            <PolicyRow icon={Info} title="Tiệc / sự kiện" {...parties} />
            <PolicyRow icon={Clock3} title="Giờ yên tĩnh" {...quietHours} />
          </PolicyGroup>
          <PolicyGroup eyebrow="Tại quầy" title="Giấy tờ & hướng dẫn" icon={FileKey2}>
            <PolicyRow icon={FileKey2} title="Giấy tờ khi nhận phòng" {...identity} />
            <PolicyRow icon={Info} title="Hướng dẫn check-in" copy={hotelPolicy?.checkInInstructions || MISSING_COPY} missing={!hotelPolicy?.checkInInstructions} />
          </PolicyGroup>
          {hotelPolicy?.additionalRules?.length ? (
            <PolicyGroup eyebrow="Bổ sung" title="Quy định khác" icon={Info} wide>
              {hotelPolicy.additionalRules.map((rule) => (
                <PolicyRow key={rule.id ?? rule.title} icon={Info} title={rule.title} copy={rule.content} />
              ))}
            </PolicyGroup>
          ) : null}
        </div>
      </section>

      <section className="hotel-policy-layer is-platform">
        <div className="hotel-policy-layer-title">
          <span><ShieldCheck size={20} /></span>
          <div><small>CHÍNH SÁCH NỀN TẢNG</small><h3>Chính sách của EnziuRooms</h3><p>Áp dụng cho quá trình đặt phòng, thanh toán và nhận phòng.</p></div>
        </div>
        <div className="hotel-policy-grid">
          <PolicyGroup eyebrow="Giao dịch" title="Thanh toán, hủy & hoàn" icon={WalletCards} wide>
            <PolicyRow icon={CreditCard} title="Thanh toán / đặt cọc" {...payment} source={payment.missing ? undefined : "Theo loại phòng"} />
            <PolicyRow icon={Ban} title="Hủy đặt phòng" copy="Khả năng hủy phụ thuộc trạng thái và điều kiện của đơn tại thời điểm bạn gửi yêu cầu." source="Điều kiện đặt phòng" />
            <PolicyRow icon={RotateCcw} title="Điều kiện hoàn tiền của loại phòng" {...refund} source={refund.missing ? undefined : "Theo loại phòng"} />
            <PolicyRow
              icon={RotateCcw}
              title="Gửi yêu cầu hoàn"
              copy={Array.isArray(platformPolicy?.refundRequestEligibleBookingStatuses) && platformPolicy.refundRequestEligibleBookingStatuses.length
                ? `Có thể gửi khi đơn ở trạng thái ${platformPolicy.refundRequestEligibleBookingStatuses.map((item) => statusLabel(item)).join(" / ")}; yêu cầu vẫn cần khách sạn xem xét.`
                : "Khả năng gửi yêu cầu phụ thuộc trạng thái của đơn đặt phòng."}
              source="Chính sách hoàn tiền"
            />
          </PolicyGroup>
          <PolicyGroup eyebrow="Xác minh" title="Độ tuổi & QR check-in" icon={QrCode}>
            <PolicyRow icon={Users} title="Độ tuổi tối thiểu" copy={minimumAge == null ? "EnziuRooms chưa công bố thông tin về độ tuổi tối thiểu." : `Người đứng tên đặt phòng và đại diện nhận phòng phải từ đủ ${minimumAge} tuổi.`} missing={minimumAge == null} source={minimumAge == null ? undefined : "Chính sách EnziuRooms"} />
            <PolicyRow icon={QrCode} title="QR check-in" copy="Mã QR giúp khách sạn tra cứu đúng đơn đặt phòng; việc xác minh giấy tờ được thực hiện tại quầy." source="Quy trình nhận phòng" />
          </PolicyGroup>
          <PolicyGroup eyebrow="Sau lưu trú" title="Đánh giá" icon={Star}>
            <PolicyRow icon={Star} title="Điều kiện đánh giá" copy={platformPolicy?.reviewEligibleBookingStatus === "CHECKED_OUT" ? "Khách có thể đánh giá sau khi đã trả phòng." : "Quyền đánh giá phụ thuộc trạng thái hoàn tất của kỳ lưu trú."} source="Quy định đánh giá" />
          </PolicyGroup>
        </div>
      </section>
    </div>
  );
}
