# Finora — Stock Market Web App

A modern, responsive stock market platform built with **HTML**, **CSS**, **Bootstrap** and **JavaScript**. 

## Tech Stack

- [Bootstrap 5.3](https://getbootstrap.com/) 
- [Bootstrap Icons](https://icons.getbootstrap.com/) 
- [Firebase Authentication](https://firebase.google.com/docs/auth)
- Google Fonts — Inter
- Vanilla JS — all app logic

## Color scheme

All colors are defined as CSS custom properties in `assets/css/styles.css` (`:root`), following the project's design spec (Rich Navy background, Turquoise brand, Emerald/Red market colors, and a premium Blue→Purple→Pink gradient).

## Run

It's a static site — just open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

Then visit http://localhost:8000

## LogoKit setup

Finora loads stock logos dynamically from LogoKit's ticker endpoint, so company
logos are no longer limited to the images in `assets/logos`.

1. Create a LogoKit account and copy the **publishable** API token.
2. Set `logoKitToken` in `js/core/config.js`.

The token is sent from the browser as required by LogoKit's image API. Do not
put a secret Brand API token in the client configuration. When no publishable
token is configured (or a logo is unavailable), Finora falls back to its
generated ticker avatar.

## Market country

On the first visit, Finora asks the browser for a coarse location and resolves
it to a country. If location permission is unavailable or declined, it falls
back to country-level IP lookup and finally the browser locale. Only the
resolved country is stored in `localStorage`; coordinates are never stored.

The preference appears in Profile → Settings and in the market country picker.
Changing it in either place updates the shared preference. Stock search uses
Twelve Data's global symbol metadata and filters results by the selected
country and exchange.

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
