/* =====================================================================
   Finora — HTML Component Loader
   Fetches and injects reusable HTML partials like the header and footer.
   ===================================================================== */

const FinoraComponents = (function() {
  async function loadComponent(url, placeholderId) {
    const placeholder = document.getElementById(placeholderId);
    if (!placeholder) return;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to load ${url}`);
      const content = await response.text();
      placeholder.outerHTML = content;
    } catch (error) {
      console.error(`Error loading component for ${placeholderId}:`, error);
      placeholder.innerHTML = `<p class="text-center text-bear small">Error loading component: ${url}</p>`;
    }
  }

  async function loadAll() {
    await Promise.all([
      loadComponent("_header.html", "header-placeholder"),
      loadComponent("_footer.html", "footer-placeholder"),
    ]);
  }

  // This now becomes the main entry point for the application on page load.
  // It ensures components are loaded *before* any other logic runs.
  document.addEventListener("DOMContentLoaded", async () => {
    await loadAll();
    if (window.Finora && typeof window.Finora.init === "function") {
      window.Finora.init();
    }
  });

  return { loadAll };
})();