const GENERIC_ACTIONS = new Set([
  "",
  "/",
  "/hotel-admin",
  "/customer/bookings",
]);

function normalizeRole(role) {
  return String(role ?? "")
    .trim()
    .toUpperCase()
    .replace(/^ROLE_/, "");
}

function normalizeType(type) {
  return String(type ?? "").trim().toUpperCase();
}

function normalizeCategory(category) {
  return String(category ?? "").trim().toUpperCase();
}

/**
 * Old notifications in the database may only contain a generic actionUrl such
 * as /hotel-admin. Resolve those to the most useful section so clicking a
 * notification always produces a visible navigation result.
 *
 * New/specific actionUrl values are kept untouched.
 */
export function resolveNotificationTarget(item, role) {
  const actionUrl = String(item?.actionUrl ?? "").trim();
  const type = normalizeType(item?.type);
  const category = normalizeCategory(item?.category);
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === "HOTEL_ADMIN") {
    if (category === "HOUSEKEEPING" || type === "ROOM_CLEANING") {
      return actionUrl && actionUrl !== "/hotel-admin"
        ? actionUrl
        : "/hotel-admin/rooms?status=CLEANING";
    }

    if (type === "ROOM_READY") {
      return actionUrl && actionUrl !== "/hotel-admin"
        ? actionUrl
        : "/hotel-admin/rooms";
    }

    if (category === "FINANCE") {
      return actionUrl && actionUrl !== "/hotel-admin"
        ? actionUrl
        : "/hotel-admin/wallet";
    }

    if (category === "HOTEL") {
      return actionUrl && actionUrl !== "/hotel-admin"
        ? actionUrl
        : "/hotel-admin/hotels";
    }

    if (category === "REVIEW") {
      return actionUrl && !GENERIC_ACTIONS.has(actionUrl)
        ? actionUrl
        : "/hotel-admin#recent-bookings";
    }

    if (category === "BOOKING" || category === "PAYMENT") {
      if (actionUrl && !GENERIC_ACTIONS.has(actionUrl)) return actionUrl;
      return "/hotel-admin#recent-bookings";
    }
  }

  if (normalizedRole === "CUSTOMER") {
    if (category === "PARTNER") {
      return actionUrl && actionUrl !== "/"
        ? actionUrl
        : "/customer/partner";
    }

    if (category === "BOOKING" || category === "PAYMENT" || category === "REVIEW") {
      if (actionUrl && actionUrl !== "/customer/bookings" && actionUrl !== "/") {
        return actionUrl;
      }
      return "/customer/bookings#booking-list";
    }

    if (category === "HOTEL" && actionUrl && actionUrl !== "/") {
      return actionUrl;
    }
  }

  if (normalizedRole === "SYSTEM_ADMIN") {
    if (category === "PARTNER") {
      return actionUrl && actionUrl !== "/" ? actionUrl : "/admin/partner-requests";
    }

    if (category === "HOTEL") {
      return actionUrl && actionUrl !== "/" ? actionUrl : "/admin/hotels";
    }

    if (category === "FINANCE" || category === "PAYMENT") {
      return actionUrl && actionUrl !== "/" ? actionUrl : "/admin/wallet";
    }
  }

  return actionUrl || (
    normalizedRole === "HOTEL_ADMIN"
      ? "/hotel-admin/notifications"
      : normalizedRole === "SYSTEM_ADMIN"
        ? "/admin/notifications"
        : "/customer/notifications"
  );
}

export function notificationHasAction(item, role) {
  return Boolean(resolveNotificationTarget(item, role));
}

export function scrollToHashTarget(hash, options = {}) {
  const id = String(hash ?? "").replace(/^#/, "");
  if (!id) return false;

  const element = document.getElementById(id);
  if (!element) return false;

  element.scrollIntoView({
    behavior: options.behavior ?? "smooth",
    block: options.block ?? "center",
  });

  element.classList.add("notification-deep-link-focus");
  window.setTimeout(() => {
    element.classList.remove("notification-deep-link-focus");
  }, options.highlightMs ?? 2200);

  return true;
}
