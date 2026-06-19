(() => {
  const width = 800;
  const height = 500;

    const characterIconMap = {
        "Valjean": "valjean.svg",
        "Cosette": "cosette.svg",
        "Fantine": "fantine.svg",
        "Marius": "marius.svg",
        "Javert": "javert.svg",
        "Gavroche": "gavroche.svg",
        "Enjolras": "enjolras.svg",
        "Eponine": "eponine.svg"
    };
    function createCharacterToggle(el, iconGroup, hideSelection) {
        const control = el.insert("div", ":first-child").attr("class", "character-icon-control");
        const button = control.append("button")
            .attr("type", "button")
            .attr("class", "character-icon-toggle")
            .text("Hauptfiguren anzeigen");

        button.on("click", () => {
            const hidden = iconGroup.style("display") === "none";
            iconGroup.style("display", hidden ? null : "none");
            if (hideSelection) {
                hideSelection.style("display", hidden ? "none" : null);
            }
            button.text(hidden ? "Hauptfiguren ausblenden" : "Hauptfiguren anzeigen");
        });
    }

    function createCharacterIcons(svg, nodes) {
        const icons = svg.append("g")
            .attr("class", "character-icons")
            .style("display", "none");
        icons.raise();

        icons.selectAll("image")
            .data(nodes)
            .join("image")
            .attr("href", d => `assets/data/${characterIconMap[d.name]}`)
            .attr("width", 60)
            .attr("height", 60)
            .attr("x", d => (d.x ?? 0) - 20)
            .attr("y", d => (d.y ?? 0) - 20)
            .attr("opacity", 1)


        return icons;
    }

  const scaleCounts = [77, 154, 308, 616, 1232];
  let currentScaleIndex = 0;

  function buildScaledGraph(scaleIndex = currentScaleIndex) {
    const copies = 2 ** scaleIndex;

    const baseNodes = graphData.nodes;
    const baseLinks = graphData.links;

    const nodes = [];
    const links = [];

    for (let c = 0; c < copies; c++) {
        const offset = c * baseNodes.length;

        baseNodes.forEach((n, i) => {
            nodes.push({
                ...n,
                id: offset + i,
                _origIndex: i
            });
        });

        baseLinks.forEach(l => {
            const s = (typeof l.source === "number") ? l.source : l.source.index;
            const t = (typeof l.target === "number") ? l.target : l.target.index;

            links.push({
                source: offset + s,
                target: offset + t
            });

            // kleine Verbindung zur nächsten Kopie
            if (c < copies - 1 && Math.random() < 0.1) {
                const nextOffset = (c + 1) * baseNodes.length;

                links.push({
                    source: offset + s,
                    target: nextOffset + t
                });
            }
        });
    }

    return { nodes, links };
  }

  function createScaleControls(el, renderGraph) {
    const control = el.insert("div", ":first-child").attr("class", "scale-control");

    control.append("span")
      .attr("class", "scale-label")
      .text(`Knoten: ${scaleCounts[currentScaleIndex]}`);

    control.append("button")
      .attr("type", "button")
      .attr("class", "scale-button")
      .text("−")
      .on("click", () => {
        if (currentScaleIndex > 0) {
          currentScaleIndex -= 1;
          renderGraph();
        }
      });
    control.append("button")
      .attr("type", "button")
      .attr("class", "scale-button")
      .text("+")
      .on("click", () => {
        if (currentScaleIndex < scaleCounts.length - 1) {
          currentScaleIndex += 1;
          renderGraph();
        }
      });

    return control;
  }

  // -----------------------------
  // Helper: Drag
  // -----------------------------
  function drag(simulation) {
    return d3.drag()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
  }

  // -----------------------------
  // DATA LOAD
  // -----------------------------
  let graphData;

  fetch("assets/data/les_miserables.json")
    .then(r => r.json())
    .then(data => {
      graphData = data;

      initStep1();
      initStep2();
      initStep3();
      initStep4();
      initStep5();
      initStep6();
    });

  // =========================================================
  // STEP 1 — Rohdaten (nur Struktur sichtbar)
  // =========================================================
  function initStep1() {
    const el = d3.select("#graph-step1");
    if (el.empty()) return;
    const list = el.append("div").attr("class", "link-list");

    list.selectAll(".link-item")
      .data(graphData.links)
      .join("div")
      .attr("class", "link-item")
      .html(d => {
        const src = (typeof d.source === 'number') ? (graphData.nodes[d.source] && (graphData.nodes[d.source].name || graphData.nodes[d.source].id)) : (d.source && (d.source.name || d.source.id));
        const tgt = (typeof d.target === 'number') ? (graphData.nodes[d.target] && (graphData.nodes[d.target].name || graphData.nodes[d.target].id)) : (d.target && (d.target.name || d.target.id));
        return `<span class="node-badge">${src || '—'}</span><span class="sep">—</span><span class="node-badge">${tgt || '—'}</span>`;
      });
  }

  // =========================================================
  // STEP 2 — Random node distribution (no edges)
  // =========================================================
  function initStep2() {
    const el = d3.select("#graph-step2");
    if (el.empty()) return;

    const degree = new Array(graphData.nodes.length).fill(0);
    graphData.links.forEach(l => {
      const s = (typeof l.source === 'number') ? l.source : (l.source && l.source.index);
      const t = (typeof l.target === 'number') ? l.target : (l.target && l.target.index);
      if (typeof s === 'number') degree[s]++;
      if (typeof t === 'number') degree[t]++;
    });

    const tooltip = d3.select("body")
      .append("div")
      .attr("id", "tooltip")
      .style("display", "none");

    const svg = el.append("svg")
      .attr("viewBox", [0, 0, width, height]);

    const nodeRadius = 5;
    const positioned = graphData.nodes.map(d => ({
      ...d,
      x: nodeRadius + Math.random() * (width - nodeRadius * 2),
      y: nodeRadius + Math.random() * (height - nodeRadius * 2)
    }));

    const iconNodes = positioned.filter(d => characterIconMap[d.name]);
    const iconGroup = createCharacterIcons(svg, iconNodes);

    const links = svg.append("g")
        .selectAll("line")
        .data(graphData.links)
        .join("line")
        .attr("stroke", "#bbb")
        .attr("stroke-opacity", 0.4)
        .attr("x1", d => {
            const s = graphData.nodes[d.source];
            return positioned[d.source]?.x ?? 0;
        })
        .attr("y1", d => positioned[d.source]?.y ?? 0)
        .attr("x2", d => positioned[d.target]?.x ?? 0)
        .attr("y2", d => positioned[d.target]?.y ?? 0);
        
    const nodeCircles = svg.append("g")
      .selectAll("circle")
      .data(positioned)
      .join("circle")
      .attr("class", d => characterIconMap[d.name] ? "character-node" : null)
      .attr("r", nodeRadius)
      .attr("fill", "#2563eb")
      .attr("opacity", 0.95)
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .on("mouseover", (event, d, i) => {
        tooltip
          .style("display", "block")
          .html(`${d.name || d.id || 'unbekannt'}`);
      })
      .on("mousemove", (event) => {
        tooltip
          .style("left", `${event.pageX + 10}px`)
          .style("top", `${event.pageY + 10}px`);
      })
      .on("mouseout", () => {
        tooltip.style("display", "none");
      });

    const hideSelection = nodeCircles.filter(d => characterIconMap[d.name]);
    createCharacterToggle(el, iconGroup, hideSelection);
  }

  // =========================================================
  // STEP 3 — Force-directed simulation (with multiple links)
  // =========================================================
  function initStep3() {
    const el = d3.select("#graph-step3");
    if (el.empty()) return;

    const svg = el.append("svg")
      .attr("viewBox", [0, 0, width, height]);

    const N = 30;
    const degree = new Array(graphData.nodes.length).fill(0);
    graphData.links.forEach(l => {
      const s = (typeof l.source === 'number') ? l.source : (l.source && l.source.index);
      const t = (typeof l.target === 'number') ? l.target : (l.target && l.target.index);
      if (typeof s === 'number') degree[s]++;
      if (typeof t === 'number') degree[t]++;
    });

    const indices = graphData.nodes.map((_, i) => i);
    indices.sort((a, b) => degree[b] - degree[a]);
    const selected = new Set(indices.slice(0, Math.min(N, indices.length)));

    const nodesSub = [];
    const idMap = new Map();
    Array.from(selected).forEach(origIdx => {
      const src = Object.assign({}, graphData.nodes[origIdx]);
      src._origIndex = origIdx;
      src.speed = 0.5 + Math.random() * 1.5;
      src.chargeStrength = -70 - Math.random() * 100;
      src.damping = 0.15 + Math.random() * 0.1;
      nodesSub.push(src);
      idMap.set(origIdx, src);
    });

    const linksSub = graphData.links
      .filter(l => {
        const s = (typeof l.source === 'number') ? l.source : (l.source && l.source.index);
        const t = (typeof l.target === 'number') ? l.target : (l.target && l.target.index);
        return selected.has(s) && selected.has(t);
      })
      .map(l => {
        const s = (typeof l.source === 'number') ? l.source : (l.source && l.source.index);
        const t = (typeof l.target === 'number') ? l.target : (l.target && l.target.index);
        return { source: idMap.get(s), target: idMap.get(t), value: l.value };
      });

    const nodeRadius = 7;
    const link = svg.append("g")
      .selectAll("line")
      .data(linksSub)
      .join("line")
      .attr("stroke", "#bbb")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 1.2);

    const nodeG = svg.append("g")
      .selectAll("g")
      .data(nodesSub)
      .join("g");

    const circleSelection = nodeG.append("circle")
      .attr("r", nodeRadius)
      .attr("fill", "#1d4ed8")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)
      .attr("opacity", 0.95);

    nodeG.raise();

    const sim = d3.forceSimulation(nodesSub)
      .velocityDecay(0.16)
      .alphaDecay(0.01)
      .force("link", d3.forceLink(linksSub).distance(130).strength(0.7))
      .force("charge", d3.forceManyBody().strength(d => d.chargeStrength))
      .force("collide", d3.forceCollide(nodeRadius + 14))
      .force("x", d3.forceX(width/2).strength(0.03))
      .force("y", d3.forceY(height/2).strength(0.03));

    sim.alpha(0.9).alphaTarget(0.12).restart();

    nodeG.call(drag(sim));

    sim.on("tick", () => {
      nodesSub.forEach(d => {
        d.vx += (Math.random() - 0.5) * 0.12 * d.speed;
        d.vy += (Math.random() - 0.5) * 0.12 * d.speed;
        d.vx *= 1 - Math.max(0.05, d.damping * 0.6);
        d.vy *= 1 - Math.max(0.05, d.damping * 0.6);
      });

      nodesSub.forEach(d => {
        d.x = Math.max(nodeRadius, Math.min(width - nodeRadius, d.x));
        d.y = Math.max(nodeRadius, Math.min(height - nodeRadius, d.y));
      });

      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      nodeG.attr("transform", d => `translate(${d.x},${d.y})`);
    });
  }

  // =========================================================
  // STEP 4 — D3 Force Simulation (klassisch)
  // =========================================================
  function initStep4() {
    const el = d3.select("#graph-step4");
    if (el.empty()) return;

    const svg = el.append("svg")
      .attr("viewBox", [0, 0, width, height]);

    const nodeRadius = 3;
    const sim = d3.forceSimulation(graphData.nodes)
      .force("link", d3.forceLink(graphData.links).distance(30))
      .force("charge", d3.forceManyBody())
      .force("collide", d3.forceCollide(nodeRadius * 2))
      .force("center", d3.forceCenter(width/2, height/2));

    const link = svg.append("g")
      .selectAll("line")
      .data(graphData.links)
      .join("line")
      .attr("stroke", "#ccc");

    const node = svg.append("g")
      .selectAll("circle")
      .data(graphData.nodes)
      .join("circle")
      .attr("r", 5)
      .attr("fill", "#444");

      node
        .on("mouseover", (event, d) => {
            tooltip
            .style("display", "block")
            .html(d.name)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY + 10) + "px");
        })
        .on("mousemove", (event) => {
            tooltip
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY + 10) + "px");
        })
        .on("mouseout", () => {
            tooltip.style("display", "none");
        });

    const iconNodes = graphData.nodes.filter(d => characterIconMap[d.name]);
    const iconGroup = createCharacterIcons(svg, iconNodes);

    const hideSelection = node.filter(d => characterIconMap[d.name]);
    createCharacterToggle(el, iconGroup, hideSelection);
    
    sim.on("tick", () => {
      // keep nodes inside the SVG bounds
      graphData.nodes.forEach(d => {
        d.x = Math.max(nodeRadius, Math.min(width - nodeRadius, d.x));
        d.y = Math.max(nodeRadius, Math.min(height - nodeRadius, d.y));
      });

iconGroup.selectAll("image")
      .attr("x", d => d.x - 20)
      .attr("y", d => d.y - 20);

      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);
    });
  }

// ==========================================================
// STEP 5
// ==========================================================
function initStep5() {
  const el = d3.select("#graph-step5");
  if (el.empty()) return;

  const svg = el.append("svg")
    .attr("viewBox", [0, 0, width, height]);

  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("display", "none")
    .style("background", "rgba(0,0,0,0.7)")
    .style("color", "#fff")
    .style("padding", "6px 8px")
    .style("border-radius", "4px")
    .style("font-size", "12px");

  // Knoten + Links direkt verwenden
  const nodes = graphData.nodes.map((d, i) => ({
    ...d,
    id: i
  }));

  const links = graphData.links.map(d => ({
    source: typeof d.source === "object" ? d.source.index : d.source,
    target: typeof d.target === "object" ? d.target.index : d.target
  }));

  const color = d3.scaleOrdinal(d3.schemeCategory10);

  const link = svg.append("g")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", "#bbb")
    .attr("stroke-opacity", 0.5);

  const node = svg.append("g")
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("r", 5)
    .attr("fill", d => color(d.group))
    .call(drag(d3.forceSimulation(nodes)));

  const iconNodes = nodes.filter(d => characterIconMap[d.name]);
  const iconGroup = createCharacterIcons(svg, iconNodes);

  const sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(30))
    .force("charge", d3.forceManyBody().strength(-40))
    .force("center", d3.forceCenter(width / 2, height / 2));

  node
    .on("mouseover", (event, d) => {
      tooltip
        .style("display", "block")
        .html(d.name)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY + 10) + "px");

      node.attr("opacity", n =>
        n.id === d.id ? 1 : 0.3
      );

      link.attr("stroke", l =>
        l.source.id === d.id || l.target.id === d.id
          ? "black"
          : "#ccc"
      );
    })
    .on("mouseout", () => {
      tooltip.style("display", "none");
      node.attr("opacity", 1);
      link.attr("stroke", "#bbb");
    })
    .call(drag(sim));

  sim.on("tick", () => {
    iconGroup.selectAll("image")
        .attr("x", d => d.x - 30)
        .attr("y", d => d.y - 30)
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);

    node
      .attr("cx", d => d.x)
      .attr("cy", d => d.y);
  });
  const hideSelection = node.filter(d => characterIconMap[d.name]);
  createCharacterToggle(el, iconGroup, hideSelection);
}

  // =========================================================
  // STEP 6 — Skalierbarer Force-Directed Graph
  // =========================================================
  function initStep6() {
    const el = d3.select("#graph-step6");
    if (el.empty()) return;

    function renderGraph() {
      el.selectAll("*").remove();
      const svg = el.append("svg")
        .attr("viewBox", [0, 0, width, height]);

      const { nodes, links } = buildScaledGraph();
      const nodeRadiusFinal = 5;

      const link = svg.append("g")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke", "#bbb")
        .attr("stroke-width", 1)
        .attr("opacity", 0.6);

      const node = svg.append("g")
        .selectAll("circle")
        .data(nodes)
        .join("circle")
        .attr("r", nodeRadiusFinal)
        .attr("fill", "#666");

      const sim = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(10).strength(0.3))
        .force("charge", d3.forceManyBody().strength(-10))
        .force("center", d3.forceCenter(width/2, height/2).strength(0.2));

      node.call(drag(sim));

      createScaleControls(el, renderGraph);

      node.on("mouseover", (e, d) => {
        const id = d._origIndex;
        link.attr("stroke", l =>
            l.source._origIndex === id || l.target._origIndex === id ? "black" : "#ccc"
        );
      });

      sim.on("tick", () => {
        nodes.forEach(d => {
            d.x = Math.max(nodeRadiusFinal, Math.min(width - nodeRadiusFinal, d.x));
            d.y = Math.max(nodeRadiusFinal, Math.min(height - nodeRadiusFinal, d.y));
        });

        link
          .attr("x1", d => d.source.x)
          .attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x)
          .attr("y2", d => d.target.y);

        node
          .attr("cx", d => d.x)
          .attr("cy", d => d.y);
      });
    }
    renderGraph();
  }

})();