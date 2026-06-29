/* Public browser configuration.
   LogoKit uses a publishable token, so it is safe to expose this value in the
   client bundle. Never put a LogoKit secret Brand API token here. */
window.FINORA_CONFIG = Object.assign({
  logoKitToken: "YOUR_LOGOKIT_PUBLISHABLE_TOKEN",
}, window.FINORA_CONFIG || {});
