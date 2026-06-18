/* =====================================================================
   Finora — Firebase initialization
   ---------------------------------------------------------------------
   SETUP (one-time):
   1. Go to https://console.firebase.google.com/ and create a project.
   2. In the project, open  Build > Authentication > Get started  and
      enable the "Email/Password" sign-in provider.
   3. Open  Project settings (gear icon) > Your apps > Web app (</>)  and
      register a web app. Copy the generated "firebaseConfig" values.
   4. Paste them below, replacing the placeholders.

   This uses the Firebase "compat" SDK so it works with plain <script>
   tags (no bundler/modules needed). The SDK scripts are included in each
   HTML page BEFORE this file.
   ===================================================================== */

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Detect whether real credentials have been added yet. Until then, the app
// falls back to a local (localStorage) demo auth so you can still test login.
window.FIREBASE_CONFIGURED =
  !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("YOUR_");

if (window.FIREBASE_CONFIGURED) {
  firebase.initializeApp(firebaseConfig);
  window.firebaseAuth = firebase.auth();
  // Keep the user signed in across page reloads/tabs.
  window.firebaseAuth
    .setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch((err) => console.warn("Auth persistence error:", err));
} else {
  console.info("[Finora] Firebase not configured — using local demo auth. Test login: test@finora.com / test1234");
}
