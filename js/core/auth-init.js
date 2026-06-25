/**
 * Finora - Synchronous Auth State Initializer
 *
 * This script runs in the <head> of every page *before* the DOM is built.
 * It checks for a session flag in localStorage and applies a class to the
 * <html> element if the user is likely logged in. This allows CSS to
 * immediately show the correct UI state and prevent content flicker
 * (e.g., showing "Login" before it changes to "My Profile").
 *
 * The full async Firebase check in main.js will still run to verify the session.
 */
if (localStorage.getItem("finora_session_active") === "true") {
  document.documentElement.classList.add("auth-active");
}