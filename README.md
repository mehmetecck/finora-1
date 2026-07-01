# Finora — Stock Market Web App

A modern, responsive stock market platform built with **HTML**, **CSS**, **Bootstrap**, **JavaScript**, and **PHP**.

## Tech Stack

- **Frontend:** HTML, CSS, Vanilla JS
- **UI Framework:** [Bootstrap 5.3](https://getbootstrap.com/) & [Bootstrap Icons](https://icons.getbootstrap.com/)
- **Authentication:** [Firebase Authentication](https://firebase.google.com/docs/auth)
- **Backend:** **PHP** for server-side API proxying.
- **PHP Dependencies:** [Composer](https://getcomposer.org/), [Guzzle](https://github.com/guzzle/guzzle), [php-dotenv](https://github.com/vlucas/phpdotenv), [firebase-php](https://github.com/kreait/firebase-php)
- **Deployment:** Configured for [Vercel](https://vercel.com) with PHP Serverless Functions.


## Color scheme

All colors are defined as CSS custom properties in `assets/css/styles.css` (`:root`), following the project's design spec (Rich Navy background, Turquoise brand, Emerald/Red market colors, and a premium Blue→Purple→Pink gradient).

## Backend & Deployment

This project uses a **PHP API proxy** pattern to protect secret API keys for services like Twelve Data.

- **Security:** Client-side JavaScript calls our own PHP scripts in the `/api` directory. These server-side scripts securely load API keys from the `.env` file and then call the external market data APIs. This ensures secret keys are never exposed in the browser.
- **Authentication:** The PHP endpoints are further secured using the Firebase Admin SDK to verify that requests are coming from a valid, logged-in user.
- **Deployment:** The project is configured for zero-config deployment on **Vercel**. The `vercel.json` file instructs Vercel to deploy the PHP scripts as Serverless Functions. Remember to set your environment variables in the Vercel project settings.

## Run Locally

The project now requires a PHP environment to run the backend API proxy.

1.  **Install Dependencies:**
    ```bash
    composer install
    ```
2.  **Configure Environment:** Create a `.env` file in the root directory and add your secret API keys and file paths.

3.  **Run the Server:**
    ```bash
    php -S localhost:8000
    ```

Then visit http://localhost:8000 in your browser.

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

The country picker is loaded from
`country-flag-emoji-json@2.0.0/dist/index.json` on jsDelivr and caches the last
successful catalog in `localStorage`. On the first visit, Finora asks the
browser for a coarse location and resolves it to a country. If location
permission is unavailable or declined, it falls back to country-level IP
lookup and finally the browser locale. Only the resolved country is stored;
coordinates are never stored.

The preference appears in Profile → Settings and in the market country picker.
Changing it in either place updates the shared preference. Stock search uses
Twelve Data's global symbol metadata and filters results by the selected
country and exchange.

## Structure

```
Finora/
├── api/                    # PHP Serverless Functions (API Proxy)
│   └── market-data.php
├── index.html              # Home              (HTML entry pages live at the root)
├── market.html             # Market (stock detail)
├── portfolio.html          # Portfolio
│   │   ├── firebase-config.js  # Firebase init (add your project config here)
│   │   ├── main.js             # Global `Finora`: auth, navbar, toasts, helpers
│   │   ├── charts.js           # Vanilla <canvas> chart helper (no Chart.js)
│   │   └── api.js              # FinoraAPI — now calls the internal /api proxy
│   └── pages/              # One script per screen
│       ├── home.js
│       ├── market.js
│       ├── portfolio.js
│       ├── prosubscription.js
│       ├── login.js
│       └── profile.js
│
├── .env                    # Local environment variables (DO NOT COMMIT)
├── composer.json           # PHP dependencies
├── vercel.json             # Vercel deployment configuration
├── README.md
├── package.json
└── .gitignore


```
