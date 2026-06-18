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
