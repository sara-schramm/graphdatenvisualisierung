/*
 * Interactive D3 v7 + Canvas stress-layout renderer for section 3b.
 * UX: stress demo, legend, discovery chips, minimap, keyboard, load reveal.
 */
(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ONBOARD_KEY = "gv-force-graph-onboarding-done";

  function initStressDemo(root) {
    if (!root || root.dataset.stressInit === "true") return;
    root.dataset.stressInit = "true";

    var svg = root.querySelector("svg");
    var totalEl = root.querySelector("[data-stress-total]");
    if (!svg) return;

    var pts = [
      { id: "u", x: 60, y: 80, path: 0 },
      { id: "v", x: 180, y: 40, path: 1 },
      { id: "w", x: 180, y: 120, path: 1 },
      { id: "z", x: 260, y: 80, path: 2 }
    ];
    var pathDist = { "u-v": 1, "u-w": 1, "v-w": 1, "w-z": 1, "u-z": 2, "v-z": 2 };
    var dragTarget = null;

    function euclid(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function stressPair(a, b) {
      var key = a.id + "-" + b.id;
      var d = pathDist[key] || pathDist[b.id + "-" + a.id] || 1;
      var dist = euclid(a, b);
      return Math.pow(dist / 40 - d, 2);
    }

    function totalStress() {
      var s = 0;
      for (var i = 0; i < pts.length; i++) {
        for (var j = i + 1; j < pts.length; j++) {
          s += stressPair(pts[i], pts[j]);
        }
      }
      return s;
    }

    function render() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var pairs = [[0, 1], [0, 2], [1, 2], [2, 3]];
      pairs.forEach(function (p) {
        var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", pts[p[0]].x);
        line.setAttribute("y1", pts[p[0]].y);
        line.setAttribute("x2", pts[p[1]].x);
        line.setAttribute("y2", pts[p[1]].y);
        line.setAttribute("stroke", "#94a3b8");
        line.setAttribute("stroke-width", "2");
        svg.appendChild(line);
      });
      pts.forEach(function (p) {
        var c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", p.x);
        c.setAttribute("cy", p.y);
        c.setAttribute("r", "14");
        c.setAttribute("fill", "#2780e3");
        c.setAttribute("stroke", "#fff");
        c.setAttribute("stroke-width", "2");
        c.style.cursor = "grab";
        c.dataset.id = p.id;
        var t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", p.x);
        t.setAttribute("y", p.y + 4);
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("fill", "#fff");
        t.setAttribute("font-size", "11");
        t.textContent = p.id;
        svg.appendChild(c);
        svg.appendChild(t);
        p.el = c;
      });
      updateMetrics();
    }

    function updateMetrics() {
      var stress = totalStress();
      var maxS = 8;
      if (totalEl) {
        totalEl.textContent = stress.toFixed(2);
        var barWrap = root.querySelector("[data-stress-bar]");
        var barInner = barWrap ? barWrap.querySelector("span") : null;
        if (barInner) {
          barInner.style.width = Math.min(100, (stress / maxS) * 100) + "%";
        }
      }
      var rows = root.querySelectorAll("[data-pair-stress]");
      rows.forEach(function (row) {
        var a = pts.find(function (p) { return p.id === row.dataset.a; });
        var b = pts.find(function (p) { return p.id === row.dataset.b; });
        if (a && b) {
          var s = stressPair(a, b);
          row.querySelector("span").textContent = s.toFixed(2);
          row.querySelector(".stress-bar span").style.width = Math.min(100, s * 40) + "%";
        }
      });
    }

    function pointerPos(e) {
      var rect = svg.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (320 / rect.width),
        y: (e.clientY - rect.top) * (160 / rect.height)
      };
    }

    svg.addEventListener("pointerdown", function (e) {
      var pos = pointerPos(e);
      dragTarget = pts.find(function (p) {
        return Math.hypot(p.x - pos.x, p.y - pos.y) < 18;
      }) || null;
      if (dragTarget) svg.setPointerCapture(e.pointerId);
    });

    svg.addEventListener("pointermove", function (e) {
      if (!dragTarget) return;
      var pos = pointerPos(e);
      dragTarget.x = Math.max(20, Math.min(300, pos.x));
      dragTarget.y = Math.max(20, Math.min(140, pos.y));
      render();
    });

    svg.addEventListener("pointerup", function () {
      dragTarget = null;
    });

    render();
  }

  function initForceGraph(root) {
    if (!root || root.dataset.fgInitialized === "true") return;
    root.dataset.fgInitialized = "true";

    var src = root.dataset.src || "assets/data/social_graph.json";
    var canvas = root.querySelector("canvas.fg-main") || root.querySelector("canvas");
    var minimapCanvas = root.querySelector(".fg-minimap canvas");
    var tooltip = root.querySelector(".fg-tooltip");
    var statusEl = root.querySelector(".fg-status");
    var skeletonEl = root.querySelector(".fg-skeleton");
    var skeletonBar = root.querySelector(".fg-skeleton-bar span");
    var legendEl = root.querySelector(".fg-legend-items");
    var onboardingEl = root.querySelector(".fg-onboarding");
    if (!canvas) return;

    if (canvas && !canvas.classList.contains("fg-main")) {
      canvas.classList.add("fg-main");
    }

    var labelsInput = root.querySelector("[data-control='labels']");
    var louvainInput = root.querySelector("[data-control='louvain']");
    var resetLayoutBtn = root.querySelector("[data-control='reset-layout']");
    var resetBtn = root.querySelector("[data-control='reset']");
    var helpBtn = root.querySelector("[data-control='help']");

    var color = d3.scaleOrdinal();
    var radius = d3.scaleSqrt().range([1.5, 13]);
    var transform = d3.zoomIdentity;
    var nodes = [];
    var links = [];
    var neighbors = new Map();
    var hovered = null;
    var showLabels = false;
    var showLouvain = true;
    var topHubs = [];
    var quadtree = null;
    var groups = [];
    var activeCommunity = null;
    var revealAlpha = reducedMotion ? 1 : 0;
    var onboardingStep = 0;
    var draggedNode = null;

    var bounds = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };

    var context = canvas.getContext("2d");
    var minimapCtx = minimapCanvas ? minimapCanvas.getContext("2d") : null;
    var dpr = window.devicePixelRatio || 1;
    var width = 0;
    var height = 0;

    function setStatus(msg) {
      if (statusEl) statusEl.textContent = msg || "";
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      if (minimapCanvas && minimapCtx) {
        minimapCanvas.width = 120 * dpr;
        minimapCanvas.height = 90 * dpr;
      }
      draw();
      drawMinimap();
    }

    function computeBounds() {
      if (!nodes.length) return;
      bounds.xMin = d3.min(nodes, function (d) { return d.x; });
      bounds.xMax = d3.max(nodes, function (d) { return d.x; });
      bounds.yMin = d3.min(nodes, function (d) { return d.y; });
      bounds.yMax = d3.max(nodes, function (d) { return d.y; });
    }

    function fitView() {
      if (!nodes.length) return;
      var gw = (bounds.xMax - bounds.xMin) || 1;
      var gh = (bounds.yMax - bounds.yMin) || 1;
      var margin = 40;
      var k = Math.min((width - margin) / gw, (height - margin) / gh);
      k = Math.max(0.02, Math.min(k, 4));
      var cx = (bounds.xMin + bounds.xMax) / 2;
      var cy = (bounds.yMin + bounds.yMax) / 2;
      transform = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(k)
        .translate(-cx, -cy);
      d3.select(canvas).call(zoom.transform, transform);
    }

    function zoomToNode(node, scale) {
      if (!node) return;
      scale = scale || Math.min(2.5, transform.k * 2);
      transform = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(scale)
        .translate(-node.x, -node.y);
      d3.select(canvas).call(zoom.transform, transform);
      hovered = node;
      draw();
      showTooltipForNode(node, width / 2, height / 2);
    }

    function nodeFill(node) {
      var hoveredNeighbors = hovered ? neighbors.get(hovered.index) : null;
      var dim =
        hovered &&
        node !== hovered &&
        !(hoveredNeighbors && hoveredNeighbors.has(node.index));
      if (activeCommunity !== null && node.group !== activeCommunity) dim = true;
      if (dim) return "#dde3ea";
      if (!showLouvain) return "#64748b";
      return color(node.group);
    }

    function draw() {
      if (!context) return;
      context.save();
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.scale(dpr, dpr);
      context.globalAlpha = revealAlpha;
      context.translate(transform.x, transform.y);
      context.scale(transform.k, transform.k);

      var hoveredNeighbors = hovered ? neighbors.get(hovered.index) : null;

      context.globalAlpha = revealAlpha * (hovered ? 0.06 : 0.12);
      context.strokeStyle = "#94a3b8";
      context.lineWidth = 0.6 / transform.k;
      context.beginPath();
      for (var i = 0; i < links.length; i++) {
        var l = links[i];
        context.moveTo(l.source.x, l.source.y);
        context.lineTo(l.target.x, l.target.y);
      }
      context.stroke();

      if (hovered) {
        context.globalAlpha = revealAlpha * 0.9;
        context.strokeStyle = "#ef4444";
        context.lineWidth = 1.2 / transform.k;
        context.beginPath();
        for (var j = 0; j < links.length; j++) {
          var lk = links[j];
          if (lk.source === hovered || lk.target === hovered) {
            context.moveTo(lk.source.x, lk.source.y);
            context.lineTo(lk.target.x, lk.target.y);
          }
        }
        context.stroke();
      }

      context.globalAlpha = revealAlpha;
      var byColor = new Map();
      for (var n = 0; n < nodes.length; n++) {
        var node = nodes[n];
        var fill = nodeFill(node);
        var arr = byColor.get(fill);
        if (!arr) { arr = []; byColor.set(fill, arr); }
        arr.push(node);
      }
      byColor.forEach(function (arr, fill) {
        context.fillStyle = fill;
        context.beginPath();
        for (var m = 0; m < arr.length; m++) {
          var nd = arr[m];
          var r = radius(nd.deg);
          context.moveTo(nd.x + r, nd.y);
          context.arc(nd.x, nd.y, r, 0, 2 * Math.PI);
        }
        context.fill();
      });

      if (hovered) {
        context.lineWidth = 2 / transform.k;
        context.strokeStyle = "#ff7f0e";
        context.beginPath();
        var hr = radius(hovered.deg) + 2 / transform.k;
        context.moveTo(hovered.x + hr, hovered.y);
        context.arc(hovered.x, hovered.y, hr, 0, 2 * Math.PI);
        context.stroke();
      }

      if (showLabels && transform.k > 0.05) {
        context.fillStyle = "#0f172a";
        context.font = (11 / transform.k) + "px sans-serif";
        context.textAlign = "center";
        context.textBaseline = "bottom";
        for (var t = 0; t < topHubs.length; t++) {
          var hub = topHubs[t];
          if (activeCommunity !== null && hub.group !== activeCommunity) continue;
          context.fillText("#" + hub.id, hub.x, hub.y - radius(hub.deg) - 1);
        }
      }

      context.restore();
      drawMinimap();
    }

    function drawMinimap() {
      if (!minimapCtx || !nodes.length) return;
      var mw = 120;
      var mh = 90;
      minimapCtx.save();
      minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      minimapCtx.clearRect(0, 0, mw, mh);
      minimapCtx.fillStyle = "#f8fafc";
      minimapCtx.fillRect(0, 0, mw, mh);

      var pad = 4;
      var gw = (bounds.xMax - bounds.xMin) || 1;
      var gh = (bounds.yMax - bounds.yMin) || 1;
      var scale = Math.min((mw - pad * 2) / gw, (mh - pad * 2) / gh);

      minimapCtx.save();
      minimapCtx.translate(
        pad + (mw - pad * 2 - gw * scale) / 2 - bounds.xMin * scale,
        pad + (mh - pad * 2 - gh * scale) / 2 - bounds.yMin * scale
      );
      minimapCtx.scale(scale, scale);

      minimapCtx.fillStyle = "#94a3b8";
      for (var i = 0; i < nodes.length; i += 3) {
        var nd = nodes[i];
        minimapCtx.beginPath();
        minimapCtx.arc(nd.x, nd.y, 1.2, 0, 2 * Math.PI);
        minimapCtx.fill();
      }
      minimapCtx.restore();

      var x0 = (0 - transform.x) / transform.k;
      var y0 = (0 - transform.y) / transform.k;
      var x1 = (width - transform.x) / transform.k;
      var y1 = (height - transform.y) / transform.k;
      var rx = pad + (x0 - bounds.xMin) * scale + (mw - pad * 2 - gw * scale) / 2;
      var ry = pad + (y0 - bounds.yMin) * scale + (mh - pad * 2 - gh * scale) / 2;
      var rw = (x1 - x0) * scale;
      var rh = (y1 - y0) * scale;

      minimapCtx.strokeStyle = "#2780e3";
      minimapCtx.lineWidth = 1.5;
      minimapCtx.strokeRect(rx, ry, rw, rh);
      minimapCtx.restore();
    }

    function screenToSim(event) {
      var rect = canvas.getBoundingClientRect();
      var px = event.clientX - rect.left;
      var py = event.clientY - rect.top;
      return [(px - transform.x) / transform.k, (py - transform.y) / transform.k];
    }

    function rebuildTree() {
      quadtree = d3.quadtree()
        .x(function (d) { return d.x; })
        .y(function (d) { return d.y; })
        .addAll(nodes);
    }

    function findNode(event) {
      if (!quadtree) return null;
      var p = screenToSim(event);
      return quadtree.find(p[0], p[1], 12 / transform.k) || null;
    }

    function showTooltipForNode(node, offsetX, offsetY) {
      if (!tooltip || !node) return;
      tooltip.style.display = "block";
      tooltip.style.left = offsetX + 12 + "px";
      tooltip.style.top = offsetY + 12 + "px";
      var deg = neighbors.get(node.index);
      var swatch = showLouvain ? color(node.group) : "#64748b";
      tooltip.innerHTML =
        "<strong>Nutzer #" + node.id + "</strong>" +
        '<div class="fg-tip-row"><span class="fg-tip-swatch" style="background:' + swatch + '"></span>Community ' + node.group + "</div>" +
        "<div class=\"fg-tip-row\">Eingehende Stimmen: <strong>" + node.deg + "</strong></div>" +
        "<div class=\"fg-tip-row\">Nachbarn: <strong>" + (deg ? deg.size : 0) + "</strong></div>";
    }

    function resetNodePositions() {
      nodes.forEach(function (d) {
        d.x = d._ox;
        d.y = d._oy;
      });
      rebuildTree();
      computeBounds();
      draw();
    }

    var zoom = d3.zoom()
      .scaleExtent([0.02, 12])
      .on("zoom", function (event) {
        transform = event.transform;
        draw();
      });

    d3.select(canvas).call(zoom);

    function onMove(event) {
      if (draggedNode) return;
      var node = findNode(event);
      if (node !== hovered) {
        hovered = node;
        draw();
      }
      if (node) showTooltipForNode(node, event.offsetX, event.offsetY);
      else if (tooltip) tooltip.style.display = "none";
    }

    function onLeave() {
      if (draggedNode) return;
      hovered = null;
      draw();
      if (tooltip) tooltip.style.display = "none";
    }

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    var drag = d3.drag()
      .container(canvas)
      .subject(function (event) { return findNode(event.sourceEvent); })
      .on("start", function (event) {
        if (!event.subject) return;
        draggedNode = event.subject;
        canvas.style.cursor = "grabbing";
      })
      .on("drag", function (event) {
        if (!event.subject) return;
        var p = screenToSim(event.sourceEvent);
        event.subject.x = p[0];
        event.subject.y = p[1];
        rebuildTree();
        draw();
      })
      .on("end", function (event) {
        if (!event.subject) return;
        draggedNode = null;
        canvas.style.cursor = "";
        rebuildTree();
        draw();
      });

    d3.select(canvas).call(drag);

    function buildLegend() {
      if (!legendEl) return;
      legendEl.innerHTML = "";
      groups.forEach(function (g) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "fg-legend-item";
        btn.dataset.group = g;
        btn.setAttribute("aria-label", "Community " + g + " filtern");
        btn.innerHTML =
          '<span class="fg-legend-swatch" style="background:' + color(g) + '"></span>C' + g;
        btn.addEventListener("click", function () {
          if (activeCommunity === g) {
            activeCommunity = null;
            legendEl.querySelectorAll(".fg-legend-item").forEach(function (el) {
              el.classList.remove("is-active", "is-muted");
            });
          } else {
            activeCommunity = g;
            legendEl.querySelectorAll(".fg-legend-item").forEach(function (el) {
              var match = +el.dataset.group === g;
              el.classList.toggle("is-active", match);
              el.classList.toggle("is-muted", !match);
            });
          }
          draw();
        });
        legendEl.appendChild(btn);
      });
    }

    function setDiscoveryActive(chip) {
      root.querySelectorAll(".discovery-chip").forEach(function (c) {
        c.classList.toggle("is-active", c === chip);
      });
    }

    function runDiscovery(action) {
      if (!nodes.length) return;
      if (action === "hub") {
        var hub = topHubs[0];
        activeCommunity = null;
        if (legendEl) legendEl.querySelectorAll(".fg-legend-item").forEach(function (el) {
          el.classList.remove("is-active", "is-muted");
        });
        zoomToNode(hub, 2.2);
        setStatus("Größter Hub: Nutzer #" + hub.id + " mit " + hub.deg + " eingehenden Stimmen.");
      } else if (action === "community") {
        var counts = d3.rollup(nodes, function (v) { return v.length; }, function (d) { return d.group; });
        var largest = Array.from(counts.entries()).sort(function (a, b) { return b[1] - a[1]; })[0][0];
        activeCommunity = largest;
        if (legendEl) {
          legendEl.querySelectorAll(".fg-legend-item").forEach(function (el) {
            var match = +el.dataset.group === largest;
            el.classList.toggle("is-active", match);
            el.classList.toggle("is-muted", !match);
          });
        }
        fitView();
        draw();
        setStatus("Community " + largest + " isoliert (" + counts.get(largest) + " Knoten). Klick erneut auf Legende zum Aufheben.");
      } else if (action === "neighbor") {
        var rich = nodes.slice().sort(function (a, b) {
          return neighbors.get(b.index).size - neighbors.get(a.index).size;
        })[2] || topHubs[1];
        activeCommunity = null;
        zoomToNode(rich, 2);
        setStatus("Nachbarschaft von Nutzer #" + rich.id + " (" + neighbors.get(rich.index).size + " Nachbarn) — fahre mit der Maus über den orangenen Ring.");
      }
    }

    root.querySelectorAll("[data-discovery]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        setDiscoveryActive(chip);
        runDiscovery(chip.dataset.discovery);
      });
    });

    function clearSelection() {
      hovered = null;
      activeCommunity = null;
      if (legendEl) legendEl.querySelectorAll(".fg-legend-item").forEach(function (el) {
        el.classList.remove("is-active", "is-muted");
      });
      root.querySelectorAll(".discovery-chip").forEach(function (c) { c.classList.remove("is-active"); });
      if (tooltip) tooltip.style.display = "none";
      draw();
    }

    function onGlobalKey(e) {
      if (!nodes.length) return;
      var tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!root.classList.contains("is-loaded")) return;
      var rect = root.getBoundingClientRect();
      var inView = rect.top < window.innerHeight && rect.bottom > 0;
      if (!inView && document.activeElement !== root) return;

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        d3.select(canvas).transition().duration(reducedMotion ? 0 : 200).call(zoom.scaleBy, 1.25);
      } else if (e.key === "-") {
        e.preventDefault();
        d3.select(canvas).transition().duration(reducedMotion ? 0 : 200).call(zoom.scaleBy, 0.8);
      } else if (e.key === "Escape") {
        clearSelection();
      } else if (e.key === "r" || e.key === "R") {
        fitView();
        draw();
      }
    }

    canvas.addEventListener("click", function () {
      root.focus();
    });
    document.addEventListener("keydown", onGlobalKey);

    if (resetLayoutBtn) {
      resetLayoutBtn.addEventListener("click", function () {
        resetNodePositions();
        setStatus(
          nodes.length.toLocaleString("de-DE") + " Knoten · Stress-Layout wiederhergestellt"
        );
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        fitView();
        clearSelection();
      });
    }
    if (labelsInput) {
      labelsInput.addEventListener("change", function () {
        showLabels = labelsInput.checked;
        draw();
      });
    }
    if (louvainInput) {
      louvainInput.addEventListener("change", function () {
        showLouvain = louvainInput.checked;
        draw();
      });
    }

    var onboardingTexts = [
      { title: "Willkommen im wiki-Vote-Netz", body: "7.000 Nutzer:innen, über 100.000 Beziehungen. Das Layout wurde offline per Stress-Majorization optimiert." },
      { title: "Entdecke Struktur", body: "Nutze die Chips: Hub finden, Community isolieren oder Nachbarschaft erkunden." },
      { title: "Stress verstehen", body: "Oben siehst du die Stress-Demo: Layout-Distanz soll Pfaddistanz entsprechen. Farbe = Community, Größe = Stimmen." }
    ];

    function showOnboarding() {
      if (!onboardingEl || localStorage.getItem(ONBOARD_KEY)) return;
      onboardingEl.hidden = false;
      updateOnboardingCard();
    }

    function updateOnboardingCard() {
      if (!onboardingEl) return;
      var card = onboardingEl.querySelector(".fg-onboarding-card");
      if (!card) return;
      var data = onboardingTexts[onboardingStep];
      if (!data) return;
      var h3 = card.querySelector("h3");
      var p = card.querySelector("p");
      var next = card.querySelector("[data-onboarding-next]");
      if (h3) h3.textContent = data.title;
      if (p) p.textContent = data.body;
      if (next) {
        next.textContent = onboardingStep < onboardingTexts.length - 1 ? "Weiter" : "Los geht's";
      }
    }

    if (onboardingEl) {
      onboardingEl.querySelector("[data-onboarding-skip]")?.addEventListener("click", function () {
        onboardingEl.hidden = true;
        localStorage.setItem(ONBOARD_KEY, "1");
      });
      onboardingEl.querySelector("[data-onboarding-next]")?.addEventListener("click", function () {
        if (onboardingStep < onboardingTexts.length - 1) {
          onboardingStep++;
          updateOnboardingCard();
        } else {
          onboardingEl.hidden = true;
          localStorage.setItem(ONBOARD_KEY, "1");
        }
      });
    }

    if (helpBtn) {
      helpBtn.addEventListener("click", function () {
        onboardingStep = 0;
        if (onboardingEl) {
          onboardingEl.hidden = false;
          updateOnboardingCard();
        }
      });
    }

    function playReveal() {
      if (reducedMotion) {
        revealAlpha = 1;
        root.classList.add("is-revealed");
        draw();
        return;
      }
      root.classList.add("is-revealed");
      var start = performance.now();
      function frame(now) {
        revealAlpha = Math.min(1, (now - start) / 800);
        draw();
        if (revealAlpha < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    window.addEventListener("resize", resize);

    setStatus("Lade Graphdaten …");
    if (skeletonBar) skeletonBar.style.width = "15%";

    d3.json(src)
      .then(function (data) {
        if (skeletonBar) skeletonBar.style.width = "70%";
        nodes = data.nodes.map(function (d, i) {
          return {
            index: i,
            id: d.id,
            x: d.x,
            y: d.y,
            _ox: d.x,
            _oy: d.y,
            group: d.group,
            deg: d.deg
          };
        });
        links = data.links.map(function (pair) {
          return { source: nodes[pair[0]], target: nodes[pair[1]] };
        });

        groups = Array.from(new Set(nodes.map(function (d) { return d.group; }))).sort(function (a, b) { return a - b; });
        color.domain(groups).range(d3.quantize(d3.interpolateRainbow, groups.length + 1));
        radius.domain([0, d3.max(nodes, function (d) { return d.deg; }) || 1]);

        topHubs = nodes.slice().sort(function (a, b) { return b.deg - a.deg; }).slice(0, 12);

        neighbors = new Map();
        nodes.forEach(function (_, i) { neighbors.set(i, new Set()); });
        links.forEach(function (l) {
          neighbors.get(l.source.index).add(l.target.index);
          neighbors.get(l.target.index).add(l.source.index);
        });

        buildLegend();
        computeBounds();
        rebuildTree();
        resize();
        fitView();

        if (skeletonBar) skeletonBar.style.width = "100%";
        root.classList.add("is-loaded");
        playReveal();
        try {
          showOnboarding();
        } catch (err) {
          console.warn("force-graph onboarding:", err);
        }

        setStatus(
          nodes.length.toLocaleString("de-DE") + " Knoten · " +
          links.length.toLocaleString("de-DE") + " Kanten · " +
          groups.length + " Communities · Stress-Layout (offline)"
        );
      })
      .catch(function (err) {
        setStatus("Fehler beim Laden: " + err.message);
        console.error("force-graph:", err);
      });
  }

  function initAll() {
    if (typeof d3 === "undefined") {
      window.setTimeout(initAll, 50);
      return;
    }
    document.querySelectorAll(".stress-demo").forEach(initStressDemo);
    document.querySelectorAll(".force-graph").forEach(initForceGraph);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
