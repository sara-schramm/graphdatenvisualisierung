/*
 * Interactive D3 v7 + Canvas force-directed renderer for section 3b.
 *
 * Renders the precomputed global ForceAtlas2 layout of the wiki-Vote social
 * graph (~7k nodes / ~100k edges) onto a 2D canvas. Nodes are colored by
 * Louvain community and sized by in-degree (votes received). Supports
 * zoom/pan, hover highlighting of a node and its neighbors, dragging to pin
 * nodes, and a few live controls (charge, link distance, re-simulate,
 * labels, reset).
 *
 * Expects a container element:
 *   <div class="force-graph" data-src="assets/data/social_graph.json"> ...
 * containing a <canvas>, a tooltip div, and (optional) control inputs.
 */
(function () {
  "use strict";

  function initForceGraph(root) {
    if (!root || root.dataset.fgInitialized === "true") return;
    root.dataset.fgInitialized = "true";

    var src = root.dataset.src || "assets/data/social_graph.json";
    var canvas = root.querySelector("canvas");
    var tooltip = root.querySelector(".fg-tooltip");
    var statusEl = root.querySelector(".fg-status");
    if (!canvas) return;

    var context = canvas.getContext("2d");
    var dpr = window.devicePixelRatio || 1;
    var width = 0;
    var height = 0;

    // Controls (all optional)
    var chargeInput = root.querySelector("[data-control='charge']");
    var distanceInput = root.querySelector("[data-control='distance']");
    var resimulateBtn = root.querySelector("[data-control='resimulate']");
    var labelsInput = root.querySelector("[data-control='labels']");
    var resetBtn = root.querySelector("[data-control='reset']");

    var color = d3.scaleOrdinal();
    var radius = d3.scaleSqrt().range([1.5, 13]);

    var transform = d3.zoomIdentity;
    var nodes = [];
    var links = [];
    var neighbors = new Map(); // nodeIndex -> Set(neighborIndex)
    var hovered = null;
    var showLabels = false;
    var topHubs = [];
    var quadtree = null;

    var simulation = d3
      .forceSimulation()
      .force("link", d3.forceLink().distance(30).strength(0.08))
      .force("charge", d3.forceManyBody().strength(-30).distanceMax(400))
      .force("center", d3.forceCenter(0, 0))
      .alphaDecay(0.02)
      .stop();

    function setStatus(msg) {
      if (statusEl) statusEl.textContent = msg || "";
    }

    function resize() {
      var rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      draw();
    }

    function fitView() {
      if (!nodes.length) return;
      var xExtent = d3.extent(nodes, function (d) { return d.x; });
      var yExtent = d3.extent(nodes, function (d) { return d.y; });
      var gw = (xExtent[1] - xExtent[0]) || 1;
      var gh = (yExtent[1] - yExtent[0]) || 1;
      var margin = 40;
      var k = Math.min(
        (width - margin) / gw,
        (height - margin) / gh
      );
      k = Math.max(0.02, Math.min(k, 4));
      var cx = (xExtent[0] + xExtent[1]) / 2;
      var cy = (yExtent[0] + yExtent[1]) / 2;
      transform = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(k)
        .translate(-cx, -cy);
      d3.select(canvas).call(zoom.transform, transform);
    }

    function draw() {
      if (!context) return;
      context.save();
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.scale(dpr, dpr);
      context.translate(transform.x, transform.y);
      context.scale(transform.k, transform.k);

      var hoveredNeighbors = hovered ? neighbors.get(hovered.index) : null;

      // Edges: draw all faint in a single batched path for performance.
      context.globalAlpha = hovered ? 0.06 : 0.12;
      context.strokeStyle = "#94a3b8";
      context.lineWidth = 0.6 / transform.k;
      context.beginPath();
      for (var i = 0; i < links.length; i++) {
        var l = links[i];
        context.moveTo(l.source.x, l.source.y);
        context.lineTo(l.target.x, l.target.y);
      }
      context.stroke();

      // Highlighted edges incident to the hovered node, drawn on top.
      if (hovered) {
        context.globalAlpha = 0.9;
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

      // Nodes: batch by fill color to minimize state changes.
      context.globalAlpha = 1;
      var byColor = new Map();
      for (var n = 0; n < nodes.length; n++) {
        var node = nodes[n];
        var dim =
          hovered &&
          node !== hovered &&
          !(hoveredNeighbors && hoveredNeighbors.has(node.index));
        var fill = dim ? "#dde3ea" : color(node.group);
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

      // Hovered node outline.
      if (hovered) {
        context.lineWidth = 1.5 / transform.k;
        context.strokeStyle = "#0f172a";
        context.beginPath();
        var hr = radius(hovered.deg) + 1.5 / transform.k;
        context.moveTo(hovered.x + hr, hovered.y);
        context.arc(hovered.x, hovered.y, hr, 0, 2 * Math.PI);
        context.stroke();
      }

      // Labels for the highest-degree hubs (optional toggle).
      if (showLabels && transform.k > 0.05) {
        context.fillStyle = "#0f172a";
        context.font = (11 / transform.k) + "px sans-serif";
        context.textAlign = "center";
        context.textBaseline = "bottom";
        for (var t = 0; t < topHubs.length; t++) {
          var hub = topHubs[t];
          context.fillText("#" + hub.id, hub.x, hub.y - radius(hub.deg) - 1);
        }
      }

      context.restore();
    }

    function screenToSim(event) {
      var rect = canvas.getBoundingClientRect();
      var px = event.clientX - rect.left;
      var py = event.clientY - rect.top;
      return [
        (px - transform.x) / transform.k,
        (py - transform.y) / transform.k,
      ];
    }

    function rebuildTree() {
      quadtree = d3
        .quadtree()
        .x(function (d) { return d.x; })
        .y(function (d) { return d.y; })
        .addAll(nodes);
    }

    function findNode(event) {
      if (!quadtree) return null;
      var p = screenToSim(event);
      // search radius in sim units, generous near the pointer
      var rPix = 12;
      var found = quadtree.find(p[0], p[1], rPix / transform.k);
      return found || null;
    }

    var zoom = d3
      .zoom()
      .scaleExtent([0.02, 12])
      .on("zoom", function (event) {
        transform = event.transform;
        draw();
      });

    d3.select(canvas).call(zoom);

    function onMove(event) {
      var node = findNode(event);
      if (node !== hovered) {
        hovered = node;
        draw();
      }
      if (node && tooltip) {
        tooltip.style.display = "block";
        tooltip.style.left = event.offsetX + 12 + "px";
        tooltip.style.top = event.offsetY + 12 + "px";
        var deg = neighbors.get(node.index);
        tooltip.innerHTML =
          "<strong>User #" + node.id + "</strong><br>" +
          "Community " + node.group + "<br>" +
          "Votes received: " + node.deg + "<br>" +
          "Neighbors: " + (deg ? deg.size : 0);
      } else if (tooltip) {
        tooltip.style.display = "none";
      }
    }

    function onLeave() {
      if (hovered) { hovered = null; draw(); }
      if (tooltip) tooltip.style.display = "none";
    }

    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", onLeave);

    // Drag to pin a node.
    var drag = d3
      .drag()
      .container(canvas)
      .subject(function (event) {
        return findNode(event.sourceEvent);
      })
      .on("start", function (event) {
        if (!event.subject) return;
        if (!event.active) simulation.alphaTarget(0.2).restart();
        runWhileHot();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      })
      .on("drag", function (event) {
        if (!event.subject) return;
        var p = screenToSim(event.sourceEvent);
        event.subject.fx = p[0];
        event.subject.fy = p[1];
      })
      .on("end", function (event) {
        if (!event.subject) return;
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      });

    d3.select(canvas).call(drag);

    // Keep ticking/drawing only while the simulation is "hot".
    var ticking = false;
    function runWhileHot() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(stepLoop);
    }
    function stepLoop() {
      rebuildTree();
      draw();
      if (simulation.alpha() > simulation.alphaMin()) {
        requestAnimationFrame(stepLoop);
      } else {
        ticking = false;
      }
    }
    simulation.on("tick", function () { /* drawing handled by stepLoop */ });

    // Wire controls.
    if (chargeInput) {
      chargeInput.addEventListener("input", function () {
        simulation.force("charge").strength(-(+chargeInput.value));
        simulation.alpha(0.4).restart();
        runWhileHot();
      });
    }
    if (distanceInput) {
      distanceInput.addEventListener("input", function () {
        simulation.force("link").distance(+distanceInput.value);
        simulation.alpha(0.4).restart();
        runWhileHot();
      });
    }
    if (resimulateBtn) {
      resimulateBtn.addEventListener("click", function () {
        simulation.alpha(1).restart();
        runWhileHot();
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        fitView();
        draw();
      });
    }
    if (labelsInput) {
      labelsInput.addEventListener("change", function () {
        showLabels = labelsInput.checked;
        draw();
      });
    }

    window.addEventListener("resize", resize);

    setStatus("Lade Graphdaten ...");
    d3.json(src)
      .then(function (data) {
        nodes = data.nodes.map(function (d) {
          return { id: d.id, x: d.x, y: d.y, group: d.group, deg: d.deg };
        });
        links = data.links.map(function (pair) {
          return { source: pair[0], target: pair[1] };
        });

        var groups = Array.from(new Set(nodes.map(function (d) { return d.group; }))).sort(function (a, b) { return a - b; });
        color.domain(groups).range(d3.quantize(d3.interpolateRainbow, groups.length + 1));
        radius.domain([0, d3.max(nodes, function (d) { return d.deg; }) || 1]);

        topHubs = nodes
          .slice()
          .sort(function (a, b) { return b.deg - a.deg; })
          .slice(0, 12);

        neighbors = new Map();
        nodes.forEach(function (_, i) { neighbors.set(i, new Set()); });
        links.forEach(function (l) {
          neighbors.get(l.source).add(l.target);
          neighbors.get(l.target).add(l.source);
        });

        simulation.nodes(nodes);
        simulation.force("link").links(links);
        // Resolve link endpoints to node objects without moving anything.
        simulation.alpha(0).stop();

        rebuildTree();
        resize();
        fitView();
        draw();
        setStatus(
          nodes.length.toLocaleString("de-DE") + " Knoten, " +
          links.length.toLocaleString("de-DE") + " Kanten, " +
          groups.length + " Communities"
        );
      })
      .catch(function (err) {
        setStatus("Fehler beim Laden der Graphdaten: " + err.message);
        console.error("force-graph:", err);
      });
  }

  function initAll() {
    if (typeof d3 === "undefined") {
      // d3 not ready yet; retry shortly.
      window.setTimeout(initAll, 50);
      return;
    }
    var roots = document.querySelectorAll(".force-graph");
    roots.forEach(initForceGraph);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
