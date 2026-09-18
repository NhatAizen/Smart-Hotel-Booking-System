import {
  AlertTriangle,
  BedDouble,
  Bell,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  DoorOpen,
  Hotel,
  Gift,
  LayoutDashboard,
  MessagesSquare,
  PlusCircle,
  Power,
  RefreshCw,
  ScanLine,
  Send,
  Star,
  Tags,
  UserRound,
  WalletCards,
  ScrollText,
  LifeBuoy,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import enziuLogo from "../../assets/enziu-logo.png";
import { useAuth } from "../../auth/AuthContext";
import { Modal } from "../ui";
import { getMyHotels } from "../../services/hotelAdminService";
import {
  getMyPartnerDeactivationEligibility,
  getMyPartnerDeactivationRequest,
  submitPartnerDeactivationRequest,
} from "../../services/profileService";
import AdminNavbar from "./AdminNavbar";

const items = [
  {
    to: "/hotel-admin",
    label: "Tổng quan",
    icon: LayoutDashboard,
    end: true,
  },
  {
    to: "/hotel-admin/hotels",
    label: "Khách sạn của tôi",
    icon: Building2,
    end: true,
  },
  {
    to: "/hotel-admin/hotels/create",
    label: "Đăng ký khách sạn",
    icon: PlusCircle,
  },
  {
    to: "/hotel-admin/room-types",
    label: "Loại phòng",
    icon: Tags,
  },
  {
    to: "/hotel-admin/rooms",
    label: "Quản lý phòng",
    icon: BedDouble,
  },
  {
    to: "/hotel-admin/bookings",
    label: "Đơn đặt phòng",
    icon: ClipboardList,
  },
  {
    to: "/hotel-admin/stays",
    label: "Quản lý check-in và check-out",
    icon: DoorOpen,
  },
  {
    to: "/hotel-admin/profile",
    label: "Hồ sơ cá nhân",
    icon: UserRound,
  },
  {
    to: "/hotel-admin/promotions",
    label: "Khuyến mãi",
    icon: Gift,
  },
  {
    to: "/hotel-admin/wallet",
    label: "Ví & rút tiền",
    icon: WalletCards,
  },
  {
    to: "/hotel-admin/notifications",
    label: "Thông báo",
    icon: Bell,
  },
  {
    to: "/hotel-admin/messages",
    label: "Tin nhắn",
    icon: MessagesSquare,
  },
  {
    to: "/hotel-admin/reviews",
    label: "Đánh giá",
    icon: Star,
  },
  {
    to: "/hotel-admin/policies",
    label: "Chính sách & Quy định",
    icon: ScrollText,
  },
  {
    to: "/hotel-admin/complaints",
    label: "Khiếu nại",
    icon: LifeBuoy,
  },
];

const desktopNavigation = [
  { type: "link", item: items[0] },
  {
    type: "group",
    label: "Khách sạn",
    icon: Building2,
    items: [items[1], items[2], items[3], items[4], items[13]],
  },
  {
    type: "group",
    label: "Vận hành",
    icon: ScanLine,
    items: [items[5], items[6], items[11], items[12], items[14]],
  },
  {
    type: "group",
    label: "Kinh doanh",
    icon: WalletCards,
    items: [items[8], items[9]],
  },
  { type: "link", item: items[10] },
];

const ELIGIBILITY_CHECKS = [
  {
    key: "currentStayCount",
    label: "Khách đang lưu trú",
    clearText: "Không còn khách đang lưu trú",
  },
  {
    key: "actionableBookingCount",
    label: "Đơn đặt phòng sắp tới cần xử lý",
    clearText: "Không còn đơn đặt phòng sắp tới cần xử lý",
  },
  {
    key: "pendingWithdrawalCount",
    label: "Yêu cầu rút tiền đang chờ",
    clearText: "Không còn yêu cầu rút tiền đang chờ",
  },
  {
    key: "financialIssueCount",
    label: "Vấn đề tài chính",
    clearText: "Không còn vấn đề tài chính cần xử lý",
  },
];

function normalizeStatus(value) {
  return String(value ?? "").trim().toUpperCase();
}

function eligibilityCount(eligibility, key) {
  const rawValue = eligibility?.[key];
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function friendlyOperationalText(value) {
  return String(value ?? "")
    .replace(/\bwithdrawals?\b/gi, "yêu cầu rút tiền")
    .replace(/\bbookings?\b/gi, "đơn đặt phòng");
}

function blockerText(blocker) {
  const message = typeof blocker === "string"
    ? blocker
    : blocker?.message ?? blocker?.label;
  return message
    ? friendlyOperationalText(message)
    : "Điều kiện chưa đáp ứng";
}

function resolveHotelImage(hotel) {
  if (!hotel) return "";
  if (hotel.coverImageUrl) return hotel.coverImageUrl;

  const images = Array.isArray(hotel.images) ? hotel.images : [];
  const first = images.find((image) => image?.cover || image?.isCover) ?? images[0];

  if (!first) return "";
  if (typeof first === "string") return first;
  return first.imageUrl ?? first.url ?? first.fileUrl ?? first.publicUrl ?? "";
}

export default function HotelAdminNavbar() {
  const { refreshUserProfile } = useAuth();
  const [managedHotels, setManagedHotels] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [request, setRequest] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState("");
  const [modalError, setModalError] = useState("");
  const [success, setSuccess] = useState("");


  const loadManagedHotels = useCallback(async () => {
    try {
      const payload = await getMyHotels();
      setManagedHotels(Array.isArray(payload) ? payload : []);
    } catch {
      setManagedHotels([]);
    }
  }, []);

  useEffect(() => {
    void loadManagedHotels();

    function handleHotelImagesChanged() {
      void loadManagedHotels();
    }

    window.addEventListener("enziu:hotel-images-changed", handleHotelImagesChanged);
    window.addEventListener("focus", handleHotelImagesChanged);

    return () => {
      window.removeEventListener("enziu:hotel-images-changed", handleHotelImagesChanged);
      window.removeEventListener("focus", handleHotelImagesChanged);
    };
  }, [loadManagedHotels]);

  const brandedHotel = useMemo(() => (
    managedHotels.find((hotel) => hotel.approvalStatus === "APPROVED" && hotel.status === "ACTIVE")
    ?? managedHotels.find((hotel) => hotel.approvalStatus === "APPROVED")
    ?? managedHotels[0]
    ?? null
  ), [managedHotels]);

  const hotelBrandImageUrl = useMemo(() => resolveHotelImage(brandedHotel), [brandedHotel]);

  const storedRequestStatus = normalizeStatus(request?.status);
  const requestStatus = storedRequestStatus === "APPROVED" &&
    normalizeStatus(request?.currentRole) !== "CUSTOMER"
    ? "HISTORICAL_APPROVED"
    : storedRequestStatus;

  const loadRequest = useCallback(async (silent = false) => {
    if (!silent) setStatusLoading(true);
    try {
      const payload = await getMyPartnerDeactivationRequest();
      const nextRequest = payload && typeof payload === "object" ? payload : null;
      setRequest(nextRequest);

      if (
        normalizeStatus(nextRequest?.status) === "APPROVED" &&
        normalizeStatus(nextRequest?.currentRole) === "CUSTOMER"
      ) {
        await refreshUserProfile();
      }

      return nextRequest;
    } catch (requestError) {
      if (requestError.response?.status === 404) {
        setRequest(null);
        return null;
      }
      if (!silent) {
        setModalError(
          requestError.response?.data?.message ??
            "Không thể tải trạng thái yêu cầu ngừng đối tác.",
        );
      }
      return null;
    } finally {
      if (!silent) setStatusLoading(false);
    }
  }, [refreshUserProfile]);

  const loadEligibility = useCallback(async () => {
    setEligibilityLoading(true);
    setModalError("");
    try {
      const payload = await getMyPartnerDeactivationEligibility();
      setEligibility(payload);
      return payload;
    } catch (requestError) {
      setEligibility(null);
      setModalError(
        requestError.response?.data?.message ??
          "Không thể kiểm tra điều kiện ngừng làm đối tác.",
      );
      return null;
    } finally {
      setEligibilityLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequest();
  }, [loadRequest]);

  useEffect(() => {
    if (requestStatus !== "PENDING") return undefined;

    const timer = window.setInterval(() => {
      void loadRequest(true);
    }, 15000);

    return () => window.clearInterval(timer);
  }, [loadRequest, requestStatus]);

  async function openDeactivationModal() {
    setModalOpen(true);
    setModalError("");
    setSuccess("");

    const currentRequest = await loadRequest();
    const currentStatus = normalizeStatus(currentRequest?.status);
    const currentRole = normalizeStatus(currentRequest?.currentRole);
    const terminalRequest = currentStatus === "PENDING" ||
      (currentStatus === "APPROVED" && currentRole === "CUSTOMER");
    if (!terminalRequest) {
      await loadEligibility();
    }
  }

  function closeDeactivationModal() {
    if (submitting) return;
    setModalOpen(false);
    setModalError("");
    setSuccess("");
  }

  async function submitDeactivation() {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      setModalError("Vui lòng nhập lý do ngừng làm đối tác.");
      return;
    }
    if (!eligibility?.eligible) {
      setModalError("Tài khoản chưa đáp ứng đủ điều kiện để gửi yêu cầu.");
      return;
    }

    setSubmitting(true);
    setModalError("");
    setSuccess("");
    try {
      const payload = await submitPartnerDeactivationRequest(normalizedReason);
      setRequest({ ...payload, status: payload?.status ?? "PENDING" });
      setSuccess(
        "Yêu cầu đã được gửi. Bạn vẫn có thể quản lý khách sạn cho đến khi có kết quả.",
      );
      setReason("");
    } catch (requestError) {
      const message = requestError.response?.data?.message ??
        "Không thể gửi yêu cầu ngừng làm đối tác.";
      if (requestError.response?.status === 409) {
        await loadEligibility();
      }
      setModalError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const accountActionLabel = requestStatus === "PENDING"
    ? "Yêu cầu ngừng hợp tác đang chờ"
    : "Ngừng làm đối tác";
  const accountActionDescription = requestStatus === "PENDING"
    ? "Xem trạng thái yêu cầu đã gửi"
    : "Gửi yêu cầu ngừng làm đối tác";

  return (
    <>
      <AdminNavbar
        variant="hotel"
        roleLabel="Đối tác"
        roleDescription={brandedHotel?.name ? `Quản lý ${brandedHotel.name}` : "Quản lý khách sạn"}
        homePath="/hotel-admin"
        brandIcon={Hotel}
        brandImageUrl={hotelBrandImageUrl || enziuLogo}
        brandImageAlt={brandedHotel?.name ? `Ảnh ${brandedHotel.name}` : "Logo EnziuRooms"}
        brandImageFit={hotelBrandImageUrl ? "cover" : "contain"}
        accountAvatarUrl={hotelBrandImageUrl}
        items={items}
        desktopNavigation={desktopNavigation}
        profilePath="/hotel-admin/profile"
        accountActions={[
          {
            key: "partner-deactivation",
            label: accountActionLabel,
            description: accountActionDescription,
            icon: requestStatus === "PENDING" ? Clock3 : Power,
            tone: "danger",
            disabled: statusLoading,
            onClick: openDeactivationModal,
          },
        ]}
      />

      <Modal
        open={modalOpen}
        onClose={closeDeactivationModal}
        title="Ngừng làm đối tác"
        description="Kiểm tra các công việc cần hoàn tất trước khi gửi yêu cầu."
        size="lg"
        className="hotel-deactivation-modal"
        closeLabel="Đóng yêu cầu ngừng làm đối tác"
        closeOnBackdrop={!submitting}
        closeOnEscape={!submitting}
        hideCloseButton={submitting}
      >

            {modalError ? (
              <div className="hotel-deactivation-message error" role="alert">
                <AlertTriangle size={18} />
                <span>{friendlyOperationalText(modalError)}</span>
              </div>
            ) : null}

            {success ? (
              <div className="hotel-deactivation-message success" role="status">
                <CheckCircle2 size={18} />
                <span>{success}</span>
              </div>
            ) : null}

            {statusLoading ? (
              <div className="hotel-deactivation-loading">
                <span className="admin-spinner" aria-hidden="true" /> Đang tải trạng thái yêu cầu...
              </div>
            ) : requestStatus === "PENDING" ? (
              <div className="hotel-deactivation-status pending">
                <Clock3 size={24} />
                <div>
                  <strong>Yêu cầu đang chờ xác nhận</strong>
                  <p>
                    Bạn vẫn có thể quản lý khách sạn cho đến khi yêu cầu được xử lý.
                  </p>
                  {request?.reason ? <small>Lý do: {request.reason}</small> : null}
                </div>
              </div>
            ) : requestStatus === "APPROVED" ? (
              <div className="hotel-deactivation-status approved">
                <CheckCircle2 size={24} />
                <div>
                  <strong>Yêu cầu đã được phê duyệt</strong>
                  <p>Tài khoản đã chuyển về chế độ khách hàng. Vui lòng đăng nhập lại để tiếp tục.</p>
                </div>
              </div>
            ) : (
              <>
                {["REJECTED", "HISTORICAL_APPROVED"].includes(requestStatus) ? (
                  <div className="hotel-deactivation-status rejected">
                    <AlertTriangle size={22} />
                    <div>
                      <strong>
                        {requestStatus === "HISTORICAL_APPROVED"
                          ? "Tài khoản đối tác đã được kích hoạt lại"
                          : "Yêu cầu trước chưa được chấp thuận"}
                      </strong>
                      <p>
                        {requestStatus === "HISTORICAL_APPROVED"
                          ? "Yêu cầu đã duyệt trước đây được giữ làm lịch sử. Bạn có thể gửi yêu cầu mới."
                          : friendlyOperationalText(request?.rejectionReason) || "Bạn có thể kiểm tra điều kiện và gửi lại yêu cầu."}
                      </p>
                    </div>
                  </div>
                ) : null}

                <p className="hotel-deactivation-intro">
                  Bạn có thể ngừng làm đối tác sau khi các đơn đặt phòng, khách lưu trú và khoản tài chính còn lại đã được xử lý.
                </p>

                {eligibilityLoading ? (
                  <div className="hotel-deactivation-loading">
                    <span className="admin-spinner" aria-hidden="true" /> Đang kiểm tra điều kiện...
                  </div>
                ) : eligibility ? (
                  <div className="role-eligibility-list">
                    {ELIGIBILITY_CHECKS.map((check) => {
                      const count = eligibilityCount(eligibility, check.key);
                      const clear = count === 0;
                      const known = count !== null;
                      return (
                        <div className={known && clear ? "clear" : "blocked"} key={check.key}>
                          {clear ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                          <span>
                            <strong>
                              {!known ? `${check.label}: chưa có dữ liệu` : clear ? check.clearText : check.label}
                            </strong>
                            <small>
                              {!known ? "Chưa xác định" : clear ? "Đã đáp ứng" : `${count} mục cần xử lý`}
                            </small>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {!eligibility?.eligible && Array.isArray(eligibility?.blockers) && eligibility.blockers.length > 0 ? (
                  <ul className="role-eligibility-blockers">
                    {eligibility.blockers.map((blocker, index) => (
                      <li key={`${blockerText(blocker)}-${index}`}>{blockerText(blocker)}</li>
                    ))}
                  </ul>
                ) : null}

                <label className="admin-form-field">
                  <span>Lý do ngừng làm đối tác *</span>
                  <textarea
                    rows={4}
                    maxLength={500}
                    required
                    value={reason}
                    onChange={(event) => {
                      setReason(event.target.value);
                      setModalError("");
                    }}
                    placeholder="Nhập lý do ngừng làm đối tác..."
                  />
                </label>

                <div className="admin-modal-actions">
                  <button
                    type="button"
                    className="admin-secondary-button"
                    disabled={eligibilityLoading || submitting}
                    onClick={() => void loadEligibility()}
                  >
                    <RefreshCw size={17} /> Kiểm tra lại
                  </button>
                  <button
                    type="button"
                    className="hotel-deactivation-submit"
                    disabled={
                      submitting ||
                      eligibilityLoading ||
                      !eligibility?.eligible ||
                      !reason.trim()
                    }
                    onClick={() => void submitDeactivation()}
                  >
                    <Send size={17} />
                    {submitting ? "Đang gửi..." : "Gửi yêu cầu"}
                  </button>
                </div>
              </>
            )}

            {["PENDING", "APPROVED"].includes(requestStatus) ? (
              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="admin-cancel-button"
                  onClick={closeDeactivationModal}
                >
                  Đóng
                </button>
              </div>
            ) : null}
      </Modal>
    </>
  );
}
