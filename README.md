# Finora — Stock Market Web App

A modern, responsive stock market platform built with **HTML**, **CSS**, **Bootstrap** and **JavaScript**. 

## Pages

- `index.html` — **Home**: hero, live ticker tape, market indices, trending stocks table and feature highlights.
- `market.html` — **Market**: detailed company view with price chart, key information/statistics, historical prices table, latest news and an about section. Pick a company from the sidebar or via `?symbol=AAPL`.
- `portfolio.html` — **Portfolio**: track holdings with summary cards, a performance chart, an allocation doughnut and recent transactions (requires login).
- `prosubscription.html` — **Pro**: upgrade/buy plans (Free / Pro / Premium) with a monthly/yearly toggle, comparison table and FAQ.
- `login.html` — **Login / Registration**: tabbed form with validation, password-strength meter and show/hide password.
- `profile.html` — **Profile**: account overview, holdings, performance chart, account settings and security.

Top navigation: **Home · Market · Portfolio · Pro · Profile**.

## Tech

- [Bootstrap 5.3](https://getbootstrap.com/) (CDN) — layout & components
- [Bootstrap Icons](https://icons.getbootstrap.com/) (CDN)
- [Firebase Authentication](https://firebase.google.com/docs/auth) (CDN, compat SDK) — real email/password & Google accounts
- Google Fonts — Inter
- Vanilla JS — all app logic, **including charts** (custom `<canvas>` helper in `js/core/charts.js`, no charting library)

## Market data API

There is **no mock data** in the app. All market/portfolio data flows through a single service layer, `js/core/api.js` (`FinoraAPI`). Each page calls it and renders a friendly empty state until the API is connected.

To go live:

1. Open `js/core/api.js` and set `API_BASE` and `API_KEY` for your provider (e.g. Finnhub, Alpha Vantage, Polygon, Twelve Data).
2. Map the provider's JSON to the documented return shape inside each method (the expected shapes are described in comments above every function).

Endpoints exposed by `FinoraAPI`: `getIndices`, `getTrending`, `getStock`, `getHistory`, `getNews`, `getPortfolio`, `getPortfolioHistory`, `getTransactions`.

## Firebase setup (required for login/registration)

Authentication uses **Firebase Authentication**. To connect it to your own project:

1. Create a project at <https://console.firebase.google.com/>.
2. Enable **Build → Authentication → Sign-in method → Email/Password**.
3. (Optional, for the Google button) also enable the **Google** provider there.
4. Add a **Web app** under **Project settings → Your apps** and copy the `firebaseConfig`.
5. Paste those values into `js/core/firebase-config.js` (replacing the placeholders).

> Google sign-in uses a popup, so test over `http://localhost` (not the `file://` protocol) and add your domain under **Authentication → Settings → Authorized domains** if needed.

### Demo / testing without Firebase

Until you paste real config values, the app automatically uses a **local demo auth** (stored in `localStorage`) so you can still test login and the protected pages. A test account is pre-seeded and the login form is prefilled with it:

- **Email:** `test@finora.com`
- **Password:** `test1234`

You can also register new demo accounts. As soon as real Firebase keys are added to `js/core/firebase-config.js`, the app switches to Firebase automatically.

Non-auth profile details (plan, balance, phone, country, bio) are stored in `localStorage`
keyed by the Firebase user `uid` for this demo.

## Color scheme

All colors are defined as CSS custom properties in `assets/css/styles.css` (`:root`), following the project's design spec (Rich Navy background, Turquoise brand, Emerald/Red market colors, and a premium Blue→Purple→Pink gradient).

## Run

It's a static site — just open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

Then visit http://localhost:8000

## Structure

```
Finora/
├── index.html              # Home              (HTML entry pages live at the root)
├── market.html             # Market (stock detail)
├── portfolio.html          # Portfolio
├── prosubscription.html    # Pro / pricing
├── login.html              # Login / Registration
├── profile.html            # Profile
│
├── assets/                 # Static assets
│   └── css/
│       └── styles.css      # Design system + components
│
├── js/
│   ├── core/               # Shared scripts, loaded on every page
│   │   ├── firebase-config.js  # Firebase init (add your project config here)
│   │   ├── main.js             # Global `Finora`: auth, navbar, toasts, helpers
│   │   ├── charts.js           # Vanilla <canvas> chart helper (no Chart.js)
│   │   └── api.js              # FinoraAPI — market/portfolio data service (add your API here)
│   └── pages/              # One script per screen
│       ├── home.js
│       ├── market.js
│       ├── portfolio.js
│       ├── prosubscription.js
│       ├── login.js
│       └── profile.js
│
├── README.md
├── package.json
└── .gitignore
```

### How the scripts load

Every page loads the shared `js/core/*` scripts first, then its own `js/pages/*` script. For example, the home page loads:

```
firebase SDK → js/core/firebase-config.js → js/core/main.js → js/core/charts.js → js/core/api.js → js/pages/home.js
```

- `core/main.js` defines the global `Finora` object (auth + helpers).
- `pages/*.js` use `Finora`, `FinoraAPI` and `FinoraChart` to wire up that specific screen.
