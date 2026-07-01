# Finora — Stock Market Web App

A modern, responsive stock market platform built with **HTML**, **CSS**, **Bootstrap**, **JavaScript**, and **PHP**.

## Tech Stack

- **Frontend:** HTML, CSS, Vanilla JS
- **UI Framework:** [Bootstrap 5.3](https://getbootstrap.com/) & [Bootstrap Icons](https://icons.getbootstrap.com/)
- **Authentication:** [Firebase Authentication](https://firebase.google.com/docs/auth)
- **Backend:** One dependency-free **PHP** market-data proxy.
- **Deployment:** Configured for [Vercel](https://vercel.com) with PHP Serverless Functions.


## Color scheme

All colors are defined as CSS custom properties in `assets/css/styles.css` (`:root`), following the project's design spec (Rich Navy background, Turquoise brand, Emerald/Red market colors, and a premium Blue→Purple→Pink gradient).

## Backend & Deployment

On Vercel, the browser calls `api/market-data.php` instead of calling Finnhub
and Twelve Data directly. The PHP file accepts only known actions, adds the
appropriate API key on the server, fetches the provider response, and returns
JSON. Localhost uses the same built-in keys directly so it also works with
minimal PHP installations that lack the cURL extension.

For this classroom project, the market-data keys are included as defaults in
the PHP proxy so a fresh clone works without configuration. Optional
`FINNHUB_API_KEY` and `TWELVE_DATA_API_KEY` environment variables override
those defaults when present.

`vercel.json` deploys files in `api/` with the `vercel-php` runtime. Composer
is not required.

## Deploy to Vercel

1. Import this GitHub repository into Vercel and use the **Other** framework
   preset.
2. Deploy the project; no environment-variable setup is required.
3. Confirm PHP is running by opening:
   `/api/market-data.php?action=quote&symbol=AAPL`

That URL should return JSON from Finnhub. The web app uses the same endpoint
automatically.

## Run Locally

Start PHP's built-in server from the repository root:

```powershell
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
├── api/
│   └── market-data.php     # PHP proxy for Finnhub and Twelve Data
├── js/
│   ├── core/
│   │   ├── api.js          # Calls the PHP proxy
│   │   ├── main.js
│   │   └── ...
│   └── pages/
├── index.html
├── market.html
├── vercel.json             # Deploys api/*.php with vercel-php
├── README.md
└── package.json
```
