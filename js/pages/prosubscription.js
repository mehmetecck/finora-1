/* =====================================================================
   Finora — Pricing / Premium page
   ===================================================================== */

document.addEventListener("DOMContentLoaded", function() {
  var plans = [
    {
      id: "Free", name: "Free", monthly: 0,
      tagline: "For getting started", featured: false,
      cta: "Your current plan",
      features: ["Real-time quotes", "Basic charts", "1 watchlist"],
    },
    {
      id: "Premium", name: "Premium", monthly: 14.99,
      tagline: "For professionals", featured: true,
      cta: "Upgrade to Premium",
      features: [
        "Everything in Free",
        "Advanced charts & indicators",
        "Unlimited watchlists",
        "AI insights & signals",
        "Level 2 market data",
        "Portfolio automation",
        "Options analytics",
        "API access",
      ],
    },
  ];

  var billing = "monthly"; // or "yearly" (20% off)
  var row = document.getElementById("plansRow");

  function priceFor(plan) {
    if (plan.monthly === 0) return { big: "$0", sub: "forever" };
    if (billing === "yearly") {
      var perMonth = plan.monthly * 0.8;
      return { big: "$" + perMonth.toFixed(2), sub: "/mo · billed $" + (perMonth * 12).toFixed(0) + "/yr" };
    }
    return { big: "$" + plan.monthly.toFixed(2), sub: "/mo" };
  }

  function render() {
    var profile = Finora.getProfile();
    var current = (profile && profile.plan) || "Free";
    row.innerHTML = plans
      .map(function(plan) {
        var p = priceFor(plan);
        var isCurrent = plan.id === current;
        var cta = isCurrent ? "Current plan" : plan.cta;
        return `<div class="col-md-6 col-lg-5">
            <div class="card-finora plan-card h-100 p-4 ${plan.featured ? "featured" : ""}">
              ${plan.featured ? `<span class="badge badge-premium plan-badge">Most popular</span>` : ""}
              <h4 class="fw-bold mb-1">${plan.name}</h4>
              <p class="text-muted-2 mb-3">${plan.tagline}</p>
              <div class="mb-3">
                <span class="display-6 fw-bold">${p.big}</span>
                <span class="text-muted-2">${p.sub}</span>
              </div>
              <button class="btn ${plan.featured ? "btn-premium" : "btn-outline-brand"} w-100 mb-3"
                ${isCurrent ? "disabled" : ""} data-buy="${plan.id}">
                ${cta}
              </button>
              <ul class="list-unstyled d-grid gap-2 mb-0">
                ${plan.features
                  .map(function(f) { return `<li class="d-flex align-items-start gap-2"><i class="bi bi-check-circle-fill text-brand mt-1"></i><span class="text-secondary-2">${f}</span></li>`; })
                  .join("")}
              </ul>
            </div>
          </div>`;
      })
      .join("");

    row.querySelectorAll("[data-buy]").forEach(function(btn) {
      btn.addEventListener("click", function() { buy(btn.dataset.buy); });
    });
  }

  async function buy(planId) {
    var user = Finora.getProfile();
    if (!user) {
      window.location.href = "login.html?next=prosubscription.html";
      return;
    }
    await Finora.updateProfile({ plan: planId });
    Finora.toast("You're now on the " + planId + " plan!", "success");
    render();
  }

  document.querySelectorAll("#billingToggle button").forEach(function(b) {
    b.addEventListener("click", function() {
      document.querySelectorAll("#billingToggle button").forEach(function(x) { x.classList.remove("active"); });
      b.classList.add("active");
      billing = b.dataset.billing;
      render();
    });
  });

  // Wait for auth state so the "current plan" reflects the logged-in user.
  Finora.authReady.then(render);
});
