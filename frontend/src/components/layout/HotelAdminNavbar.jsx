import {
  AlertTriangle,
  BedDouble,
  Bell,
  Building2,
  CheckCircle2,
  Clock3,
  DoorOpen,
  Hotel,
  LayoutDashboard,
  PlusCircle,
  Power,
  RefreshCw,
  ScanLine,
  Send,
  Tags,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "../../auth/AuthContext";
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
    to: "/hotel-admin/check-in",
    label: "Nhận phòng QR",
    icon: ScanLine,
  },
  {
    to: "/hotel-admin/current-stays",
    label: "Khách đang lưu trú",
    icon: DoorOpen,
  },
  {
    to: "/hotel-admin/profile",
    label: "Hồ sơ cá nhân",
    icon: UserRound,
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
];

const desktopNavigation = [
  { type: "link", item: items[0] },
  {
    type: "group",
    label: "Khách sạn",
    icon: Building2,
    items: [items[1], items[2]],
  },
  { type: "link", item: items[3] },
  { type: "link", item: items[4] },
  {
    type: "group",
    label: "Vận hành",
    icon: ScanLine,
    items: [items[5], items[6]],
  },
  { type: "link", item: items[8] },
  { type: "link", item: items[9] },
];

const ELIGIBILITY_CHECKS = [
  {
    key: "currentStayCount",
    label: "Khách đang lưu trú",
    clearText: "Không còn khách đang lưu trú",
  },
  {
    key: "actionableBookingCount",
    label: "Booking sắp tới cần xử lý",
    clearText: "Không còn booking sắp tới cần xử lý",
  },
  {
    key: "pendingWithdrawalCount",
    label: "Withdrawal đang chờ",
    clearText: "Không còn withdrawal đang chờ",
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
  const value = Number(eligibility?.[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function blockerText(blocker) {
  if (typeof blocker === "string") return blocker;
  return blocker?.message ?? blocker?.label ?? blocker?.code ?? "Điều kiện chưa đáp ứng";
}

export default function HotelAdminNavbar() {
  const { refreshUserProfile } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [request, setRequest] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState("");
  const [modalError, setModalError] = useState("");
  const [success, setSuccess] = useState("");

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
        "Yêu cầu đã được gửi tới System Admin. Tài khoản vẫn là Hotel Admin cho đến khi được xác nhận.",
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
    ? "Đang chờ ngừng đối tác"
    : "Ngừng làm đối tác";
  const accountActionDescription = requestStatus === "PENDING"
    ? "Xem trạng thái yêu cầu đã gửi"
    : "Gửi yêu cầu chuyển về Customer";

  return (
    <>
      <AdminNavbar
        variant="hotel"
        roleLabel="Hotel Admin"
        roleDescription="Quản lý đối tác"
        homePath="/hotel-admin"
        brandIcon={Hotel}
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

      {modalOpen ? (
        <div
          className="admin-modal-layer admin-confirm-layer"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDeactivationModal();
          }}
        >
          <section
            className="admin-modal small hotel-deactivation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hotel-deactivation-title"
          >
            <div className="admin-modal-header">
              <div>
                <span>PARTNER ACCOUNT</span>
                <h2 id="hotel-deactivation-title">Ngừng làm đối tác</h2>
              </div>
              <button
                type="button"
                onClick={closeDeactivationModal}
                disabled={submitting}
                aria-label="Đóng"
              >
                <X size={19} />
              </button>
            </div>

            {modalError ? (
              <div className="hotel-deactivation-message error" role="alert">
                <AlertTriangle size={18} />
                <span>{modalError}</span>
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
                <span className="admin-spinner" /> Đang tải trạng thái yêu cầu...
              </div>
            ) : requestStatus === "PENDING" ? (
              <div className="hotel-deactivation-status pending">
                <Clock3 size={24} />
                <div>
                  <strong>Yêu cầu đang chờ System Admin xác nhận</strong>
                  <p>
                    Bạn vẫn có quyền Hotel Admin và cần tiếp tục xử lý các nghiệp vụ
                    hiện tại cho đến khi yêu cầu được duyệt.
                  </p>
                  {request?.reason ? <small>Lý do: {request.reason}</small> : null}
                </div>
              </div>
            ) : requestStatus === "APPROVED" ? (
              <div className="hotel-deactivation-status approved">
                <CheckCircle2 size={24} />
                <div>
                  <strong>Yêu cầu đã được phê duyệt</strong>
                  <p>Vai trò đã đổi về Customer. Vui lòng đăng nhập lại để tiếp tục.</p>
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
                          ? "Bạn đã trở lại vai trò Hotel Admin"
                          : "Yêu cầu trước chưa được chấp thuận"}
                      </strong>
                      <p>
                        {requestStatus === "HISTORICAL_APPROVED"
                          ? "Yêu cầu đã duyệt trước đây được giữ làm lịch sử. Bạn có thể gửi yêu cầu mới."
                          : request?.rejectionReason ?? "Bạn có thể kiểm tra điều kiện và gửi lại yêu cầu."}
                      </p>
                    </div>
                  </div>
                ) : null}

                <p className="hotel-deactivation-intro">
                  EnziuRooms chỉ tiếp nhận yêu cầu khi mọi khách lưu trú, booking sắp
                  tới, withdrawal và vấn đề tài chính đã được xử lý xong.
                </p>

                {eligibilityLoading ? (
                  <div className="hotel-deactivation-loading">
                    <span className="admin-spinner" /> Đang kiểm tra điều kiện...
                  </div>
                ) : eligibility ? (
                  <div className="role-eligibility-list">
                    {ELIGIBILITY_CHECKS.map((check) => {
                      const count = eligibilityCount(eligibility, check.key);
                      const clear = count === 0;
                      return (
                        <div className={clear ? "clear" : "blocked"} key={check.key}>
                          {clear ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                          <span>
                            <strong>{clear ? check.clearText : check.label}</strong>
                            <small>{clear ? "Đã đáp ứng" : `${count} mục cần xử lý`}</small>
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
                    value={reason}
                    onChange={(event) => {
                      setReason(event.target.value);
                      setModalError("");
                    }}
                    placeholder="Chia sẻ lý do để System Admin xem xét..."
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
          </section>
        </div>
      ) : null}
    </>
  );
}
