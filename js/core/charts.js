/* =====================================================================
   Finora — FinoraChart (Chart.js wrapper)
   Line, candlestick, sparkline, and doughnut charts for the app.
   Requires Chart.js and chartjs-adapter-date-fns (market candlesticks).
   ===================================================================== */

const FinoraChart = (() => {
  const instances = new Map();

  function barTimestamp(dateStr) {
    if (!dateStr) return dateStr;
    if (typeof dateStr === "number") return dateStr;
    return new Date(String(dateStr) + "T12:00:00").getTime();
  }

  function normalizeOhlc(ohlc) {
    return (ohlc || []).map(function (bar) {
      return {
        date: bar.date,
        x: barTimestamp(bar.date),
        open: Number(bar.open),
        high: Number(bar.high),
        low: Number(bar.low),
        close: Number(bar.close),
      };
    }).filter(function (bar) {
      return Number.isFinite(bar.close) && Number.isFinite(bar.open)
        && Number.isFinite(bar.high) && Number.isFinite(bar.low);
    });
  }

  /* Draw OHLC candles plus a vertical hover crosshair. */
  const candlestickPlugin = {
    id: "finoraCandlestick",
    afterEvent: function (chart, args) {
      if (!chart.$finoraOhlc || !chart.$finoraOhlc.length) return;
      var event = args.event;
      if (event.type !== "mousemove" && event.type !== "mouseout") return;

      var next = null;
      if (event.type === "mousemove") {
        var active = chart.getActiveElements();
        next = active.length ? active[0].index : null;
      }

      if (chart.$finoraHoverIndex !== next) {
        chart.$finoraHoverIndex = next;
        chart.draw();
      }
    },
    afterDatasetsDraw: function (chart, _args, options) {
      var ohlc = options.ohlc || chart.$finoraOhlc;
      if (!ohlc || !ohlc.length) return;

      var bull = options.bull || (chart.$finoraColors && chart.$finoraColors.bull) || "#22C55E";
      var bear = options.bear || (chart.$finoraColors && chart.$finoraColors.bear) || "#EF4444";
      var ctx = chart.ctx;
      var xScale = chart.scales.x;
      var yScale = chart.scales.y;
      var area = chart.chartArea;
      if (!xScale || !yScale || !area) return;

      var step = 12;
      if (ohlc.length > 1) {
        var x0 = xScale.getPixelForValue(ohlc[0].x);
        var x1 = xScale.getPixelForValue(ohlc[1].x);
        step = Math.abs(x1 - x0) || step;
      } else {
        step = area.width / Math.max(ohlc.length, 1);
      }
      var bodyW = Math.max(5, step * 0.65);

      ctx.save();
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
      ctx.clip();

      ohlc.forEach(function (bar) {
        var x = xScale.getPixelForValue(bar.x);
        if (!Number.isFinite(x) || x < area.left - bodyW || x > area.right + bodyW) return;

        var yOpen = yScale.getPixelForValue(bar.open);
        var yClose = yScale.getPixelForValue(bar.close);
        var yHigh = yScale.getPixelForValue(bar.high);
        var yLow = yScale.getPixelForValue(bar.low);
        if (!Number.isFinite(yHigh) || !Number.isFinite(yLow)) return;

        var up = bar.close >= bar.open;
        var color = up ? bull : bear;

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.moveTo(x, yHigh);
        ctx.lineTo(x, yLow);
        ctx.stroke();

        var top = Math.min(yOpen, yClose);
        var height = Math.max(2, Math.abs(yClose - yOpen));
        ctx.fillRect(x - bodyW / 2, top, bodyW, height);
      });

      if (chart.$finoraHoverIndex != null && ohlc[chart.$finoraHoverIndex]) {
        var hoverBar = ohlc[chart.$finoraHoverIndex];
        var hoverX = xScale.getPixelForValue(hoverBar.x);
        if (Number.isFinite(hoverX)) {
          ctx.strokeStyle = "rgba(148, 163, 184, 0.55)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(hoverX, area.top);
          ctx.lineTo(hoverX, area.bottom);
          ctx.stroke();
        }
      }

      ctx.restore();
    },
  };

  if (typeof Chart !== "undefined") {
    Chart.register(candlestickPlugin);
  }

  function destroy(canvas) {
    if (!canvas) return;
    const chart = instances.get(canvas);
    if (chart) {
      chart.destroy();
      instances.delete(canvas);
    }
    if (canvas._finoraCleanup) {
      canvas._finoraCleanup();
      canvas._finoraCleanup = null;
    }
  }

  function rgba(hex, alpha) {
    var h = (hex || "").trim().replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(h, 16);
    if (Number.isNaN(n)) return hex;
    var r = (n >> 16) & 255;
    var g = (n >> 8) & 255;
    var b = n & 255;
    return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
  }

  function gridColor() {
    return "rgba(34, 49, 79, 0.7)";
  }

  function tickColor() {
    return "#64748B";
  }

  function buildScales(showAxis, formatY) {
    if (!showAxis) {
      return {
        x: { display: false },
        y: { display: false },
      };
    }
    return {
      x: {
        grid: { color: gridColor() },
        ticks: { color: tickColor(), maxTicksLimit: 6, maxRotation: 0 },
      },
      y: {
        grid: { color: gridColor() },
        ticks: {
          color: tickColor(),
          callback: function (value) {
            return formatY ? formatY(value) : String(value);
          },
        },
      },
    };
  }

  function baseOptions(showAxis, formatY, tooltipFn) {
    var options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1e293b",
          titleColor: "#f8fafc",
          bodyColor: "#94a3b8",
          borderColor: gridColor(),
          borderWidth: 1,
          padding: 10,
        },
      },
      scales: buildScales(showAxis, formatY),
    };

    if (typeof tooltipFn === "function") {
      options.plugins.tooltip.callbacks = {
        label: function (ctx) {
          return tooltipFn(ctx.parsed.y != null ? ctx.parsed.y : ctx.raw, ctx.dataIndex);
        },
      };
    }

    return options;
  }

  function store(canvas, chart) {
    destroy(canvas);
    instances.set(canvas, chart);
    return chart;
  }

  function line(canvas, data, opts) {
    if (!canvas || !data || !data.length || typeof Chart === "undefined") return;
    opts = opts || {};
    var color = opts.color || "#38BDF8";
    var showAxis = !!opts.axis;
    var labels = data.map(function (_, i) { return i + 1; });
    var ctx = canvas.getContext("2d");

    var chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          data: data,
          borderColor: color,
          backgroundColor: function (context) {
            var chartArea = context.chart.chartArea;
            if (!chartArea) return rgba(color, opts.fillAlpha != null ? opts.fillAlpha : 0.25);
            var g = context.chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, rgba(color, opts.fillAlpha != null ? opts.fillAlpha : 0.25));
            g.addColorStop(1, rgba(color, 0));
            return g;
          },
          fill: true,
          tension: 0.35,
          borderWidth: opts.lineWidth != null ? opts.lineWidth : 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: "#0B1220",
          pointHoverBorderWidth: 2,
        }],
      },
      options: baseOptions(showAxis, opts.formatY, opts.tooltip),
    });

    return store(canvas, chart);
  }

  function sparkline(canvas, data, color, opts) {
    opts = opts || {};
    return line(canvas, data, {
      color: color,
      axis: false,
      lineWidth: opts.lineWidth || 1.8,
      fillAlpha: opts.fillAlpha != null ? opts.fillAlpha : 0.28,
      responsive: opts.responsive !== false,
    });
  }

  function priceBounds(ohlc) {
    var min = Infinity;
    var max = -Infinity;
    ohlc.forEach(function (bar) {
      if (bar.low < min) min = bar.low;
      if (bar.high > max) max = bar.high;
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    var pad = (max - min) * 0.06 || max * 0.01 || 1;
    return { min: min - pad, max: max + pad };
  }

  function stockChart(canvas, payload, opts) {
    if (!canvas || typeof Chart === "undefined") return;
    opts = opts || {};
    payload = payload || {};

    var mode = payload.mode === "candle" ? "candle" : "line";
    var ohlc = normalizeOhlc(payload.ohlc || []);
    var closes = payload.closes || ohlc.map(function (b) { return b.close; });
    var bull = opts.bull || "#22C55E";
    var bear = opts.bear || "#EF4444";
    var ctx = canvas.getContext("2d");
    var bounds = priceBounds(ohlc);

    if (mode === "candle" && ohlc.length) {
      var candleOptions = baseOptions(true, opts.formatY);
      candleOptions.parsing = false;
      candleOptions.scales.x.type = "time";
      candleOptions.scales.x.time = {
        unit: "day",
        displayFormats: { day: "MMM d" },
      };
      if (bounds) {
        candleOptions.scales.y.min = bounds.min;
        candleOptions.scales.y.max = bounds.max;
      }
      candleOptions.plugins.finoraCandlestick = {
        ohlc: ohlc,
        bull: bull,
        bear: bear,
      };
      candleOptions.plugins.tooltip.callbacks = {
        title: function (items) {
          if (!items.length) return "";
          var bar = ohlc[items[0].dataIndex];
          return bar ? bar.date : "";
        },
        label: function (ctx) {
          var bar = ohlc[ctx.dataIndex];
          if (!bar) return "";
          var fmt = opts.formatTooltip || String;
          return [
            "Open: " + fmt(bar.open),
            "High: " + fmt(bar.high),
            "Low: " + fmt(bar.low),
            "Close: " + fmt(bar.close),
          ];
        },
      };

      var chart = new Chart(ctx, {
        type: "line",
        data: {
          datasets: [{
            label: "Price",
            data: ohlc.map(function (bar) {
              return { x: bar.x, y: bar.close };
            }),
            borderColor: "rgba(0,0,0,0)",
            backgroundColor: "rgba(0,0,0,0)",
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHitRadius: 12,
            borderWidth: 0,
          }],
        },
        options: candleOptions,
      });

      chart.$finoraOhlc = ohlc;
      chart.$finoraColors = { bull: bull, bear: bear };
      chart.$finoraHoverIndex = null;
      chart.update("none");

      return store(canvas, chart);
    }

    var up = closes.length > 1 ? closes[closes.length - 1] >= closes[0] : true;
    var lineColor = up ? bull : bear;
    var lineOptions = baseOptions(true, opts.formatY, opts.formatTooltip);
    lineOptions.parsing = false;
    if (ohlc.length) {
      lineOptions.scales.x.type = "time";
      lineOptions.scales.x.time = {
        unit: "day",
        displayFormats: { day: "MMM d" },
      };
      if (bounds) {
        lineOptions.scales.y.min = bounds.min;
        lineOptions.scales.y.max = bounds.max;
      }
    }

    var lineChart = new Chart(ctx, {
      type: "line",
      data: {
        datasets: [{
          data: ohlc.length
            ? ohlc.map(function (b) { return { x: b.x, y: b.close }; })
            : closes.map(function (v, i) { return { x: i + 1, y: v }; }),
          borderColor: lineColor,
          backgroundColor: rgba(lineColor, 0.2),
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: lineColor,
          pointHoverBorderColor: "#0B1220",
          pointHoverBorderWidth: 2,
        }],
      },
      options: lineOptions,
    });

    return store(canvas, lineChart);
  }

  function donut(canvas, segments, opts) {
    if (!canvas || !segments || !segments.length || typeof Chart === "undefined") return;
    opts = opts || {};
    var total = segments.reduce(function (sum, s) { return sum + s.value; }, 0) || 1;

    var chart = new Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: segments.map(function (s) { return s.label; }),
        datasets: [{
          data: segments.map(function (s) { return s.value; }),
          backgroundColor: segments.map(function (s) { return s.color; }),
          borderWidth: 0,
          hoverOffset: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: opts.thickness ? String(Math.round(opts.thickness * 100)) + "%" : "62%",
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#1e293b",
            callbacks: {
              label: function (ctx) {
                var pct = ((ctx.parsed / total) * 100).toFixed(1);
                return ctx.label + ": " + pct + "%";
              },
            },
          },
        },
      },
      plugins: opts.centerLabel ? [{
        id: "finoraDonutCenter",
        beforeDraw: function (chart) {
          var meta = chart.getDatasetMeta(0);
          if (!meta || !meta.data.length) return;
          var arc = meta.data[0];
          var cx = arc.x;
          var cy = arc.y;
          var cctx = chart.ctx;
          cctx.save();
          cctx.textAlign = "center";
          cctx.textBaseline = "middle";
          cctx.fillStyle = opts.centerColor || "#F8FAFC";
          cctx.font = "700 18px Inter, sans-serif";
          cctx.fillText(opts.centerLabel, cx, cy - (opts.centerSub ? 8 : 0));
          if (opts.centerSub) {
            cctx.fillStyle = "#94A3B8";
            cctx.font = "500 11px Inter, sans-serif";
            cctx.fillText(opts.centerSub, cx, cy + 12);
          }
          cctx.restore();
        },
      }] : [],
    });

    return store(canvas, chart);
  }

  return { line, sparkline, stockChart, donut, destroy };
})();
