/*
 * Section 5 GNN message-passing playground: dual view, pseudo-code, k-hop, hover.
 */
(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var NS = "http://www.w3.org/2000/svg";

  var PRESETS = {
    star: {
      nodes: {
        A: { x: 200, y: 125, val: 2, dims: [2, 1, 0] },
        B: { x: 80, y: 50, val: 5, dims: [5, 2, 1] },
        C: { x: 80, y: 200, val: 3, dims: [3, 1, 2] },
        D: { x: 320, y: 125, val: 7, dims: [7, 3, 1] }
      },
      edges: [["B", "A"], ["C", "A"], ["D", "A"]],
      focus: "A",
      labels: ["A", "B", "C", "D"]
    },
    path: {
      nodes: {
        N0: { x: 40, y: 125, val: 1, dims: [1, 0, 0] },
        N1: { x: 100, y: 125, val: 2, dims: [2, 1, 0] },
        N2: { x: 160, y: 125, val: 3, dims: [3, 2, 1] },
        N3: { x: 220, y: 125, val: 4, dims: [4, 3, 2] },
        N4: { x: 280, y: 125, val: 5, dims: [5, 4, 3] },
        N5: { x: 340, y: 125, val: 6, dims: [6, 5, 4] }
      },
      edges: [["N0", "N1"], ["N1", "N2"], ["N2", "N3"], ["N3", "N4"], ["N4", "N5"]],
      focus: "N2",
      labels: ["N0", "N1", "N2", "N3", "N4", "N5"]
    }
  };

  function initGnnPlayground(root) {
    if (!root || root.dataset.gnnInit === "true") return;
    root.dataset.gnnInit = "true";

    var svg = root.querySelector("#gnn-svg");
    var status = root.querySelector("#gnn-status");
    var stepBtn = root.querySelector("#gnn-step-btn");
    var resetBtn = root.querySelector("#gnn-reset-btn");
    var autoplayBtn = root.querySelector("#gnn-autoplay-btn");
    var featureList = root.querySelector("#gnn-feature-list");
    var adjPanel = root.querySelector("[data-gnn-adj]");
    var pseudoEl = root.querySelector(".gnn-pseudocode");
    var exploreBtn = root.querySelector("[data-gnn-explore]");
    var presetTabs = root.querySelectorAll(".gnn-preset-tab");
    var layerTabs = root.querySelectorAll(".gnn-layer-tab");
    if (!svg || !status) return;

    var presetKey = "star";
    var nodes = {};
    var initialVals = {};
    var edges = [];
    var focusId = "A";
    var labels = [];
    var step = 0;
    var messages = [];
    var autoplayTimer = null;
    var isAnimating = false;
    var currentLayer = 0;
    var exploreMode = false;
    var maxVal = 25;

    function loadPreset(key) {
      var p = PRESETS[key];
      presetKey = key;
      nodes = {};
      initialVals = {};
      labels = p.labels.slice();
      focusId = p.focus;
      p.labels.forEach(function (k) {
        nodes[k] = Object.assign({}, p.nodes[k], { el: null, textEl: null, barEl: null });
        initialVals[k] = p.nodes[k].val;
      });
      edges = p.edges.map(function (e) { return e.slice(); });
    }

    function setPhaseTag(text) {
      return '<span class="phase-tag">' + text + "</span>";
    }

    function getNeighbors(id, hops) {
      var set = {};
      set[id] = 0;
      var frontier = [id];
      for (var h = 0; h < hops; h++) {
        var next = [];
        frontier.forEach(function (nid) {
          edges.forEach(function (e) {
            [e[0], e[1]].forEach(function (end, i) {
              if (end === nid) {
                var other = e[1 - i];
                if (set[other] === undefined) {
                  set[other] = h + 1;
                  next.push(other);
                }
              }
            });
          });
        });
        frontier = next;
      }
      return set;
    }

    function updatePseudo(s) {
      if (!pseudoEl) return;
      pseudoEl.querySelectorAll(".pseudo-line").forEach(function (line) {
        line.classList.toggle("is-active", +line.dataset.step === s);
      });
    }

    function renderAdj(highlightIds) {
      if (!adjPanel) return;
      var n = labels.length;
      adjPanel.style.gridTemplateColumns = "repeat(" + n + ", 1.1rem)";
      adjPanel.innerHTML = "";
      labels.forEach(function (rowId, ri) {
        labels.forEach(function (colId, ci) {
          var connected = edges.some(function (e) {
            return (e[0] === rowId && e[1] === colId) || (e[1] === rowId && e[0] === colId);
          });
          var cell = document.createElement("div");
          cell.className = "adj-matrix-cell";
          if (connected) cell.classList.add("is-edge");
          if (rowId === focusId || colId === focusId) cell.classList.add("is-focus-row");
          if (highlightIds && highlightIds[rowId] !== undefined) cell.classList.add("is-hop");
          if (ri === ci) cell.textContent = rowId.replace("N", "");
          adjPanel.appendChild(cell);
        });
      });
    }

    function updateFeatures() {
      if (!featureList) return;
      featureList.innerHTML = "";
      labels.forEach(function (k) {
        var n = nodes[k];
        var li = document.createElement("li");
        if (k === focusId && step > 0) li.classList.add("is-focus");
        var bars = (n.dims || [n.val]).map(function (d) {
          return '<div class="gnn-feature-bar" style="width:' + Math.min(100, (d / maxVal) * 100) + '%"></div>';
        }).join("");
        li.innerHTML =
          '<span class="gnn-node-label">' + k + '</span>' +
          '<div class="gnn-feature-bar-wrap gnn-feature-multi">' + bars + '</div>' +
          "<span>" + n.val + "</span>";
        featureList.appendChild(li);
      });
    }

    function highlightMath(terms) {
      document.querySelectorAll(".gnn-math-term").forEach(function (el) {
        el.classList.toggle("math-active", terms.indexOf(el.dataset.term) >= 0);
      });
    }

    function drawGraph(highlightIds, hoverId) {
      svg.innerHTML = "";
      var hopSet = highlightIds || getNeighbors(focusId, currentLayer);
      edges.forEach(function (e) {
        var line = document.createElementNS(NS, "line");
        line.setAttribute("x1", nodes[e[0]].x);
        line.setAttribute("y1", nodes[e[0]].y);
        line.setAttribute("x2", nodes[e[1]].x);
        line.setAttribute("y2", nodes[e[1]].y);
        var inHop = hopSet[e[0]] !== undefined && hopSet[e[1]] !== undefined;
        line.setAttribute("stroke", inHop ? "#2ca02c" : "#cbd5e1");
        line.setAttribute("stroke-width", inHop ? "2.5" : "2");
        svg.appendChild(line);
      });
      labels.forEach(function (k) {
        var n = nodes[k];
        var inHop = hopSet[k] !== undefined;
        var isFocus = k === focusId;
        var isHover = hoverId === k;
        var g = document.createElementNS(NS, "g");
        g.style.cursor = exploreMode ? "pointer" : "default";
        var circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", n.x);
        circle.setAttribute("cy", n.y);
        circle.setAttribute("r", isFocus ? "22" : isHover ? "24" : "18");
        circle.setAttribute("fill", isFocus ? "#ff7f0e" : inHop ? "#2ca02c" : "#2780e3");
        circle.setAttribute("stroke", isHover ? "#ff7f0e" : "#fff");
        circle.setAttribute("stroke-width", isHover ? "3" : "2");
        if (inHop && !isFocus && currentLayer > 0) {
          var ring = document.createElementNS(NS, "circle");
          ring.setAttribute("cx", n.x);
          ring.setAttribute("cy", n.y);
          ring.setAttribute("r", "26");
          ring.setAttribute("fill", "none");
          ring.setAttribute("stroke", "rgba(44,160,44,0.35)");
          ring.setAttribute("stroke-width", "2");
          ring.setAttribute("class", "gnn-hop-ring");
          g.appendChild(ring);
        }
        var text = document.createElementNS(NS, "text");
        text.setAttribute("x", n.x);
        text.setAttribute("y", n.y + 5);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", "#fff");
        text.setAttribute("font-family", "sans-serif");
        text.setAttribute("font-weight", "bold");
        text.setAttribute("font-size", presetKey === "path" ? "9" : "11");
        text.textContent = n.val;
        g.appendChild(circle);
        g.appendChild(text);
        g.dataset.nodeId = k;
        svg.appendChild(g);
        n.el = circle;
        n.textEl = text;
      });
      renderAdj(hopSet);
    }

    function init() {
      stopAutoplay();
      isAnimating = false;
      step = 0;
      messages = [];
      loadPreset(presetKey);
      labels.forEach(function (k) { nodes[k].val = initialVals[k]; });
      focusId = PRESETS[presetKey].focus;
      status.innerHTML = setPhaseTag("Init") +
        "Schritt 0: Feature-Vektoren pro Knoten — Fokus <strong>" + focusId +
        "</strong> (Layer " + currentLayer + ", " + currentLayer + "-Hop-Nachbarschaft).";
      stepBtn.disabled = false;
      if (autoplayBtn) autoplayBtn.disabled = false;
      highlightMath(["hv"]);
      updatePseudo(0);
      updateFeatures();
      drawGraph();
    }

    function animateMessage(src, target, done) {
      var msg = document.createElementNS(NS, "circle");
      msg.setAttribute("cx", nodes[src].x);
      msg.setAttribute("cy", nodes[src].y);
      msg.setAttribute("r", "8");
      msg.setAttribute("fill", "#2ca02c");
      svg.appendChild(msg);
      messages.push(msg);
      if (adjPanel) {
        var cells = adjPanel.querySelectorAll(".is-edge.is-focus-row");
        cells.forEach(function (c) { c.classList.add("is-pulse"); });
        setTimeout(function () {
          cells.forEach(function (c) { c.classList.remove("is-pulse"); });
        }, reducedMotion ? 0 : 800);
      }
      if (reducedMotion) {
        msg.setAttribute("cx", nodes[target].x);
        msg.setAttribute("cy", nodes[target].y);
        if (done) done();
        return;
      }
      var dur = 900, start = performance.now();
      function frame(now) {
        var t = Math.min(1, (now - start) / dur);
        var ease = t * (2 - t);
        msg.setAttribute("cx", nodes[src].x + (nodes[target].x - nodes[src].x) * ease);
        msg.setAttribute("cy", nodes[src].y + (nodes[target].y - nodes[src].y) * ease);
        if (t < 1) requestAnimationFrame(frame);
        else if (done) done();
      }
      requestAnimationFrame(frame);
    }

    function neighborEdgesToFocus() {
      return edges.filter(function (e) { return e[0] === focusId || e[1] === focusId; });
    }

    function doStep() {
      if (isAnimating || step >= 2) return;
      var nbrEdges = neighborEdgesToFocus().map(function (e) {
        return e[0] === focusId ? [e[1], focusId] : [e[0], focusId];
      });
      if (step === 0) {
        status.innerHTML = setPhaseTag("Aggregate") +
          "<b>Aggregation:</b> " + focusId + " sammelt Nachrichten aus " + currentLayer + "-Hop-Nachbarschaft.";
        highlightMath(["aggregate", "hv"]);
        updatePseudo(1);
        stepBtn.disabled = true;
        if (autoplayBtn) autoplayBtn.disabled = true;
        isAnimating = true;
        var pending = nbrEdges.length || 1;
        if (!nbrEdges.length) {
          step = 1; isAnimating = false; stepBtn.disabled = false;
          return;
        }
        nbrEdges.forEach(function (pair) {
          animateMessage(pair[0], pair[1], function () {
            pending--;
            if (pending === 0) {
              step = 1;
              isAnimating = false;
              stepBtn.disabled = false;
              if (autoplayBtn) autoplayBtn.disabled = false;
            }
          });
        });
      } else if (step === 1) {
        messages.forEach(function (m) { m.remove(); });
        messages = [];
        var sum = 0;
        nbrEdges.forEach(function (pair) { sum += nodes[pair[0]].val; });
        status.innerHTML = setPhaseTag("Update") +
          "<b>Update:</b> " + focusId + " ← Summe(" + sum + ") + eigener Wert — wie $W \\cdot x + b$ im CNN.";
        highlightMath(["update", "sigma"]);
        updatePseudo(2);
        nodes[focusId].val += sum;
        nodes[focusId].textEl.textContent = nodes[focusId].val;
        if (!reducedMotion && nodes[focusId].el) {
          nodes[focusId].el.setAttribute("r", "28");
          setTimeout(function () { nodes[focusId].el.setAttribute("r", "22"); }, 350);
        }
        updateFeatures();
        drawGraph();
        step = 2;
        stepBtn.disabled = true;
      }
    }

    function stopAutoplay() {
      if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; }
      if (autoplayBtn) autoplayBtn.textContent = "Auto-Play";
    }

    function toggleAutoplay() {
      if (autoplayTimer) { stopAutoplay(); return; }
      if (autoplayBtn) autoplayBtn.textContent = "Pause";
      autoplayTimer = setInterval(function () {
        if (step >= 2 || isAnimating) {
          if (step >= 2) stopAutoplay();
          return;
        }
        doStep();
      }, reducedMotion ? 800 : 1800);
    }

    svg.addEventListener("mousemove", function (e) {
      if (!exploreMode) return;
      var t = e.target.closest("[data-node-id]");
      var hoverId = t ? t.dataset.nodeId : null;
      if (hoverId) {
        focusId = hoverId;
        var hop = getNeighbors(hoverId, currentLayer);
        status.innerHTML = setPhaseTag("Erkunden") +
          "Hover: <strong>" + hoverId + "</strong> — " + Object.keys(hop).length +
          " Knoten im " + currentLayer + "-Hop-Feld.";
        drawGraph(hop, hoverId);
        updateFeatures();
      }
    });

    stepBtn.addEventListener("click", doStep);
    resetBtn.addEventListener("click", init);
    if (autoplayBtn) autoplayBtn.addEventListener("click", toggleAutoplay);

    if (exploreBtn) {
      exploreBtn.addEventListener("click", function () {
        exploreMode = !exploreMode;
        exploreBtn.classList.toggle("is-active", exploreMode);
        exploreBtn.textContent = exploreMode ? "Erkunden aus" : "Erkunden";
        if (!exploreMode) init();
      });
    }

    layerTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        layerTabs.forEach(function (t) { t.classList.remove("is-active"); });
        tab.classList.add("is-active");
        currentLayer = +tab.dataset.layer;
        init();
      });
    });

    presetTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        presetTabs.forEach(function (t) { t.classList.remove("is-active"); });
        tab.classList.add("is-active");
        presetKey = tab.dataset.preset;
        currentLayer = 0;
        layerTabs.forEach(function (t, i) {
          t.classList.toggle("is-active", i === 0);
        });
        init();
      });
    });

    loadPreset("star");
    init();
  }

  function initAll() {
    document.querySelectorAll(".gnn-playground").forEach(initGnnPlayground);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
