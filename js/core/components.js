/* =====================================================================
   Finora shared layout components
   ---------------------------------------------------------------------
   <finora-header>                       Standard application header
   <finora-header minimal>               Header without the Premium CTA
   <finora-footer>                       Compact application footer
   <finora-footer variant="landing">     Expanded landing-page footer
   ===================================================================== */

(function() {
  const HEADER_HTML = `
    <nav class="navbar navbar-expand-lg sticky-top">
      <div class="container navbar-finora">
        <div class="navbar-start">
          <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav" aria-controls="nav" aria-expanded="false" aria-label="Toggle navigation">
            <span class="navbar-toggler-icon"></span>
          </button>
          <a class="navbar-brand d-flex align-items-center gap-2" href="index.html">
            <span class="brand-logo"><img src="assets/logos/finora.png" alt="Finora"></span> Finora
          </a>
        </div>
        <div class="collapse navbar-collapse" id="nav">
          <ul class="navbar-nav mx-auto gap-1">
            <li class="nav-item"><a class="nav-link" href="home.html">Home</a></li>
            <li class="nav-item"><a class="nav-link" href="market.html">Market</a></li>
            <li class="nav-item"><a class="nav-link" href="portfolio.html">Portfolio</a></li>
            <li class="nav-item"><a class="nav-link" href="watchlist.html">Watchlist</a></li>
          </ul>
        </div>
        <div class="navbar-actions" data-nav-auth></div>
      </div>
    </nav>`;

  const FOOTER_HTML = `
    <footer class="footer mt-auto py-3">
      <div class="container text-center">
        <span class="text-muted-2 small">© 2026 Finora.</span>
      </div>
    </footer>`;

  const LANDING_FOOTER_HTML = `
    <footer class="footer">
      <div class="container">
        <div class="row g-4">
          <div class="col-lg-4">
            <a class="navbar-brand d-flex align-items-center gap-2 mb-2" href="index.html">
              <span class="brand-logo"><img src="assets/logos/finora.png" alt="Finora"></span> Finora
            </a>
            <p class="text-muted-2" style="max-width:300px">Invest smarter, trade with confidence. The modern home for your portfolio.</p>
            <div class="d-flex gap-3 fs-5">
              <a href="#" aria-label="Finora on GitHub"><i class="bi bi-github"></i></a>
            </div>
          </div>
          <div class="col-6 col-lg-2"><h6 class="text-white mb-3">Product</h6><ul class="list-unstyled d-grid gap-2"><li><a href="market.html">Markets</a></li><li><a href="#features">Features</a></li><li><a href="prosubscription.html">Pricing</a></li></ul></div>
          <div class="col-6 col-lg-2"><h6 class="text-white mb-3">Company</h6><ul class="list-unstyled d-grid gap-2"><li><a href="#">About</a></li><li><a href="#">Careers</a></li><li><a href="#">Blog</a></li><li><a href="#">Press</a></li></ul></div>
          <div class="col-6 col-lg-2"><h6 class="text-white mb-3">Resources</h6><ul class="list-unstyled d-grid gap-2"><li><a href="#">Help center</a></li><li><a href="#">API docs</a></li><li><a href="#">Status</a></li><li><a href="#">Community</a></li></ul></div>
          <div class="col-6 col-lg-2"><h6 class="text-white mb-3">Legal</h6><ul class="list-unstyled d-grid gap-2"><li><a href="#">Privacy</a></li><li><a href="#">Terms</a></li><li><a href="#">Security</a></li><li><a href="#">Disclosures</a></li></ul></div>
        </div>
        <hr class="divider-line my-4" />
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <span class="text-muted-2 small">© 2026 Finora.</span>
        </div>
      </div>
    </footer>`;

  function elementFrom(html) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  class FinoraHeader extends HTMLElement {
    connectedCallback() {
      const nav = elementFrom(HEADER_HTML);

      if (this.hasAttribute("minimal")) {
        const actions = nav.querySelector('.navbar-actions');
        if (actions) {
          actions.setAttribute('data-nav-minimal', '');
        }
      }
      this.replaceWith(nav);
    }
  }

  class FinoraFooter extends HTMLElement {
    connectedCallback() {
      const isLanding = this.getAttribute("variant") === "landing";
      this.replaceWith(elementFrom(isLanding ? LANDING_FOOTER_HTML : FOOTER_HTML));
    }
  }

  if (!customElements.get("finora-header")) customElements.define("finora-header", FinoraHeader);
  if (!customElements.get("finora-footer")) customElements.define("finora-footer", FinoraFooter);
})();
