/*
 * Section 5 GNN section widgets: grid-as-graph, topology, perm invariance,
 * embedding projection, CNN↔GNN film, sticky nav.
 */
(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var NS = "http://www.w3.org/2000/svg";

  function initGridAsGraph(root) {
    if (!root || root.dataset.gridInit === "true") return;
    root.dataset.gridInit = "true";

    var size = 5;
    var pixels = [];
    var smiley = [
      0, 0, 1, 0, 0,
      0, 1, 0, 1, 0,
      1, 0, 0, 0, 1,
      0, 1, 0, 1, 0,
      0, 0, 1, 0, 0
    ];
    for (var i = 0; i < size * size; i++) pixels.push(smiley[i] || 0);

    var pixelSvg = root.querySelector(".grid-pixel-svg");
    var graphSvg = root.querySelector(".grid-graph-svg");
    var matrixSvg = root.querySelector(".grid-matrix-svg");
    var hoverLabel = root.querySelector("[data-grid-hover]");
    if (!pixelSvg || !graphSvg || !matrixSvg) return;

    function idx(r, c) { return r * size + c; }
    function neighbors(i) {
      var r = Math.floor(i / size), c = i % size, n = [];
      if (r > 0) n.push(idx(r - 1, c));
      if (r < size - 1) n.push(idx(r + 1, c));
      if (c > 0) n.push(idx(r, c - 1));
      if (c < size - 1) n.push(idx(r, c + 1));
      return n;
    }
    function hasEdge(a, b) {
      return neighbors(a).indexOf(b) >= 0;
    }

    function renderPixel(hoverIdx) {
      while (pixelSvg.firstChild) pixelSvg.removeChild(pixelSvg.firstChild);
      var cell = 22;
      for (var r = 0; r < size; r++) {
        for (var c = 0; c < size; c++) {
          var i = idx(r, c);
          var isHover = i === hoverIdx;
          var isNbr = hoverIdx >= 0 && neighbors(hoverIdx).indexOf(i) >= 0;
          var rect = document.createElementNS(NS, "rect");
          rect.setAttribute("x", c * cell + 1);
          rect.setAttribute("y", r * cell + 1);
          rect.setAttribute("width", cell - 2);
          rect.setAttribute("height", cell - 2);
          rect.setAttribute("fill", pixels[i] ? "#2780e3" : "#e2e8f0");
          if (isHover) rect.setAttribute("stroke", "#ff7f0e");
          else if (isNbr) rect.setAttribute("stroke", "#2ca02c");
          else rect.setAttribute("stroke", "#cbd5e1");
          rect.setAttribute("stroke-width", isHover || isNbr ? "2" : "1");
          rect.style.cursor = "pointer";
          rect.dataset.idx = String(i);
          pixelSvg.appendChild(rect);
        }
      }
    }

    function renderGraph(hoverIdx) {
      while (graphSvg.firstChild) graphSvg.removeChild(graphSvg.firstChild);
      var cell = 22;
      var positions = [];
      for (var r = 0; r < size; r++) {
        for (var c = 0; c < size; c++) {
          positions.push({ x: c * cell + cell / 2, y: r * cell + cell / 2, i: idx(r, c) });
        }
      }
      for (var ei = 0; ei < positions.length; ei++) {
        neighbors(positions[ei].i).forEach(function (nb) {
          if (nb > positions[ei].i) {
            var a = positions[ei], b = positions.find(function (p) { return p.i === nb; });
            var line = document.createElementNS(NS, "line");
            line.setAttribute("x1", a.x);
            line.setAttribute("y1", a.y);
            line.setAttribute("x2", b.x);
            line.setAttribute("y2", b.y);
            line.setAttribute("stroke", "#cbd5e1");
            line.setAttribute("stroke-width", "1");
            graphSvg.appendChild(line);
          }
        });
      }
      positions.forEach(function (p) {
        var isHover = p.i === hoverIdx;
        var isNbr = hoverIdx >= 0 && neighbors(hoverIdx).indexOf(p.i) >= 0;
        var c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", p.x);
        c.setAttribute("cy", p.y);
        c.setAttribute("r", isHover ? 5 : 3.5);
        c.setAttribute("fill", pixels[p.i] ? "#2780e3" : "#94a3b8");
        if (isHover) c.setAttribute("stroke", "#ff7f0e");
        else if (isNbr) c.setAttribute("stroke", "#2ca02c");
        graphSvg.appendChild(c);
      });
    }

    function renderMatrix(hoverIdx) {
      while (matrixSvg.firstChild) matrixSvg.removeChild(matrixSvg.firstChild);
      var n = size * size;
      for (var i = 0; i < n; i++) {
        for (var j = 0; j < n; j++) {
          var on = hasEdge(i, j);
          var hi = (i === hoverIdx || j === hoverIdx) && on;
          var rect = document.createElementNS(NS, "rect");
          rect.setAttribute("x", j);
          rect.setAttribute("y", i);
          rect.setAttribute("width", 0.9);
          rect.setAttribute("height", 0.9);
          rect.setAttribute("fill", on ? (hi ? "#2ca02c" : "#2780e3") : "#f1f5f9");
          matrixSvg.appendChild(rect);
        }
      }
    }

    function renderAll(hoverIdx) {
      renderPixel(hoverIdx);
      renderGraph(hoverIdx);
      renderMatrix(hoverIdx);
      if (hoverLabel) {
        hoverLabel.textContent = hoverIdx >= 0
          ? "Knoten " + hoverIdx + " · " + neighbors(hoverIdx).length + " Nachbarn (regulär)"
          : "Klicke oder fahre über ein Pixel";
      }
    }

    pixelSvg.addEventListener("click", function (e) {
      var t = e.target;
      if (t.tagName === "rect" && t.dataset.idx) {
        var i = +t.dataset.idx;
        pixels[i] = pixels[i] ? 0 : 1;
        renderAll(-1);
      }
    });
    pixelSvg.addEventListener("mousemove", function (e) {
      var t = e.target;
      if (t.tagName === "rect" && t.dataset.idx) renderAll(+t.dataset.idx);
    });
    pixelSvg.addEventListener("mouseleave", function () { renderAll(-1); });

    renderAll(-1);
  }

  function initTopologyChallenge(root) {
    if (!root || root.dataset.topoInit === "true") return;
    root.dataset.topoInit = "true";

    var svg = root.querySelector("svg");
    var heatmapEl = root.querySelector("[data-topo-heatmap]");
    if (!svg) return;

    var graphDistEl = root.querySelector("[data-topo-graph]");
    var euclidEl = root.querySelector("[data-topo-euclid]");
    var distortionEl = root.querySelector("[data-topo-distortion]");
    var barInner = root.querySelector("[data-topo-bar] span");

    var presets = {
      good: [
        { id: "u", x: 70, y: 100 },
        { id: "v", x: 150, y: 50 },
        { id: "w", x: 230, y: 100 },
        { id: "z", x: 150, y: 160 }
      ],
      bad: [
        { id: "u", x: 40, y: 170 },
        { id: "v", x: 150, y: 50 },
        { id: "w", x: 230, y: 100 },
        { id: "z", x: 260, y: 30 }
      ]
    };

    var pts = presets.good.map(function (p) { return Object.assign({}, p); });
    var edges = [["u", "v"], ["v", "w"], ["w", "z"], ["u", "w"]];
    var pathDist = { "u-v": 1, "v-w": 1, "w-z": 1, "u-w": 1, "u-z": 2, "v-z": 2 };
    var pathUZ = ["u", "w", "z"];
    var dragTarget = null;
    var ids = ["u", "v", "w", "z"];

    function graphDistance(a, b) {
      var key = a.id + "-" + b.id;
      return pathDist[key] || pathDist[b.id + "-" + a.id] || 99;
    }
    function euclid(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function pairError(i, j) {
      var a = pts.find(function (p) { return p.id === ids[i]; });
      var b = pts.find(function (p) { return p.id === ids[j]; });
      var gd = graphDistance(a, b);
      if (gd >= 99) return 0;
      var ed = euclid(a, b) / 40;
      return Math.pow(ed - gd, 2);
    }
    function distortionScore() {
      var s = 0;
      for (var i = 0; i < ids.length; i++) {
        for (var j = i + 1; j < ids.length; j++) s += pairError(i, j);
      }
      return s;
    }

    function renderHeatmap() {
      if (!heatmapEl) return;
      heatmapEl.innerHTML = "";
      for (var i = 0; i < ids.length; i++) {
        for (var j = 0; j < ids.length; j++) {
          var cell = document.createElement("div");
          cell.className = "adj-matrix-cell";
          if (i === j) {
            cell.classList.add("is-diag");
            cell.textContent = ids[i];
          } else {
            var err = pairError(i, j);
            cell.style.background = err > 0.5 ? "rgba(255,127,14," + Math.min(1, err / 3) + ")" : "#e2e8f0";
            cell.title = ids[i] + "–" + ids[j] + ": Δ²=" + err.toFixed(2);
          }
          heatmapEl.appendChild(cell);
        }
      }
    }

    function render() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      edges.forEach(function (e) {
        var onPath = pathUZ.indexOf(e[0]) >= 0 && pathUZ.indexOf(e[1]) >= 0 &&
          Math.abs(pathUZ.indexOf(e[0]) - pathUZ.indexOf(e[1])) === 1;
        var a = pts.find(function (p) { return p.id === e[0]; });
        var b = pts.find(function (p) { return p.id === e[1]; });
        var line = document.createElementNS(NS, "line");
        line.setAttribute("x1", a.x);
        line.setAttribute("y1", a.y);
        line.setAttribute("x2", b.x);
        line.setAttribute("y2", b.y);
        line.setAttribute("stroke", onPath ? "#2ca02c" : "#94a3b8");
        line.setAttribute("stroke-width", onPath ? "3" : "2");
        svg.appendChild(line);
      });
      pts.forEach(function (p) {
        var c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", p.x);
        c.setAttribute("cy", p.y);
        c.setAttribute("r", p.id === "u" || p.id === "z" ? "16" : "14");
        c.setAttribute("fill", p.id === "u" || p.id === "z" ? "#ff7f0e" : "#2780e3");
        c.setAttribute("stroke", "#fff");
        c.setAttribute("stroke-width", "2");
        c.style.cursor = "grab";
        var t = document.createElementNS(NS, "text");
        t.setAttribute("x", p.x);
        t.setAttribute("y", p.y + 4);
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("fill", "#fff");
        t.setAttribute("font-size", "11");
        t.textContent = p.id;
        svg.appendChild(c);
        svg.appendChild(t);
      });
      var u = pts.find(function (p) { return p.id === "u"; });
      var z = pts.find(function (p) { return p.id === "z"; });
      if (graphDistEl) graphDistEl.textContent = String(graphDistance(u, z));
      if (euclidEl) euclidEl.textContent = (euclid(u, z) / 40).toFixed(2);
      var score = distortionScore();
      if (distortionEl) distortionEl.textContent = score.toFixed(2);
      if (barInner) barInner.style.width = Math.min(100, (score / 6) * 100) + "%";
      renderHeatmap();
    }

    function pointerPos(e) {
      var rect = svg.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (320 / rect.width),
        y: (e.clientY - rect.top) * (200 / rect.height)
      };
    }

    svg.addEventListener("pointerdown", function (e) {
      var pos = pointerPos(e);
      dragTarget = pts.find(function (p) { return Math.hypot(p.x - pos.x, p.y - pos.y) < 20; }) || null;
      if (dragTarget) svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener("pointermove", function (e) {
      if (!dragTarget) return;
      var pos = pointerPos(e);
      dragTarget.x = Math.max(25, Math.min(295, pos.x));
      dragTarget.y = Math.max(25, Math.min(175, pos.y));
      render();
    });
    svg.addEventListener("pointerup", function () { dragTarget = null; });

    root.querySelectorAll("[data-topo-preset]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.dataset.topoPreset;
        if (!presets[key]) return;
        pts = presets[key].map(function (p) { return Object.assign({}, p); });
        render();
      });
    });

    render();
  }

  function initPermInvariance(root) {
    if (!root || root.dataset.permInit === "true") return;
    root.dataset.permInit = "true";

    var matrixEl = root.querySelector("[data-perm-matrix]");
    var sumEl = root.querySelector("[data-perm-sum]");
    var orderEl = root.querySelector("[data-perm-order]");
    if (!matrixEl) return;

    var labels = ["A", "B", "C", "D"];
    var features = { A: 2, B: 5, C: 3, D: 7 };
    var adj = [
      [0, 1, 1, 1],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
      [1, 0, 0, 0]
    ];
    var order = [0, 1, 2, 3];

    function neighborSum() {
      var iA = order.indexOf(0);
      var s = 0;
      for (var c = 0; c < 4; c++) {
        if (c === iA) continue;
        if (adj[order[iA]][order[c]]) s += features[labels[order[c]]];
      }
      return s;
    }

    function renderMatrix() {
      matrixEl.innerHTML = "";
      for (var r = 0; r < 4; r++) {
        for (var c = 0; c < 4; c++) {
          var cell = document.createElement("div");
          cell.className = "adj-matrix-cell" + (adj[order[r]][order[c]] ? " is-edge" : "");
          if (r === c) cell.textContent = labels[order[r]];
          matrixEl.appendChild(cell);
        }
      }
      if (sumEl) sumEl.textContent = String(neighborSum());
      if (orderEl) orderEl.textContent = order.map(function (i) { return labels[i]; }).join(" → ");
    }

    root.querySelector("[data-perm-shuffle]")?.addEventListener("click", function () {
      for (var i = order.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
      }
      matrixEl.classList.add("matrix-shuffle");
      setTimeout(function () { matrixEl.classList.remove("matrix-shuffle"); }, reducedMotion ? 0 : 400);
      renderMatrix();
    });

    renderMatrix();
  }

  function initEmbeddingProjection(root) {
    if (!root || root.dataset.embedInit === "true") return;
    root.dataset.embedInit = "true";

    var canvas = root.querySelector("canvas");
    var toggle = root.querySelector("[data-embed-mode]");
    var stressEl = root.querySelector("[data-embed-stress]");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");

    var graphDist = { "0-1": 1, "1-2": 1, "2-3": 1, "3-4": 1, "4-5": 1, "0-5": 1, "0-2": 2, "1-3": 2, "2-4": 2, "3-5": 2 };
    var edges = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]];

    var layoutPos = [
      { x: 80, y: 40 }, { x: 140, y: 70 }, { x: 160, y: 130 },
      { x: 120, y: 180 }, { x: 60, y: 170 }, { x: 40, y: 110 }
    ];
    var embedPos = [
      { x: 50, y: 50 }, { x: 100, y: 55 }, { x: 150, y: 80 },
      { x: 180, y: 130 }, { x: 130, y: 170 }, { x: 70, y: 150 }
    ];
    var pos = layoutPos.map(function (p) { return Object.assign({}, p); });
    var mode = "layout";
    var drag = null;

    function gd(a, b) {
      var k = Math.min(a, b) + "-" + Math.max(a, b);
      return graphDist[k] || 99;
    }
    function stress() {
      var s = 0, pairs = [[0, 2], [0, 3], [1, 4], [2, 5]];
      pairs.forEach(function (p) {
        var d = gd(p[0], p[1]);
        if (d >= 99) return;
        var ed = Math.hypot(pos[p[0]].x - pos[p[1]].x, pos[p[0]].y - pos[p[1]].y) / 50;
        s += Math.pow(ed - d, 2);
      });
      return s;
    }

    function draw() {
      var w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      var pairs = [[0, 2], [0, 3], [1, 4], [2, 5]];
      pairs.forEach(function (p) {
        var d = gd(p[0], p[1]);
        if (d >= 99) return;
        var ed = Math.hypot(pos[p[0]].x - pos[p[1]].x, pos[p[0]].y - pos[p[1]].y) / 50;
        if (Math.abs(ed - d) > 0.35) {
          ctx.strokeStyle = "rgba(255,127,14,0.6)";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(pos[p[0]].x, pos[p[0]].y);
          ctx.lineTo(pos[p[1]].x, pos[p[1]].y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
      edges.forEach(function (e) {
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pos[e[0]].x, pos[e[0]].y);
        ctx.lineTo(pos[e[1]].x, pos[e[1]].y);
        ctx.stroke();
      });
      pos.forEach(function (p, i) {
        ctx.fillStyle = i === 0 ? "#ff7f0e" : "#2780e3";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(i + 1), p.x, p.y + 4);
      });
      if (stressEl) stressEl.textContent = stress().toFixed(2);
    }

    function setMode(m) {
      mode = m;
      var src = m === "layout" ? layoutPos : embedPos;
      pos = src.map(function (p) { return Object.assign({}, p); });
      if (toggle) {
        toggle.querySelectorAll("button").forEach(function (b) {
          b.classList.toggle("is-active", b.dataset.embedMode === m);
        });
      }
      draw();
    }

    canvas.addEventListener("pointerdown", function (e) {
      var rect = canvas.getBoundingClientRect();
      var x = (e.clientX - rect.left) * (canvas.width / rect.width);
      var y = (e.clientY - rect.top) * (canvas.height / rect.height);
      drag = pos.findIndex(function (p) { return Math.hypot(p.x - x, p.y - y) < 16; });
      if (drag >= 0) canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", function (e) {
      if (drag < 0) return;
      var rect = canvas.getBoundingClientRect();
      pos[drag].x = (e.clientX - rect.left) * (canvas.width / rect.width);
      pos[drag].y = (e.clientY - rect.top) * (canvas.height / rect.height);
      draw();
    });
    canvas.addEventListener("pointerup", function () { drag = -1; });

    toggle?.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () { setMode(btn.dataset.embedMode); });
    });

    setMode("layout");
  }

  function initCnnGnnCompare(root) {
    if (!root || root.dataset.cnnGnnInit === "true") return;
    root.dataset.cnnGnnInit = "true";

    var cnnSvg = root.querySelector(".cnn-grid-svg");
    var gnnSvg = root.querySelector(".gnn-receptive-svg");
    var syncEl = root.querySelector("[data-sync-step]");
    var filmBtn = root.querySelector("[data-cnn-film]");
    var stepBtn = root.querySelector("[data-cnn-step]");
    if (!cnnSvg || !gnnSvg) return;

    var gridSize = 5, cell = 20, kernelPos = 0, filmTimer = null, gnnPhase = 0;
    var kernelWeights = [1, 0, -1, 0, 1, 0, -1, 0, 1];
    var gnnNodes = { A: { x: 80, y: 60, r: 14, val: 2 }, B: { x: 30, y: 30, r: 10, val: 5 }, C: { x: 30, y: 90, r: 10, val: 3 }, D: { x: 130, y: 60, r: 10, val: 7 } };
    var gnnEdges = [["B", "A"], ["C", "A"], ["D", "A"]];
    var messages = [];

    function renderCnn() {
      while (cnnSvg.firstChild) cnnSvg.removeChild(cnnSvg.firstChild);
      var kx = kernelPos % (gridSize - 2);
      var ky = Math.floor(kernelPos / (gridSize - 2));
      var wi = 0;
      for (var row = 0; row < gridSize; row++) {
        for (var col = 0; col < gridSize; col++) {
          var inK = col >= kx && col < kx + 3 && row >= ky && row < ky + 3;
          var rect = document.createElementNS(NS, "rect");
          rect.setAttribute("x", col * cell + 2);
          rect.setAttribute("y", row * cell + 2);
          rect.setAttribute("width", cell - 2);
          rect.setAttribute("height", cell - 2);
          rect.setAttribute("fill", inK ? "rgba(255,127,14,0.5)" : "#e2e8f0");
          rect.setAttribute("stroke", "#cbd5e1");
          cnnSvg.appendChild(rect);
          if (inK) {
            var t = document.createElementNS(NS, "text");
            var kr = row - ky, kc = col - kx;
            t.setAttribute("x", col * cell + cell / 2);
            t.setAttribute("y", row * cell + cell / 2 + 3);
            t.setAttribute("text-anchor", "middle");
            t.setAttribute("font-size", "7");
            t.setAttribute("fill", "#333");
            t.textContent = kernelWeights[kr * 3 + kc];
            cnnSvg.appendChild(t);
          }
        }
      }
      if (syncEl) syncEl.textContent = "Kernel-Schritt " + (kernelPos + 1) + " ↔ MP-Phase " + (gnnPhase + 1);
    }

    function renderGnn(highlight, showMsgs) {
      while (gnnSvg.firstChild) gnnSvg.removeChild(gnnSvg.firstChild);
      gnnEdges.forEach(function (e) {
        var a = gnnNodes[e[0]], b = gnnNodes[e[1]];
        var line = document.createElementNS(NS, "line");
        line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
        line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
        line.setAttribute("stroke", highlight ? "#2ca02c" : "#cbd5e1");
        line.setAttribute("stroke-width", highlight ? "2.5" : "2");
        gnnSvg.appendChild(line);
      });
      Object.keys(gnnNodes).forEach(function (k) {
        var n = gnnNodes[k];
        var isC = k === "A", isN = highlight && k !== "A";
        var c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", n.x); c.setAttribute("cy", n.y); c.setAttribute("r", n.r);
        c.setAttribute("fill", isC ? "#ff7f0e" : isN ? "#2ca02c" : "#2780e3");
        c.setAttribute("stroke", "#fff"); c.setAttribute("stroke-width", "2");
        gnnSvg.appendChild(c);
        var t = document.createElementNS(NS, "text");
        t.setAttribute("x", n.x); t.setAttribute("y", n.y + 3);
        t.setAttribute("text-anchor", "middle"); t.setAttribute("fill", "#fff"); t.setAttribute("font-size", "8");
        t.textContent = k + (showMsgs && isC && gnnPhase >= 2 ? "=" + n.val : "");
        gnnSvg.appendChild(t);
      });
      if (showMsgs && highlight) {
        messages.forEach(function (m) { gnnSvg.appendChild(m); });
      }
    }

    function syncStep() {
      gnnPhase = (gnnPhase + 1) % 3;
      messages.forEach(function (m) { m.remove(); });
      messages = [];
      if (gnnPhase === 1) {
        renderGnn(true, false);
        gnnEdges.forEach(function (e, idx) {
          setTimeout(function () {
            var msg = document.createElementNS(NS, "circle");
            msg.setAttribute("r", "5");
            msg.setAttribute("fill", "#2ca02c");
            msg.setAttribute("cx", gnnNodes[e[0]].x);
            msg.setAttribute("cy", gnnNodes[e[0]].y);
            gnnSvg.appendChild(msg);
            messages.push(msg);
            if (!reducedMotion) {
              var dur = 600, start = performance.now();
              (function anim(now) {
                var t = Math.min(1, (now - start) / dur);
                msg.setAttribute("cx", gnnNodes[e[0]].x + (gnnNodes[e[1]].x - gnnNodes[e[0]].x) * t);
                msg.setAttribute("cy", gnnNodes[e[0]].y + (gnnNodes[e[1]].y - gnnNodes[e[0]].y) * t);
                if (t < 1) requestAnimationFrame(anim);
              })(start);
            } else {
              msg.setAttribute("cx", gnnNodes[e[1]].x);
              msg.setAttribute("cy", gnnNodes[e[1]].y);
            }
          }, idx * (reducedMotion ? 0 : 200));
        });
      } else if (gnnPhase === 2) {
        gnnNodes.A.val = 2 + 5 + 3 + 7;
        renderGnn(true, true);
      } else {
        gnnNodes.A.val = 2;
        renderGnn(false, false);
      }
      kernelPos = (kernelPos + 1) % Math.max(1, (gridSize - 2) * (gridSize - 2));
      renderCnn();
    }

    function stopFilm() {
      if (filmTimer) { clearInterval(filmTimer); filmTimer = null; }
      root.classList.remove("is-playing");
      if (filmBtn) filmBtn.textContent = "Film abspielen";
    }

    function toggleFilm() {
      if (filmTimer) { stopFilm(); return; }
      root.classList.add("is-playing");
      if (filmBtn) filmBtn.textContent = "Pause";
      filmTimer = setInterval(syncStep, reducedMotion ? 1200 : 2200);
    }

    stepBtn?.addEventListener("click", syncStep);
    filmBtn?.addEventListener("click", toggleFilm);
    renderCnn();
    renderGnn(false, false);
  }

  function initSectionNav() {
    var nav = document.querySelector(".gnn-section-nav");
    if (!nav) return;
    var links = nav.querySelectorAll("a");
    var sections = [];
    links.forEach(function (a) {
      var id = a.getAttribute("href").slice(1);
      var el = document.getElementById(id);
      if (el) sections.push({ link: a, el: el });
    });
    function onScroll() {
      var y = window.scrollY + 100;
      var current = sections[0];
      sections.forEach(function (s) {
        if (s.el.offsetTop <= y) current = s;
      });
      links.forEach(function (l) { l.classList.remove("is-active"); });
      if (current) current.link.classList.add("is-active");
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function initAll() {
    document.querySelectorAll("#grid-as-graph").forEach(initGridAsGraph);
    document.querySelectorAll("#topology-challenge").forEach(initTopologyChallenge);
    document.querySelectorAll("#perm-invariance-demo").forEach(initPermInvariance);
    document.querySelectorAll("#embedding-projection").forEach(initEmbeddingProjection);
    document.querySelectorAll("#cnn-gnn-compare").forEach(initCnnGnnCompare);
    initSectionNav();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
