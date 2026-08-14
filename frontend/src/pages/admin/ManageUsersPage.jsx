import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Hotel,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCog,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import {
  getAdminUser,
  getAdminUsers,
  deleteAdminUser,
  demoteAdminUserToCustomer,
  getAdminUserDemotionEligibility,
  lockAdminUser,
  promoteAdminUserToHotelAdmin,
  unlockAdminUser,
} from "../../services/adminService";

const DEMOTION_CHECKS = [
  ["currentStayCount", "Khách đang lưu trú"],
  ["actionableBookingCount", "Booking sắp tới cần xử lý"],
  ["pendingWithdrawalCount", "Withdrawal đang chờ"],
  ["financialIssueCount", "Vấn đề tài chính cần xử lý"],
];

const WINDOWS_1252_BYTE_BY_CHAR = (() => {
  try {
    const decoder = new TextDecoder("windows-1252");
    const map = new Map();
    for (let byte = 0; byte <= 255; byte += 1) {
      map.set(decoder.decode(Uint8Array.of(byte)), byte);
    }
    return map;
  } catch {
    return new Map();
  }
})();

function repairMojibake(value) {
  if (typeof value !== "string" || !value) return value;

  if (!/[ÃÂâð]|á[º»¼½¾¿]|Æ|á»|áº/.test(value)) {
    return value;
  }

  try {
    const bytes = [];
    for (const char of value) {
      const byte = WINDOWS_1252_BYTE_BY_CHAR.get(char);
      if (byte == null) return value;
      bytes.push(byte);
    }

    const repaired = new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(bytes),
    );

    return repaired || value;
  } catch {
    return value;
  }
}

function apiMessage(err, fallback) {
  return repairMojibake(err?.response?.data?.message) || fallback;
}

function arrayFrom(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.users)) return payload.users;
  return [];
}

function normalizeStatus(value, user) {
  const raw = String(value ?? "").toUpperCase();
  if (raw) return raw;
  if (user?.deleted === true || user?.deletedAt) return "DELETED";
  if (user?.locked === true || user?.enabled === false || user?.active === false) {
    return "LOCKED";
  }
  return "ACTIVE";
}

function normalizeUser(user = {}) {
  return {
    ...user,
    id: user.id ?? user.userId ?? user.accountId,
    fullName: user.fullName ?? user.name ?? user.displayName ?? "Chưa cập nhật",
    email: user.email ?? "—",
    role: String(user.role ?? user.authority ?? "CUSTOMER").replace(/^ROLE_/, ""),
    status: normalizeStatus(user.status ?? user.accountStatus, user),
    createdAt: user.createdAt ?? user.createdDate ?? user.registeredAt ?? null,
    phone: user.phone ?? user.phoneNumber ?? "—",
    emailVerified: user.emailVerified ?? user.verified ?? null,
    avatarUrl: user.avatarUrl ?? user.avatar ?? null,
    deleted: user.deleted ?? false,
    deletedAt: user.deletedAt ?? null,
  };
}

function roleLabel(role) {
  if (role === "SYSTEM_ADMIN") return "System Admin";
  if (role === "HOTEL_ADMIN") return "Hotel Admin";
  return "Customer";
}

function statusLabel(status) {
  if (status === "DELETED") return "Đã xóa";
  if (["LOCKED", "BLOCKED", "DISABLED", "INACTIVE"].includes(status)) return "Đã khóa";
  return "Hoạt động";
}

function isDeleted(status) {
  return status === "DELETED";
}

function isLocked(status) {
  return ["LOCKED", "BLOCKED", "DISABLED", "INACTIVE"].includes(status);
}

function statusClass(status) {
  if (isDeleted(status)) return "deleted";
  return isLocked(status) ? "locked" : "active";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function eligibilityCount(eligibility, key) {
  const value = Number(eligibility?.[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function blockerText(blocker) {
  if (typeof blocker === "string") return repairMojibake(blocker);
  return repairMojibake(
    blocker?.message ?? blocker?.label ?? blocker?.code,
  ) ?? "Điều kiện chưa đáp ứng";
}

export default function ManageUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [roleTarget, setRoleTarget] = useState(null);
  const [roleReason, setRoleReason] = useState("");
  const [roleEligibility, setRoleEligibility] = useState(null);
  const [roleEligibilityLoading, setRoleEligibilityLoading] = useState(false);
  const [roleActionError, setRoleActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await getAdminUsers({ includeDeleted: true });
      setUsers(arrayFrom(payload).map(normalizeUser));
    } catch (err) {
      setError(
        apiMessage(
          err,
          "Không thể tải danh sách tài khoản. Hãy kiểm tra identity-service và API Gateway.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return users.filter((item) => {
      // Soft-deleted accounts are retained only for audit/statistics and are never shown in this table.
      if (isDeleted(item.status)) return false;

      const matchesKeyword =
        !keyword ||
        item.fullName.toLowerCase().includes(keyword) ||
        item.email.toLowerCase().includes(keyword);
      const matchesRole = role === "ALL" || item.role === role;
      const matchesStatus =
        status === "ALL" ||
        (status === "ACTIVE" && item.status === "ACTIVE") ||
        (status === "LOCKED" && isLocked(item.status));
      return matchesKeyword && matchesRole && matchesStatus;
    });
  }, [users, query, role, status]);

  const stats = useMemo(() => {
    const visibleAccounts = users.filter((item) => !isDeleted(item.status));
    return {
      total: visibleAccounts.length,
      customers: visibleAccounts.filter((item) => item.role === "CUSTOMER").length,
      hotelAdmins: visibleAccounts.filter((item) => item.role === "HOTEL_ADMIN").length,
      locked: visibleAccounts.filter((item) => isLocked(item.status)).length,
      deleted: users.filter((item) => isDeleted(item.status)).length,
    };
  }, [users]);

  function isSelf(target) {
    const currentId = currentUser?.userId ?? currentUser?.id;
    return Boolean(
      (currentId && target?.id && String(currentId) === String(target.id)) ||
        (currentUser?.email && target?.email && currentUser.email === target.email),
    );
  }

  async function openDetail(target) {
    setSelected(target);
    if (!target?.id) return;
    setDetailLoading(true);
    try {
      const payload = await getAdminUser(target.id);
      setSelected(normalizeUser(payload));
    } catch {
      // Danh sách đã có đủ dữ liệu cơ bản; giữ modal hoạt động nếu endpoint detail chưa có.
    } finally {
      setDetailLoading(false);
    }
  }

  async function toggleLock() {
    const target = confirmTarget;
    if (!target?.id || isSelf(target)) return;

    setActionLoading(true);
    setError("");
    try {
      if (isLocked(target.status)) {
        await unlockAdminUser(target.id);
      } else {
        await lockAdminUser(target.id);
      }

      const nextStatus = isLocked(target.status) ? "ACTIVE" : "LOCKED";
      setUsers((items) =>
        items.map((item) =>
          String(item.id) === String(target.id)
            ? { ...item, status: nextStatus }
            : item,
        ),
      );
      setSelected((item) =>
        item && String(item.id) === String(target.id)
          ? { ...item, status: nextStatus }
          : item,
      );
      setNotice(
        nextStatus === "LOCKED"
          ? `Đã khóa tài khoản ${target.email}.`
          : `Đã mở khóa tài khoản ${target.email}.`,
      );
      setConfirmTarget(null);
      window.setTimeout(() => setNotice(""), 3500);
    } catch (err) {
      setError(
        apiMessage(
          err,
          "Không thể cập nhật trạng thái tài khoản. Vui lòng thử lại.",
        ),
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function deleteAccount() {
    const target = deleteTarget;
    if (!target?.id || isSelf(target) || isDeleted(target.status)) return;

    setActionLoading(true);
    setError("");
    try {
      const payload = await deleteAdminUser(target.id);
      const updated = normalizeUser(payload);
      setUsers((items) =>
        items.map((item) =>
          String(item.id) === String(target.id) ? { ...item, ...updated } : item,
        ),
      );
      setSelected((item) =>
        item && String(item.id) === String(target.id) ? null : item,
      );
      setNotice(`Đã xóa tài khoản ${target.email}. Tài khoản đã được ẩn khỏi danh sách; lịch sử booking và giao dịch vẫn được giữ.`);
      setDeleteTarget(null);
      window.setTimeout(() => setNotice(""), 4500);
    } catch (err) {
      setError(
        apiMessage(err, "Không thể xóa tài khoản. Vui lòng thử lại."),
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function loadRoleEligibility(target = roleTarget) {
    if (!target?.id || target.role !== "HOTEL_ADMIN") return null;

    setRoleEligibilityLoading(true);
    setRoleActionError("");
    try {
      const payload = await getAdminUserDemotionEligibility(target.id);
      setRoleEligibility(payload);
      return payload;
    } catch (err) {
      setRoleEligibility(null);
      setRoleActionError(
        apiMessage(
          err,
          "Không thể kiểm tra điều kiện chuyển tài khoản về Customer.",
        ),
      );
      return null;
    } finally {
      setRoleEligibilityLoading(false);
    }
  }

  function openRoleChange(target) {
    if (
      !target?.id ||
      isDeleted(target.status) ||
      !["CUSTOMER", "HOTEL_ADMIN"].includes(target.role)
    ) {
      return;
    }

    setRoleTarget(target);
    setRoleReason("");
    setRoleEligibility(null);
    setRoleActionError("");
    if (target.role === "HOTEL_ADMIN") {
      void loadRoleEligibility(target);
    }
  }

  function closeRoleChange() {
    if (actionLoading) return;
    setRoleTarget(null);
    setRoleReason("");
    setRoleEligibility(null);
    setRoleActionError("");
  }

  async function changeRole() {
    const target = roleTarget;
    const normalizedReason = roleReason.trim();
    if (!target?.id || !["CUSTOMER", "HOTEL_ADMIN"].includes(target.role)) return;
    if (!normalizedReason) {
      setRoleActionError("Vui lòng nhập lý do thay đổi vai trò để ghi audit log.");
      return;
    }
    if (target.role === "HOTEL_ADMIN" && !roleEligibility?.eligible) {
      setRoleActionError("Tài khoản chưa đáp ứng đủ điều kiện để chuyển về Customer.");
      return;
    }

    const nextRole = target.role === "CUSTOMER" ? "HOTEL_ADMIN" : "CUSTOMER";
    setActionLoading(true);
    setRoleActionError("");
    try {
      const payload = target.role === "CUSTOMER"
        ? await promoteAdminUserToHotelAdmin(target.id, normalizedReason)
        : await demoteAdminUserToCustomer(target.id, normalizedReason);
      const responseUser = payload?.user ?? payload ?? {};
      const updated = normalizeUser({
        ...target,
        ...responseUser,
        role: responseUser.role ?? nextRole,
      });

      setUsers((items) =>
        items.map((item) =>
          String(item.id) === String(target.id) ? { ...item, ...updated } : item,
        ),
      );
      setSelected((item) =>
        item && String(item.id) === String(target.id)
          ? { ...item, ...updated }
          : item,
      );
      setNotice(
        nextRole === "HOTEL_ADMIN"
          ? `Đã chuyển ${target.email} thành Hotel Admin.`
          : `Đã chuyển ${target.email} về Customer. Các khách sạn liên quan đã được ngừng hoạt động theo quy trình.`,
      );
      setRoleTarget(null);
      setRoleReason("");
      setRoleEligibility(null);
      setRoleActionError("");
      window.setTimeout(() => setNotice(""), 5000);
    } catch (err) {
      const message = apiMessage(
        err,
        "Không thể thay đổi vai trò tài khoản. Vui lòng thử lại.",
      );
      if (target.role === "HOTEL_ADMIN" && err?.response?.status === 409) {
        await loadRoleEligibility(target);
      }
      setRoleActionError(message);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="admin-page admin-users-page">
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">IDENTITY CONTROL</span>
          <h1>Quản lý tài khoản</h1>
          <p>Tra cứu, khóa/mở khóa và quản lý tài khoản người dùng trên EnziuRooms. Tài khoản đã xóa được ẩn khỏi danh sách.</p>
        </div>
        <button className="admin-secondary-button" type="button" onClick={loadUsers} disabled={loading}>
          <RefreshCw size={17} className={loading ? "admin-spin-icon" : ""} />
          Làm mới dữ liệu
        </button>
      </div>

      {notice ? (
        <div className="admin-users-notice success">
          <CheckCircle2 size={18} /> {notice}
        </div>
      ) : null}

      {error ? (
        <div className="admin-error">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button type="button" onClick={loadUsers}>Thử lại</button>
        </div>
      ) : null}

      <div className="admin-user-stat-grid">
        <div className="admin-user-stat-card">
          <span className="admin-user-stat-icon blue"><Users size={22} /></span>
          <div><small>Tổng tài khoản</small><strong>{stats.total}</strong><p>Tất cả người dùng hệ thống</p></div>
        </div>
        <div className="admin-user-stat-card">
          <span className="admin-user-stat-icon cyan"><UserCog size={22} /></span>
          <div><small>Customer</small><strong>{stats.customers}</strong><p>Tài khoản khách hàng</p></div>
        </div>
        <div className="admin-user-stat-card">
          <span className="admin-user-stat-icon violet"><ShieldCheck size={22} /></span>
          <div><small>Hotel Admin</small><strong>{stats.hotelAdmins}</strong><p>Tài khoản đối tác khách sạn</p></div>
        </div>
        <div className="admin-user-stat-card">
          <span className="admin-user-stat-icon red"><Lock size={22} /></span>
          <div><small>Đã khóa</small><strong>{stats.locked}</strong><p>Không được phép đăng nhập</p></div>
        </div>
        <div className="admin-user-stat-card">
          <span className="admin-user-stat-icon red"><Trash2 size={22} /></span>
          <div><small>Đã xóa</small><strong>{stats.deleted}</strong><p>Được giữ lại để đối soát</p></div>
        </div>
      </div>

      <section className="admin-users-panel">
        <div className="admin-users-toolbar">
          <label className="admin-users-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên hoặc email..."
            />
          </label>

          <select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Lọc vai trò">
            <option value="ALL">Tất cả vai trò</option>
            <option value="CUSTOMER">Customer</option>
            <option value="HOTEL_ADMIN">Hotel Admin</option>
            <option value="SYSTEM_ADMIN">System Admin</option>
          </select>

          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Lọc trạng thái">
            <option value="ALL">Tất cả trạng thái</option>
            <option value="ACTIVE">Hoạt động</option>
            <option value="LOCKED">Đã khóa</option>
          </select>
        </div>

        {loading ? (
          <div className="admin-loading"><span className="admin-spinner" /> Đang tải danh sách tài khoản...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="admin-empty-state compact">
            <Users size={35} />
            <strong>Không tìm thấy tài khoản</strong>
            <span>Thử thay đổi từ khóa hoặc bộ lọc.</span>
          </div>
        ) : (
          <div className="admin-users-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Người dùng</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th>Ngày tạo</th>
                  <th className="admin-users-actions-heading">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((item) => (
                  <tr key={item.id ?? item.email}>
                    <td>
                      <div className="admin-user-identity">
                        <span className="admin-user-list-avatar">
                          {item.avatarUrl ? <img src={item.avatarUrl} alt="" /> : item.fullName.charAt(0).toUpperCase()}
                        </span>
                        <div><strong>{item.fullName}</strong><span>{item.email}</span></div>
                      </div>
                    </td>
                    <td><span className={`admin-role-badge ${item.role.toLowerCase().replaceAll("_", "-")}`}>{roleLabel(item.role)}</span></td>
                    <td><span className={`admin-account-status ${statusClass(item.status)}`}><span />{statusLabel(item.status)}</span></td>
                    <td className="admin-users-date">{formatDate(item.createdAt)}</td>
                    <td>
                      <div className="admin-users-row-actions">
                        <button type="button" className="admin-users-icon-button" title="Xem chi tiết" onClick={() => openDetail(item)}><Eye size={17} /></button>
                        {!isDeleted(item.status) ? (
                          <>
                            {["CUSTOMER", "HOTEL_ADMIN"].includes(item.role) ? (
                              <button
                                type="button"
                                className={`admin-users-state-button role ${item.role === "CUSTOMER" ? "promote" : "demote"}`}
                                title={
                                  item.role === "CUSTOMER"
                                    ? "Chuyển trực tiếp thành Hotel Admin"
                                    : "Kiểm tra điều kiện và chuyển về Customer"
                                }
                                onClick={() => openRoleChange(item)}
                              >
                                {item.role === "CUSTOMER" ? <Hotel size={16} /> : <UserRound size={16} />}
                                {item.role === "CUSTOMER" ? "Chuyển thành Hotel Admin" : "Chuyển về Customer"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={`admin-users-state-button ${isLocked(item.status) ? "unlock" : "lock"}`}
                              disabled={isSelf(item)}
                              title={isSelf(item) ? "Bạn không thể khóa chính tài khoản đang đăng nhập" : undefined}
                              onClick={() => setConfirmTarget(item)}
                            >
                              {isLocked(item.status) ? <Unlock size={16} /> : <Lock size={16} />}
                              {isLocked(item.status) ? "Mở khóa" : "Khóa"}
                            </button>
                            <button
                              type="button"
                              className="admin-users-state-button delete"
                              disabled={isSelf(item)}
                              title={isSelf(item) ? "Bạn không thể xóa chính tài khoản đang đăng nhập" : "Xóa mềm tài khoản"}
                              onClick={() => setDeleteTarget(item)}
                            >
                              <Trash2 size={16} /> Xóa
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected ? (
        <div className="admin-modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
          <section className="admin-modal admin-user-detail-modal" role="dialog" aria-modal="true">
            <div className="admin-modal-header">
              <div><span>ACCOUNT DETAIL</span><h2>Chi tiết tài khoản</h2></div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Đóng"><X size={19} /></button>
            </div>

            <div className="admin-user-detail-hero">
              <span className="admin-user-detail-avatar">{selected.fullName.charAt(0).toUpperCase()}</span>
              <div><h3>{selected.fullName}</h3><p>{selected.email}</p></div>
              <span className={`admin-account-status ${statusClass(selected.status)}`}><span />{statusLabel(selected.status)}</span>
            </div>

            {detailLoading ? <div className="admin-user-detail-loading">Đang tải dữ liệu chi tiết...</div> : null}

            <div className="admin-detail-grid">
              <div><span>Mã tài khoản</span><strong>{selected.id ?? "—"}</strong></div>
              <div><span>Vai trò</span><strong>{roleLabel(selected.role)}</strong></div>
              <div><span>Số điện thoại</span><strong>{selected.phone}</strong></div>
              <div><span>Email xác minh</span><strong>{selected.emailVerified == null ? "—" : selected.emailVerified ? "Đã xác minh" : "Chưa xác minh"}</strong></div>
              <div><span>Ngày tạo</span><strong>{formatDate(selected.createdAt)}</strong></div>
              <div><span>Ngày xóa</span><strong>{formatDate(selected.deletedAt)}</strong></div>
            </div>

            <div className="admin-modal-actions">
              <button type="button" className="admin-cancel-button" onClick={() => setSelected(null)}>Đóng</button>
              {!isDeleted(selected.status) ? (
                <>
                  {["CUSTOMER", "HOTEL_ADMIN"].includes(selected.role) ? (
                    <button
                      type="button"
                      className={`admin-users-state-button role ${selected.role === "CUSTOMER" ? "promote" : "demote"}`}
                      onClick={() => openRoleChange(selected)}
                    >
                      {selected.role === "CUSTOMER" ? <Hotel size={16} /> : <UserRound size={16} />}
                      {selected.role === "CUSTOMER" ? "Chuyển thành Hotel Admin" : "Chuyển về Customer"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`admin-users-state-button ${isLocked(selected.status) ? "unlock" : "lock"}`}
                    disabled={isSelf(selected)}
                    onClick={() => setConfirmTarget(selected)}
                  >
                    {isLocked(selected.status) ? <Unlock size={16} /> : <Lock size={16} />}
                    {isLocked(selected.status) ? "Mở khóa tài khoản" : "Khóa tài khoản"}
                  </button>
                  <button
                    type="button"
                    className="admin-users-state-button delete"
                    disabled={isSelf(selected)}
                    onClick={() => setDeleteTarget(selected)}
                  >
                    <Trash2 size={16} /> Xóa tài khoản
                  </button>
                </>
              ) : (
                <span className="admin-deleted-hint">Tài khoản đã xóa mềm, dữ liệu lịch sử vẫn được giữ.</span>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {roleTarget ? (
        <div
          className="admin-modal-layer admin-confirm-layer"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRoleChange();
          }}
        >
          <section
            className="admin-modal small admin-role-change-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-role-change-title"
          >
            <div className="admin-modal-header">
              <div>
                <span>ROLE MANAGEMENT</span>
                <h2 id="admin-role-change-title">
                  {roleTarget.role === "CUSTOMER"
                    ? "Chuyển thành Hotel Admin"
                    : "Chuyển về Customer"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeRoleChange}
                disabled={actionLoading}
                aria-label="Đóng"
              >
                <X size={19} />
              </button>
            </div>

            <div className="admin-role-change-user">
              <span className="admin-user-detail-avatar">
                {roleTarget.fullName.charAt(0).toUpperCase()}
              </span>
              <div>
                <strong>{roleTarget.fullName}</strong>
                <small>{roleTarget.email}</small>
              </div>
              <span className={`admin-role-badge ${roleTarget.role.toLowerCase().replaceAll("_", "-")}`}>
                {roleLabel(roleTarget.role)}
              </span>
            </div>

            {roleActionError ? (
              <div className="admin-role-change-error" role="alert">
                <AlertTriangle size={18} />
                <span>{repairMojibake(roleActionError)}</span>
              </div>
            ) : null}

            {roleTarget.role === "CUSTOMER" ? (
              <div className="admin-role-change-note promote">
                <ShieldCheck size={20} />
                <p>
                  System Admin có thể cấp quyền Hotel Admin trực tiếp, không cần
                  partner request hoặc eKYC. Tài khoản và toàn bộ lịch sử được giữ nguyên.
                </p>
              </div>
            ) : (
              <>
                <p className="admin-role-change-description">
                  Chỉ có thể chuyển về Customer khi mọi nghiệp vụ lưu trú, booking,
                  withdrawal và tài chính đã được xử lý xong.
                </p>
                {roleEligibilityLoading ? (
                  <div className="admin-role-eligibility-loading">
                    <span className="admin-spinner" /> Đang kiểm tra điều kiện...
                  </div>
                ) : roleEligibility ? (
                  <div className="role-eligibility-list">
                    {DEMOTION_CHECKS.map(([key, label]) => {
                      const count = eligibilityCount(roleEligibility, key);
                      const clear = count === 0;
                      return (
                        <div className={clear ? "clear" : "blocked"} key={key}>
                          {clear ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                          <span>
                            <strong>{label}</strong>
                            <small>{clear ? "Đã xử lý xong" : `${count} mục còn tồn tại`}</small>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {!roleEligibility?.eligible && Array.isArray(roleEligibility?.blockers) && roleEligibility.blockers.length > 0 ? (
                  <ul className="role-eligibility-blockers">
                    {roleEligibility.blockers.map((blocker, index) => (
                      <li key={`${blockerText(blocker)}-${index}`}>{blockerText(blocker)}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}

            <label className="admin-form-field">
              <span>Lý do thay đổi vai trò *</span>
              <textarea
                rows={4}
                maxLength={500}
                value={roleReason}
                onChange={(event) => {
                  setRoleReason(event.target.value);
                  setRoleActionError("");
                }}
                placeholder="Nhập lý do để lưu trong audit log..."
              />
            </label>

            <div className="admin-modal-actions">
              {roleTarget.role === "HOTEL_ADMIN" ? (
                <button
                  type="button"
                  className="admin-secondary-button"
                  disabled={roleEligibilityLoading || actionLoading}
                  onClick={() => void loadRoleEligibility()}
                >
                  <RefreshCw size={16} /> Kiểm tra lại
                </button>
              ) : null}
              <button
                type="button"
                className="admin-cancel-button"
                disabled={actionLoading}
                onClick={closeRoleChange}
              >
                Hủy
              </button>
              <button
                type="button"
                className={`admin-users-state-button role ${roleTarget.role === "CUSTOMER" ? "promote" : "demote"}`}
                disabled={
                  actionLoading ||
                  roleEligibilityLoading ||
                  !roleReason.trim() ||
                  (roleTarget.role === "HOTEL_ADMIN" && !roleEligibility?.eligible)
                }
                onClick={() => void changeRole()}
              >
                {actionLoading
                  ? "Đang xử lý..."
                  : roleTarget.role === "CUSTOMER"
                    ? "Xác nhận chuyển thành Hotel Admin"
                    : "Xác nhận chuyển về Customer"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {confirmTarget ? (
        <div className="admin-modal-layer admin-confirm-layer" role="presentation" onMouseDown={(event) => !actionLoading && event.target === event.currentTarget && setConfirmTarget(null)}>
          <section className="admin-modal small admin-lock-confirm" role="dialog" aria-modal="true">
            <span className={`admin-confirm-icon ${isLocked(confirmTarget.status) ? "unlock" : "lock"}`}>
              {isLocked(confirmTarget.status) ? <Unlock size={26} /> : <Lock size={26} />}
            </span>
            <h2>{isLocked(confirmTarget.status) ? "Mở khóa tài khoản?" : "Khóa tài khoản?"}</h2>
            <p>
              {isLocked(confirmTarget.status)
                ? <>Tài khoản <strong>{confirmTarget.email}</strong> sẽ có thể đăng nhập lại.</>
                : <>Tài khoản <strong>{confirmTarget.email}</strong> sẽ không thể đăng nhập cho đến khi được mở khóa.</>}
            </p>
            <div className="admin-modal-actions">
              <button type="button" className="admin-cancel-button" disabled={actionLoading} onClick={() => setConfirmTarget(null)}>Hủy</button>
              <button type="button" className={`admin-users-state-button ${isLocked(confirmTarget.status) ? "unlock" : "lock"}`} disabled={actionLoading} onClick={toggleLock}>
                {actionLoading ? "Đang xử lý..." : isLocked(confirmTarget.status) ? "Xác nhận mở khóa" : "Xác nhận khóa"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="admin-modal-layer admin-confirm-layer" role="presentation" onMouseDown={(event) => !actionLoading && event.target === event.currentTarget && setDeleteTarget(null)}>
          <section className="admin-modal small admin-lock-confirm" role="dialog" aria-modal="true">
            <span className="admin-confirm-icon delete"><Trash2 size={26} /></span>
            <h2>Xóa tài khoản?</h2>
            <p>
              Tài khoản <strong>{deleteTarget.email}</strong> sẽ không thể đăng nhập lại.
              Lịch sử booking, payment, refund và dữ liệu đối soát vẫn được giữ nguyên.
            </p>
            <div className="admin-soft-delete-note">Đây là xóa mềm (Soft Delete), không xóa bản ghi khỏi database.</div>
            <div className="admin-modal-actions">
              <button type="button" className="admin-cancel-button" disabled={actionLoading} onClick={() => setDeleteTarget(null)}>Hủy</button>
              <button type="button" className="admin-users-state-button delete" disabled={actionLoading} onClick={deleteAccount}>
                {actionLoading ? "Đang xử lý..." : "Xác nhận xóa"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}