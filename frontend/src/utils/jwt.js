import { jwtDecode } from "jwt-decode";

/**
 * Decode JWT.
 */
export function decodeAccessToken(token) {
  if (!token) {
    return null;
  }

  try {
    return jwtDecode(token);
  } catch (error) {
    console.error("Không thể decode access token:", error);
    return null;
  }
}

/**
 * Kiểm tra JWT hết hạn.
 */
export function isTokenExpired(token) {
  const payload = decodeAccessToken(token);

  if (!payload?.exp) {
    return true;
  }

  return payload.exp * 1000 <= Date.now();
}

/**
 * Chuẩn hóa role.
 *
 * Hỗ trợ:
 *
 * CUSTOMER
 * ROLE_CUSTOMER
 * customer
 *
 * ["CUSTOMER"]
 * ["ROLE_CUSTOMER"]
 *
 * authorities: ["ROLE_CUSTOMER"]
 */
function normalizeRole(value) {
  if (!value) {
    return null;
  }

  let role = value;

  // Nếu backend trả array
  if (Array.isArray(role)) {
    role = role[0];
  }

  // Nếu role là object
  if (
    typeof role === "object" &&
    role !== null
  ) {
    role =
      role.authority ??
      role.role ??
      role.name ??
      null;
  }

  if (!role) {
    return null;
  }

  return String(role)
    .trim()
    .replace(/^ROLE_/i, "")
    .toUpperCase();
}

/**
 * Tìm role từ nhiều kiểu JWT khác nhau.
 */
function extractRole(payload) {
  if (!payload) {
    return null;
  }

  /*
   * Trường hợp:
   *
   * {
   *   "role": "CUSTOMER"
   * }
   */
  if (payload.role) {
    return normalizeRole(payload.role);
  }

  /*
   * {
   *   "roles": ["CUSTOMER"]
   * }
   */
  if (payload.roles) {
    return normalizeRole(payload.roles);
  }

  /*
   * {
   *   "authorities": ["ROLE_CUSTOMER"]
   * }
   */
  if (payload.authorities) {
    return normalizeRole(payload.authorities);
  }

  /*
   * Một số Spring Security JWT có:
   *
   * {
   *   "scope": "ROLE_CUSTOMER"
   * }
   */
  if (payload.scope) {
    const scopes = String(payload.scope)
      .split(/\s+/)
      .filter(Boolean);

    const roleScope = scopes.find(
      (item) =>
        item
          .toUpperCase()
          .startsWith("ROLE_"),
    );

    if (roleScope) {
      return normalizeRole(roleScope);
    }
  }

  return null;
}

/**
 * Build user dùng toàn frontend.
 */
export function buildUserFromToken(token) {
  const payload = decodeAccessToken(token);

  if (!payload) {
    return null;
  }

  const role = extractRole(payload);

  const user = {
    /*
     * AuthContext hiện có đoạn:
     *
     * userId: tokenUser.userId
     *
     * nên PHẢI có userId.
     *
     * Trước đây jwt.js chỉ trả id,
     * làm tokenUser.userId bị undefined.
     */
    userId:
      payload.userId ??
      payload.user_id ??
      payload.id ??
      payload.sub ??
      null,

    id:
      payload.userId ??
      payload.user_id ??
      payload.id ??
      payload.sub ??
      null,

    username:
      payload.username ??
      payload.preferred_username ??
      null,

    email:
      payload.email ??
      null,

    fullName:
      payload.fullName ??
      payload.full_name ??
      payload.name ??
      payload.username ??
      null,

    role,

    emailVerified:
      payload.emailVerified ??
      payload.email_verified ??
      false,

    avatarUrl:
      payload.avatarUrl ??
      payload.avatar_url ??
      payload.picture ??
      null,
  };


  return user;
}