/* =====================================================================
   Finora — Landing page logic
   Toggles hero CTAs based on auth state to prevent flicker.
   ===================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const guestActions = document.querySelector('[data-landing-cta="guest-actions"]');
  const loader = document.querySelector('[data-landing-cta="loader"]');
  const signedActions = document.querySelector('[data-landing-cta="signed-actions"]');

  Finora.authReady.then((user) => {
    const target = user ? signedActions : guestActions;
    if (loader) loader.classList.add("d-none");
    if (target) {
      target.classList.remove("d-none");
    }
  });
});