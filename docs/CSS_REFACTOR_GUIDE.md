# EnziuRooms CSS architecture

`src/styles/global.css` used to contain ~9,000 lines. It is now intentionally split by responsibility.

## Entry point

`src/main.jsx` imports:

```js
import "./styles/index.css";
```

`src/styles/index.css` is the only aggregator and preserves the old cascade order.

## Modules

```text
src/styles/
├── index.css
├── global.css                  # deprecated stub only
├── core/
│   └── base.css                # CSS variables, reset, shared foundations
├── layout/
│   ├── navbar.css              # public/customer navigation
│   └── footer.css              # footer
├── pages/
│   ├── home.css                # homepage + hero motion
│   ├── hotels.css              # hotel listing/public hotel page foundations
│   └── auth-account.css        # auth/account/shared account pages
├── customer/
│   ├── search-booking.css      # customer hotel search & booking flow
│   └── booking-center.css      # booking panel/booking center
├── admin/
│   ├── admin-shell.css         # shared admin shell/navbar/layout
│   ├── hotel-admin.css         # hotel-admin shared UI
│   ├── hotel-dashboard.css     # hotel dashboard v2
│   ├── hotel-dashboard-modern.css # latest hotel dashboard refinements
│   ├── system-dashboard.css    # system-admin dashboard
│   └── admin-management.css    # account/partner/eKYC/admin management
├── notifications.css          # notification center
└── responsive.css             # global responsive foundation
```

## Homepage hero motion

The homepage hero now uses:

- slow Ken Burns zoom/pan (18 seconds)
- subtle mouse parallax on desktop
- moving light gradient
- no React state updates per pointer move (CSS variables + requestAnimationFrame)
- `prefers-reduced-motion` support
- parallax disabled on touch/coarse-pointer devices

The hero attempts to use a real hotel cover image returned by the Hotel API. If no hotel image is available, it falls back to `src/assets/hero.png`.

## Rule for new CSS

Do not add large page-specific blocks back into `global.css`.

- Component CSS → next to component.
- Page CSS → existing page file or a focused file under `src/styles/pages/`.
- Shared admin styles → `src/styles/admin/`.
- Shared customer styles → `src/styles/customer/`.
- Only truly global foundations → `src/styles/core/base.css`.
