/* =====================================================================
   Finora — FinoraChart
   Tiny dependency-free charting helper (replaces Chart.js).
   Pure vanilla <canvas> drawing: line charts + sparklines, Hi-DPI aware,
   responsive, with an optional hover tooltip.

   Public API:
     FinoraChart.line(canvas, data, options)
     FinoraChart.sparkline(canvas, data, color, options)

   options:
     color       stroke/fill color (hex)        default "#38BDF8"
     lineWidth   line thickness                 default 2
     fillAlpha   gradient fill opacity (0..1)    default 0.25
     responsive  fit to container width         default true
     axis        draw y-grid + labels           default false
     formatY     fn(value) -> label             default String
     tooltip     fn(value, index) -> HTML       enables hover tooltip
   ===================================================================== */

const FinoraChart = (() => {
  let registry = [];
  let resizeBound = false;

  /* Re-render responsive charts (debounced) when the window resizes. */
  function bindResize() {
    if (resizeBound) return;
    resizeBound = true;
    let t;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        registry = registry.filter((r) => document.body.contains(r.canvas));
        registry.forEach((r) => r.render());
      }, 150);
    });
  }

  /* Convert "#RRGGBB" / "#RGB" to an rgba() string. */
  function rgba(hex, alpha) {
    let h = (hex || "").trim().replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return hex; // already rgb/named — return as-is
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /* Size the canvas backing store for crisp rendering on Hi-DPI screens. */
  function setup(canvas, responsive) {
    const dpr = window.devicePixelRatio || 1;
    if (!canvas.dataset.finoraCssHeight) {
      canvas.dataset.finoraCssHeight = String(parseInt(canvas.getAttribute("height"), 10) || canvas.clientHeight || 150);
    }
    const cssH = parseInt(canvas.dataset.finoraCssHeight, 10) || 150;
    let cssW;
    if (responsive) {
      const parentW = canvas.parentElement ? canvas.parentElement.getBoundingClientRect().width : 0;
      canvas.style.width = "100%";
      canvas.style.display = "block";
      cssW = Math.max(1, Math.floor(parentW || canvas.clientWidth || 600));
    } else {
      cssW = parseInt(canvas.getAttribute("width"), 10) || canvas.clientWidth || 120;
    }
    canvas.style.height = cssH + "px";
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    return { ctx, w: cssW, h: cssH };
  }

  /* Draw the chart and return its geometry (used for tooltips). */
  function draw(canvas, data, opts, responsive) {
    const { ctx, w, h } = setup(canvas, responsive);
    const color = opts.color || "#38BDF8";
    const lineWidth = opts.lineWidth != null ? opts.lineWidth : 2;
    const fillAlpha = opts.fillAlpha != null ? opts.fillAlpha : 0.25;
    const axis = !!opts.axis;

    const padT = 8;
    const padR = 6;
    const padB = axis ? 6 : 4;
    const padL = axis ? 48 : 2;
    const plotW = Math.max(1, w - padL - padR);
    const plotH = Math.max(1, h - padT - padB);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    const xAt = (i) => padL + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
    const yAt = (v) => (range === 0 ? padT + plotH / 2 : padT + (1 - (v - min) / range) * plotH);

    /* y-axis grid + labels */
    if (axis) {
      const fmt = opts.formatY || String;
      const lines = 4;
      ctx.font = "11px Inter, sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "right";
      for (let i = 0; i <= lines; i++) {
        const gy = padT + (i / lines) * plotH;
        const val = max - (i / lines) * range;
        ctx.strokeStyle = "rgba(34, 49, 79, 0.7)"; // --border
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, gy);
        ctx.lineTo(w - padR, gy);
        ctx.stroke();
        ctx.fillStyle = "#64748B"; // muted
        ctx.fillText(fmt(val), padL - 8, gy);
      }
    }

    /* Build a smooth path through the points (midpoint quadratic curves). */
    const pts = data.map((v, i) => ({ x: xAt(i), y: yAt(v), v }));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2;
      const yc = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    if (pts.length > 1) {
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
    }

    /* Gradient fill under the line */
    const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, rgba(color, fillAlpha));
    grad.addColorStop(1, rgba(color, 0));
    ctx.save();
    ctx.lineTo(pts[pts.length - 1].x, padT + plotH);
    ctx.lineTo(pts[0].x, padT + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    /* Stroke the line on top */
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2;
      const yc = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    if (pts.length > 1) ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "round";
    ctx.stroke();

    return { ctx, w, h, padT, padB, points: pts, color };
  }

  function line(canvas, data, opts = {}) {
    if (!canvas || !data || !data.length) return;
    const responsive = opts.responsive !== false;

    // Clean up any previous instance bound to this canvas.
    if (canvas._finoraCleanup) canvas._finoraCleanup();
    registry = registry.filter((r) => r.canvas !== canvas);

    let geom = draw(canvas, data, opts, responsive);
    const render = () => { geom = draw(canvas, data, opts, responsive); };

    if (responsive) {
      registry.push({ canvas, render });
      bindResize();
    }

    /* Optional hover tooltip + crosshair (used by the portfolio chart). */
    if (opts.tooltip) {
      const parent = canvas.parentElement;
      if (parent && getComputedStyle(parent).position === "static") parent.style.position = "relative";
      if (parent) parent.style.overflow = "hidden";
      const tip = document.createElement("div");
      tip.className = "finora-chart-tip";
      parent.appendChild(tip);

      const onMove = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        let nearest = geom.points[0];
        let idx = 0;
        geom.points.forEach((p, i) => {
          if (Math.abs(p.x - mx) < Math.abs(nearest.x - mx)) { nearest = p; idx = i; }
        });
        render(); // redraw clean base
        const ctx = canvas.getContext("2d");
        ctx.save();
        ctx.strokeStyle = "rgba(148,163,184,0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(nearest.x, geom.padT);
        ctx.lineTo(nearest.x, geom.h - geom.padB);
        ctx.stroke();
        ctx.beginPath();
        ctx.fillStyle = geom.color;
        ctx.arc(nearest.x, nearest.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#0B1220";
        ctx.stroke();
        ctx.restore();

        tip.innerHTML = opts.tooltip(nearest.v, idx);
        tip.style.display = "block";
        tip.style.left = (canvas.offsetLeft + nearest.x) + "px";
        tip.style.top = (canvas.offsetTop + nearest.y) + "px";
      };
      const onLeave = () => { tip.style.display = "none"; render(); };

      canvas.addEventListener("mousemove", onMove);
      canvas.addEventListener("mouseleave", onLeave);
      canvas._finoraCleanup = () => {
        canvas.removeEventListener("mousemove", onMove);
        canvas.removeEventListener("mouseleave", onLeave);
        tip.remove();
        registry = registry.filter((r) => r.canvas !== canvas);
      };
    }
  }

  function sparkline(canvas, data, color, opts = {}) {
    line(canvas, data, {
      color,
      axis: false,
      lineWidth: opts.lineWidth || 1.8,
      fillAlpha: opts.fillAlpha != null ? opts.fillAlpha : 0.28,
      responsive: opts.responsive !== false,
    });
  }

  /* --------------------------- Doughnut ---------------------------- */
  // segments: [{ label, value, color }]; opts.centerLabel / opts.centerSub
  function donut(canvas, segments, opts = {}) {
    if (!canvas || !segments || !segments.length) return;
    const render = () => {
      const { ctx, w, h } = setup(canvas, true);
      const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) / 2 - 6;
      const thickness = opts.thickness || radius * 0.42;
      let start = -Math.PI / 2;
      segments.forEach((seg) => {
        const angle = (seg.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, start, start + angle);
        ctx.arc(cx, cy, radius - thickness, start + angle, start, true);
        ctx.closePath();
        ctx.fillStyle = seg.color;
        ctx.fill();
        start += angle;
      });
      if (opts.centerLabel) {
        ctx.fillStyle = opts.centerColor || "#F8FAFC";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "700 18px Inter, sans-serif";
        ctx.fillText(opts.centerLabel, cx, cy - (opts.centerSub ? 8 : 0));
        if (opts.centerSub) {
          ctx.fillStyle = "#94A3B8";
          ctx.font = "500 11px Inter, sans-serif";
          ctx.fillText(opts.centerSub, cx, cy + 12);
        }
      }
    };
    if (canvas._finoraCleanup) canvas._finoraCleanup();
    registry = registry.filter((r) => r.canvas !== canvas);
    render();
    registry.push({ canvas, render });
    bindResize();
  }

  return { line, sparkline, donut };
})();
