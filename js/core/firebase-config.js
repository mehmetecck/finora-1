/* =====================================================================
   Finora - Firebase initialization
   ---------------------------------------------------------------------
   SETUP (one-time):
   1. Go to https://console.firebase.google.com/ and create a project.
   2. In the project, open Build > Authentication > Get started and enable
      the Email/Password and Google sign-in providers.
   3. Open Project settings (gear icon) > Your apps > Web app (</>) and
      register a web app. Copy the generated firebaseConfig values.
   4. Paste the Web app config below, replacing the placeholders.

   IMPORTANT:
   Do not paste Firebase Admin SDK / service-account JSON here. Files with
   private_key, client_email, or type: "service_account" are server secrets and
   must never be shipped to browsers or committed to GitHub.

   This uses the Firebase compat SDK so it works with plain <script> tags.
   The SDK scripts are included in each HTML page before this file.
   ===================================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyCfdOUi2KpTEckJUEGS9kIBZvCribWbPeE",
  authDomain: "skibidi-c3f4c.firebaseapp.com",
  projectId: "skibidi-c3f4c",
  storageBucket: "skibidi-c3f4c.firebasestorage.app",
  messagingSenderId: "378713624345",
  appId: "1:378713624345:web:d0b5d85b09d3886cadff88",
};

const requiredFirebaseKeys = ["apiKey", "authDomain", "projectId", "appId"];
const hasAdminCredential =
  firebaseConfig.type === "service_account" ||
  Boolean(firebaseConfig.private_key || firebaseConfig.client_email);
const firebaseSdkReady =
  typeof firebase !== "undefined" &&
  typeof firebase.initializeApp === "function" &&
  typeof firebase.auth === "function";

// Detect whether real Web app credentials have been added yet. Until then,
// the app falls back to local auth when Firebase is not configured.
window.FIREBASE_CONFIGURED =
  firebaseSdkReady &&
  !hasAdminCredential &&
  requiredFirebaseKeys.every((key) => {
    const value = firebaseConfig[key];
    return typeof value === "string" && value && !value.startsWith("YOUR_");
  });

if (window.FIREBASE_CONFIGURED) {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  window.firebaseAuth = firebase.auth();
} else if (hasAdminCredential) {
  console.error(
    "[Finora] Firebase Admin SDK credentials were provided to the browser config. Use the Firebase Web app config instead."
  );
} else if (!firebaseSdkReady) {
  console.error("[Finora] Firebase SDK did not load. Check the gstatic Firebase script tags before firebase-config.js.");
} else {
  console.info("[Finora] Firebase not configured — using local auth.");
}
