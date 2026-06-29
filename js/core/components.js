/* =====================================================================
   Finora shared layout components
   ---------------------------------------------------------------------
   <finora-header>                       Standard application header
   <finora-header minimal>               Header without the Premium CTA
   <finora-footer>                       Compact application footer
   <finora-footer variant="landing">     Expanded landing-page footer
   ===================================================================== */

(function() {
  function loadHtml(file) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', file, false); // `false` makes the request synchronous
    xhr.send(null);
    if (xhr.status === 200) {
      return xhr.responseText;
    }
    console.error(`Error loading ${file}: ${xhr.statusText}`);
    return `<div>Error loading ${file}</div>`;
  }

  class FinoraHeader extends HTMLElement {
    connectedCallback() {
      const html = loadHtml('_header.html');
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      const nav = tempDiv.firstElementChild;

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
      const footerFile = isLanding ? '_footer_landing.html' : '_footer.html';
      const html = loadHtml(footerFile);
      this.outerHTML = html;
    }
  }

  if (!customElements.get("finora-header")) customElements.define("finora-header", FinoraHeader);
  if (!customElements.get("finora-footer")) customElements.define("finora-footer", FinoraFooter);
})();
