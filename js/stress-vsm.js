/*
 * Vectorized stress majorization demo (Wang et al. 2017) for section 3b.
 * Didactic CPU majorization on a small wiki-Vote subgraph — not GPU/CG.
 */
(function () {
  "use strict";

  var DIST_SCALE = 36;
  var CLUSTER_MIN_SEP = 58;
  var CLUSTER_LAMBDA = 0.35;
  var CONVERGE_EPS = 0.08;
  var CLUSTER_CONVERGE_EPS = 0.15;
  var MAX_STEPS = 20;
  var CLUSTER_MAX_STEPS = 40;
  var SPARK_MAX = 24;
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initVsmDemo(root) {
    if (!root || root.dataset.vsmInit === "true") return;
    root.dataset.vsmInit = "true";

    var src = root.dataset.src || "graph_medium/stress/vsm_demo.json";
    var svg = root.querySelector("svg");
    var stressEl = root.querySelector("[data-vsm-stress]");
    var stressBar = root.querySelector("[data-vsm-stress-bar] span");
    var sparkSvg = root.querySelector("[data-vsm-sparkline]");
    var stepBtn = root.querySelector("[data-vsm-step]");
    var convergeBtn = root.querySelector("[data-vsm-converge]");
    var resetBtn = root.querySelector("[data-vsm-reset]");
    var clusterToggle = root.querySelector("[data-vsm-cluster]");
    var statusEl = root.querySelector("[data-vsm-status]");
    if (!svg) return;

    var graphData = null;
    var nodes = [];
    var links = [];
    var weights = [];
    var pinned = [];
    var initialPos = [];
    var stressHistory = [];
    var clusterSep = false;
    var running = false;

    function euclid(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function computeStress() {
      var s = 0;
      weights.forEach(function (w) {
        var a = nodes[w.i];
        var b = nodes[w.j];
        var dist = euclid(a, b);
        var target = w.d * DIST_SCALE;
        s += w.w * Math.pow(dist - target, 2);
      });
      if (clusterSep) {
        for (var i = 0; i < nodes.length; i++) {
          for (var j = i + 1; j < nodes.length; j++) {
            if (nodes[i].group === nodes[j].group) continue;
            var dist = euclid(nodes[i], nodes[j]);
            if (dist < CLUSTER_MIN_SEP) {
              s += CLUSTER_LAMBDA * Math.pow(CLUSTER_MIN_SEP - dist, 2);
            }
          }
        }
      }
      return s;
    }

    function clampNode(idx) {
      nodes[idx].x = Math.max(24, Math.min(296, nodes[idx].x));
      nodes[idx].y = Math.max(24, Math.min(176, nodes[idx].y));
    }

    function enforceClusterSep(iterations) {
      if (!clusterSep) return;
      var passes = iterations || 6;
      for (var pass = 0; pass < passes; pass++) {
        for (var i = 0; i < nodes.length; i++) {
          for (var j = i + 1; j < nodes.length; j++) {
            if (nodes[i].group === nodes[j].group) continue;
            var dx = nodes[j].x - nodes[i].x;
            var dy = nodes[j].y - nodes[i].y;
            var dist = Math.hypot(dx, dy) || 0.001;
            if (dist >= CLUSTER_MIN_SEP) continue;
            var push = (CLUSTER_MIN_SEP - dist) / 2;
            var ux = dx / dist;
            var uy = dy / dist;
            if (!pinned[i]) {
              nodes[i].x -= push * ux;
              nodes[i].y -= push * uy;
              clampNode(i);
            }
            if (!pinned[j]) {
              nodes[j].x += push * ux;
              nodes[j].y += push * uy;
              clampNode(j);
            }
          }
        }
      }
    }

    function majorizeStep() {
      var n = nodes.length;
      var next = nodes.map(function (p) { return { x: p.x, y: p.y }; });

      for (var i = 0; i < n; i++) {
        if (pinned[i]) continue;
        var sumW = 0;
        var sumX = 0;
        var sumY = 0;

        weights.forEach(function (w) {
          var j = w.i === i ? w.j : w.j === i ? w.i : -1;
          if (j < 0) return;
          var wgt = w.w;
          var target = w.d * DIST_SCALE;
          var dx = nodes[i].x - nodes[j].x;
          var dy = nodes[i].y - nodes[j].y;
          var dist = Math.hypot(dx, dy) || 0.001;
          var coeff = wgt * (target / dist);
          sumW += wgt;
          sumX += wgt * nodes[j].x + coeff * dx;
          sumY += wgt * nodes[j].y + coeff * dy;
        });

        if (sumW > 0) {
          next[i].x = sumX / sumW;
          next[i].y = sumY / sumW;
        }
        next[i].x = Math.max(24, Math.min(296, next[i].x));
        next[i].y = Math.max(24, Math.min(176, next[i].y));
      }

      nodes.forEach(function (p, idx) {
        if (!pinned[idx]) {
          p.x = next[idx].x;
          p.y = next[idx].y;
        }
      });

      enforceClusterSep(4);
    }

    function updateMetrics() {
      var stress = computeStress();
      stressHistory.push(stress);
      if (stressHistory.length > SPARK_MAX) stressHistory.shift();

      if (stressEl) stressEl.textContent = stress.toFixed(2);
      if (stressBar) {
        var maxS = Math.max(12, stressHistory[0] || stress);
        stressBar.style.width = Math.min(100, (stress / maxS) * 100) + "%";
      }
      renderSparkline();
      return stress;
    }

    function renderSparkline() {
      if (!sparkSvg || stressHistory.length < 2) return;
      while (sparkSvg.firstChild) sparkSvg.removeChild(sparkSvg.firstChild);
      var w = 120;
      var h = 28;
      var maxS = Math.max.apply(null, stressHistory);
      var minS = Math.min.apply(null, stressHistory);
      var range = maxS - minS || 1;
      var pts = stressHistory.map(function (s, i) {
        var x = (i / (stressHistory.length - 1)) * w;
        var y = h - ((s - minS) / range) * (h - 4) - 2;
        return x.toFixed(1) + "," + y.toFixed(1);
      }).join(" ");
      var poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      poly.setAttribute("points", pts);
      poly.setAttribute("fill", "none");
      poly.setAttribute("stroke", "#2780e3");
      poly.setAttribute("stroke-width", "2");
      sparkSvg.appendChild(poly);
    }

    function render() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      links.forEach(function (l) {
        var a = nodes[l.source];
        var b = nodes[l.target];
        var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", a.x);
        line.setAttribute("y1", a.y);
        line.setAttribute("x2", b.x);
        line.setAttribute("y2", b.y);
        line.setAttribute("stroke", "#94a3b8");
        line.setAttribute("stroke-width", "1.5");
        svg.appendChild(line);
      });

      nodes.forEach(function (p, idx) {
        var c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", p.x);
        c.setAttribute("cy", p.y);
        c.setAttribute("r", pinned[idx] ? "11" : "9");
        c.setAttribute("fill", p.color || "#2780e3");
        c.setAttribute("stroke", pinned[idx] ? "#1e293b" : "#fff");
        c.setAttribute("stroke-width", pinned[idx] ? "3" : "2");
        c.style.cursor = "pointer";
        c.dataset.idx = String(idx);
        c.setAttribute("role", "button");
        c.setAttribute("aria-label", "Knoten " + p.label + (pinned[idx] ? " (fixiert)" : ""));
        svg.appendChild(c);
      });

      updateMetrics();
    }

    function randomInit() {
      nodes.forEach(function (p, idx) {
        p.x = 130 + (Math.random() - 0.5) * 100;
        p.y = 50 + Math.random() * 110;
        pinned[idx] = false;
      });
      initialPos = nodes.map(function (p) { return { x: p.x, y: p.y }; });
      stressHistory = [];
    }

    function resetAll() {
      if (initialPos.length) {
        nodes.forEach(function (p, idx) {
          p.x = initialPos[idx].x;
          p.y = initialPos[idx].y;
          pinned[idx] = false;
        });
      } else {
        randomInit();
      }
      stressHistory = [];
      if (statusEl) statusEl.textContent = "Layout zurückgesetzt.";
      render();
    }

    function doStep() {
      var before = computeStress();
      majorizeStep();
      var after = updateMetrics();
      render();
      if (statusEl) {
        statusEl.textContent = "Schritt ausgeführt · Stress " + before.toFixed(2) + " → " + after.toFixed(2);
      }
      return { before: before, after: after };
    }

    function runToConvergence() {
      if (running) return;
      running = true;
      var prev = computeStress();
      var steps = 0;
      var maxSteps = clusterSep ? CLUSTER_MAX_STEPS : MAX_STEPS;
      var eps = clusterSep ? CLUSTER_CONVERGE_EPS : CONVERGE_EPS;

      function loop() {
        doStep();
        steps++;
        var cur = computeStress();
        if (steps >= maxSteps || Math.abs(prev - cur) < eps) {
          running = false;
          if (statusEl) {
            statusEl.textContent = steps >= maxSteps
              ? "Abgebrochen nach " + maxSteps + " Schritten."
              : "Konvergiert nach " + steps + " Schritten.";
          }
          return;
        }
        prev = cur;
        if (reducedMotion) {
          loop();
        } else {
          requestAnimationFrame(loop);
        }
      }
      loop();
    }

    function pointerIdx(e) {
      var rect = svg.getBoundingClientRect();
      var x = (e.clientX - rect.left) * (320 / rect.width);
      var y = (e.clientY - rect.top) * (200 / rect.height);
      for (var i = nodes.length - 1; i >= 0; i--) {
        if (Math.hypot(nodes[i].x - x, nodes[i].y - y) < 14) return i;
      }
      return -1;
    }

    svg.addEventListener("click", function (e) {
      var idx = pointerIdx(e);
      if (idx < 0) return;
      pinned[idx] = !pinned[idx];
      if (statusEl) {
        statusEl.textContent = pinned[idx]
          ? "Knoten " + nodes[idx].label + " fixiert."
          : "Fixierung von Knoten " + nodes[idx].label + " aufgehoben.";
      }
      render();
    });

    if (stepBtn) stepBtn.addEventListener("click", doStep);
    if (convergeBtn) convergeBtn.addEventListener("click", runToConvergence);
    if (resetBtn) resetBtn.addEventListener("click", resetAll);
    if (clusterToggle) {
      clusterToggle.addEventListener("change", function () {
        clusterSep = clusterToggle.checked;
        if (clusterSep) {
          enforceClusterSep(10);
        }
        stressHistory = [];
        updateMetrics();
        render();
        if (statusEl) {
          statusEl.textContent = clusterSep
            ? "Cluster-Trennung aktiv — Stress enthält Abstands-Constraint."
            : "Cluster-Trennung aus.";
        }
      });
    }

    fetch(src)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        graphData = data;
        weights = data.weights || [];
        links = data.links || [];
        nodes = data.nodes.map(function (n) {
          return {
            id: n.id,
            label: n.label,
            group: n.group,
            color: n.color,
            x: 0,
            y: 0
          };
        });
        pinned = nodes.map(function () { return false; });
        randomInit();
        root.classList.add("is-loaded");
        render();
        if (statusEl) statusEl.textContent = nodes.length + " Knoten · Klick = fixieren";
      })
      .catch(function (err) {
        if (statusEl) statusEl.textContent = "Fehler beim Laden: " + err.message;
      });
  }

  function boot() {
    document.querySelectorAll("#wang-vsm-demo").forEach(initVsmDemo);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
