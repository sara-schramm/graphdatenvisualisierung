#!/usr/bin/env python3
"""Generate static figures for the Reveal.js presentation on graph visualization.

Uses synthetic small graphs for schematics and optionally samples positions from
graph_medium/stress/social_graph.json for one real-layout thumbnail. No raw SNAP data or
ForceAtlas2 run required.

    python scripts/generate_presentation_figures.py
    python scripts/generate_presentation_figures.py --no-real-sample
"""

from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.lines import Line2D
from matplotlib.patches import FancyBboxPatch, Rectangle
import networkx as nx
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "presentation" / "assets"
SOCIAL_GRAPH = ROOT / "graph_medium" / "stress" / "social_graph.json"

# Presentation palette (readable on projector, aligned with cosmo-ish blues)
C_BG = "#fafafa"
C_TEXT = "#1a1a2e"
C_MUTED = "#6c757d"
C_ACCENT = "#2780e3"
C_ACCENT2 = "#ff7518"
C_GOOD = "#3fb618"
C_BAD = "#ff0039"
C_SPRING = "#5bc0de"
C_CHARGE = "#e83e8c"
COMMUNITY_COLORS = [
    "#2780e3",
    "#ff7518",
    "#3fb618",
    "#9954bb",
    "#ff0039",
    "#17a2b8",
    "#ffc107",
]


def setup_style() -> None:
    plt.rcParams.update(
        {
            "figure.facecolor": C_BG,
            "axes.facecolor": C_BG,
            "savefig.facecolor": C_BG,
            "text.color": C_TEXT,
            "axes.labelcolor": C_TEXT,
            "xtick.color": C_TEXT,
            "ytick.color": C_TEXT,
            "font.family": "sans-serif",
            "font.size": 11,
            "axes.titlesize": 13,
            "axes.titleweight": "bold",
        }
    )


def save(fig: plt.Figure, name: str) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / name
    fig.savefig(path, dpi=180, bbox_inches="tight", pad_inches=0.12)
    plt.close(fig)
    print(f"  wrote {path.relative_to(ROOT)}")
    return path


def draw_graph(
    ax: plt.Axes,
    g: nx.Graph,
    pos: dict,
    *,
    node_color: str | list[str] = C_ACCENT,
    node_size: float = 220,
    edge_alpha: float = 0.35,
    edge_width: float = 0.8,
    with_labels: bool = False,
) -> None:
    ax.set_aspect("equal")
    ax.axis("off")
    nx.draw_networkx_edges(
        g,
        pos,
        ax=ax,
        edge_color="#888888",
        alpha=edge_alpha,
        width=edge_width,
        arrows=False,
    )
    nx.draw_networkx_nodes(
        g,
        pos,
        ax=ax,
        node_color=node_color,
        node_size=node_size,
        edgecolors="white",
        linewidths=0.6,
    )
    if with_labels:
        nx.draw_networkx_labels(g, pos, ax=ax, font_size=7, font_color=C_TEXT)


def make_demo_graph(seed: int = 42) -> nx.Graph:
    """Small graph with visible community structure (~24 nodes)."""
    rng = random.Random(seed)
    g = nx.Graph()
    centers = [(0, 0), (3.5, 0.5), (-2.5, 3), (1.5, -3)]
    node_id = 0
    for ci, (cx, cy) in enumerate(centers):
        members = []
        for _ in range(rng.randint(4, 7)):
            g.add_node(node_id, community=ci)
            members.append(node_id)
            node_id += 1
        for u in members:
            for v in members:
                if u < v and rng.random() < 0.55:
                    g.add_edge(u, v)
        hub = rng.choice(members)
        for v in members:
            if v != hub and rng.random() < 0.35:
                g.add_edge(hub, v)
    # sparse bridges between communities
    groups = [n for n, d in g.nodes(data=True) if d["community"] == 0]
    groups2 = [n for n, d in g.nodes(data=True) if d["community"] == 1]
    if groups and groups2:
        g.add_edge(rng.choice(groups), rng.choice(groups2))
    return g


def hairball_positions(g: nx.Graph, seed: int = 0) -> dict:
    rng = np.random.default_rng(seed)
    return {n: (float(rng.uniform(-1, 1)), float(rng.uniform(-1, 1))) for n in g.nodes()}


def simple_force_layout(
    g: nx.Graph,
    *,
    charge: float = -120.0,
    link_distance: float = 0.8,
    link_strength: float = 0.05,
    center_strength: float = 0.02,
    iterations: int = 200,
    seed: int = 42,
) -> tuple[dict, list[float]]:
    """Minimal force simulation returning positions and energy trace."""
    rng = np.random.default_rng(seed)
    nodes = list(g.nodes())
    n = len(nodes)
    idx = {node: i for i, node in enumerate(nodes)}
    pos = rng.uniform(-1, 1, (n, 2))
    vel = np.zeros((n, 2))
    energy_trace: list[float] = []

    edges = [(idx[u], idx[v]) for u, v in g.edges()]

    for _ in range(iterations):
        forces = np.zeros((n, 2))

        # link springs (Hooke)
        for i, j in edges:
            delta = pos[j] - pos[i]
            dist = np.linalg.norm(delta) + 1e-6
            direction = delta / dist
            stretch = dist - link_distance
            f = link_strength * stretch * direction
            forces[i] += f
            forces[j] -= f

        # repulsion (all pairs, fine for small n)
        for i in range(n):
            for j in range(i + 1, n):
                delta = pos[i] - pos[j]
                dist2 = np.dot(delta, delta) + 1e-4
                dist = math.sqrt(dist2)
                direction = delta / dist
                f = charge / dist2
                forces[i] += f * direction
                forces[j] -= f * direction

        # weak gravity to center
        forces -= center_strength * pos

        vel = (vel + forces) * 0.85
        pos += vel

        kinetic = float(np.sum(vel**2))
        potential = 0.0
        for i, j in edges:
            d = np.linalg.norm(pos[i] - pos[j])
            potential += 0.5 * link_strength * (d - link_distance) ** 2
        energy_trace.append(kinetic + abs(potential))

    return {nodes[i]: (float(pos[i, 0]), float(pos[i, 1])) for i in range(n)}, energy_trace


def fig01_hairball_vs_layout() -> None:
    g = make_demo_graph()
    pos_bad = hairball_positions(g)
    pos_good, _ = simple_force_layout(g, charge=-80, link_distance=0.9, iterations=250)

    fig, axes = plt.subplots(1, 2, figsize=(10, 4.8))
    fig.suptitle("Gleicher Graph — unterschiedliche Positionierung", y=1.02)

    draw_graph(axes[0], g, pos_bad, edge_alpha=0.55, edge_width=1.0)
    axes[0].set_title("Hairball (zufällige Startpositionen)", color=C_BAD)
    axes[0].text(
        0.5,
        -0.08,
        "Kanten kreuzen sich dicht → Communities unsichtbar",
        transform=axes[0].transAxes,
        ha="center",
        fontsize=9,
        color=C_MUTED,
    )

    colors = [COMMUNITY_COLORS[d["community"] % len(COMMUNITY_COLORS)] for _, d in g.nodes(data=True)]
    draw_graph(axes[1], g, pos_good, node_color=colors, edge_alpha=0.4)
    axes[1].set_title("Force-directed Layout (Struktur sichtbar)", color=C_GOOD)
    axes[1].text(
        0.5,
        -0.08,
        "Dichte Cluster + wenige Brücken werden lesbar",
        transform=axes[1].transAxes,
        ha="center",
        fontsize=9,
        color=C_MUTED,
    )

    legend = [
        mpatches.Patch(color=COMMUNITY_COLORS[i], label=f"Community {i + 1}") for i in range(4)
    ]
    fig.legend(handles=legend, loc="lower center", ncol=4, frameon=False, fontsize=8)
    save(fig, "fig01_hairball_vs_layout.png")


def fig02_force_model() -> None:
    fig, ax = plt.subplots(figsize=(9, 5.5))
    ax.set_xlim(-0.5, 10)
    ax.set_ylim(-0.5, 6.5)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_title("Kräftemodell: Federn (Anziehung) + Ladungen (Abstoßung)")

    nodes = {
        "A": (1.5, 3.5),
        "B": (4.0, 4.8),
        "C": (6.5, 3.2),
        "D": (3.0, 1.5),
        "E": (7.0, 1.8),
    }
    edges = [("A", "B"), ("B", "C"), ("A", "D"), ("C", "E"), ("D", "E")]

    for u, v in edges:
        x1, y1 = nodes[u]
        x2, y2 = nodes[v]
        ax.plot([x1, x2], [y1, y2], color=C_SPRING, lw=2.5, zorder=1)
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        ax.annotate(
            "",
            xy=(x2, y2),
            xytext=(mx, my),
            arrowprops=dict(arrowstyle="-|>", color=C_SPRING, lw=1.5, shrinkA=12, shrinkB=12),
        )
        ax.text(mx, my + 0.25, "Feder\n(Anziehung)", ha="center", fontsize=8, color=C_SPRING)

    for name, (x, y) in nodes.items():
        circle = plt.Circle((x, y), 0.35, color=C_CHARGE, ec="white", lw=2, zorder=3)
        ax.add_patch(circle)
        ax.text(x, y, "+", ha="center", va="center", color="white", fontsize=14, fontweight="bold", zorder=4)
        ax.text(x, y - 0.65, name, ha="center", fontsize=10, fontweight="bold")

    # repulsion arrows between non-adjacent pair
    ax.annotate(
        "",
        xy=(4.3, 4.5),
        xytext=(2.0, 3.7),
        arrowprops=dict(arrowstyle="<->", color=C_CHARGE, lw=2.0, shrinkA=8, shrinkB=8),
    )
    ax.text(3.0, 4.35, "Abstoßung\n(Many-Body)", ha="center", fontsize=9, color=C_CHARGE)

    ax.text(
        0.05,
        0.04,
        "ForceAtlas2 / d3-force: iterativ ausschwingen bis Energie-Minimum",
        transform=ax.transAxes,
        fontsize=9,
        color=C_MUTED,
    )

    legend = [
        Line2D([0], [0], color=C_SPRING, lw=2.5, label="Link-Kraft (Kanten)"),
        Line2D([0], [0], marker="o", color="w", markerfacecolor=C_CHARGE, markersize=12, label="Knoten-Abstoßung"),
    ]
    ax.legend(handles=legend, loc="upper right", frameon=True, fontsize=9)
    save(fig, "fig02_force_model.png")


def fig03_barnes_hut_quadtree() -> None:
    fig, axes = plt.subplots(1, 2, figsize=(10, 5))
    fig.suptitle("Barnes-Hut: $O(n^2)$ → $O(n \\log n)$ durch räumliche Gruppierung", y=1.02)

    # left: naive all-pairs
    ax = axes[0]
    ax.set_xlim(-0.2, 1.2)
    ax.set_ylim(-0.2, 1.2)
    ax.set_aspect("equal")
    ax.set_title("Naiv: jedes Paar")
    rng = np.random.default_rng(7)
    pts = rng.uniform(0.05, 0.95, (12, 2))
    ax.scatter(pts[:, 0], pts[:, 1], s=60, c=C_ACCENT, zorder=3, edgecolors="white")
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            ax.plot(
                [pts[i, 0], pts[j, 0]],
                [pts[i, 1], pts[j, 1]],
                color="#cccccc",
                lw=0.4,
                alpha=0.35,
            )
    ax.text(0.5, -0.12, "$\\binom{n}{2}$ Vergleiche pro Schritt", transform=ax.transAxes, ha="center", fontsize=9, color=C_BAD)
    ax.axis("off")

    # right: quadtree
    ax = axes[1]
    ax.set_xlim(-0.05, 1.05)
    ax.set_ylim(-0.05, 1.05)
    ax.set_aspect("equal")
    ax.set_title("Barnes-Hut: Quadtree + Schwerpunkte")

    def draw_cell(x0, y0, w, h, depth, max_depth=2):
        rect = Rectangle((x0, y0), w, h, fill=False, ec="#999999", lw=1.0 if depth == 0 else 0.7, ls="-" if depth == 0 else "--")
        ax.add_patch(rect)
        if depth >= max_depth:
            return
        hw, hh = w / 2, h / 2
        for dx, dy in [(0, 0), (hw, 0), (0, hh), (hw, hh)]:
            draw_cell(x0 + dx, y0 + dy, hw, hh, depth + 1, max_depth)

    draw_cell(0, 0, 1, 1, 0, max_depth=2)
    ax.scatter(pts[:, 0], pts[:, 1], s=60, c=C_ACCENT, zorder=3, edgecolors="white")

    # center of mass markers in large cells
    coms = [(0.25, 0.25), (0.75, 0.75), (0.25, 0.75)]
    for cx, cy in coms:
        ax.scatter(cx, cy, s=120, facecolors="none", edgecolors=C_ACCENT2, linewidths=2, zorder=4)
        ax.text(cx, cy, "COM", ha="center", va="center", fontsize=7, color=C_ACCENT2)

    ax.annotate(
        "",
        xy=(0.72, 0.72),
        xytext=(0.15, 0.15),
        arrowprops=dict(arrowstyle="-|>", color=C_GOOD, lw=2),
    )
    ax.text(0.45, 0.55, "Ferne Zelle\n→ ein Schwerpunkt", ha="center", fontsize=9, color=C_GOOD)
    ax.text(0.5, -0.12, "Winkel-Threshold θ entscheidet: Detail vs. Näherung", transform=ax.transAxes, ha="center", fontsize=9, color=C_MUTED)
    ax.axis("off")

    save(fig, "fig03_barnes_hut_quadtree.png")


def fig04_energy_decay() -> None:
    fig, ax1 = plt.subplots(figsize=(8, 4.5))
    steps = np.arange(0, 301)
    alpha = np.exp(-steps / 80)
    energy = 1.2 * np.exp(-steps / 45) + 0.08 * np.exp(-steps / 200) + 0.02
    energy *= 1 + 0.05 * np.sin(steps / 7) * np.exp(-steps / 100)

    ax1.plot(steps, energy, color=C_ACCENT, lw=2.5, label="Systemenergie $E(t)$")
    ax1.set_xlabel("Simulations-Schritt")
    ax1.set_ylabel("Energie (normiert)", color=C_ACCENT)
    ax1.tick_params(axis="y", labelcolor=C_ACCENT)
    ax1.set_title("Konvergenz: Simulated Annealing (α-Abklingen + Reibung)")
    ax1.grid(True, alpha=0.3)

    ax2 = ax1.twinx()
    ax2.plot(steps, alpha, color=C_ACCENT2, lw=2, ls="--", label="Temperatur α")
    ax2.set_ylabel("α (Temperatur)", color=C_ACCENT2)
    ax2.tick_params(axis="y", labelcolor=C_ACCENT2)
    ax2.set_ylim(0, 1.05)

    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, loc="upper right", frameon=True)

    ax1.annotate(
        "Start: heiß,\nstarke Bewegung",
        xy=(15, energy[15]),
        xytext=(60, energy[15] + 0.35),
        arrowprops=dict(arrowstyle="->", color=C_MUTED),
        fontsize=9,
        color=C_MUTED,
    )
    ax1.annotate(
        "Gefroren:\nLayout stabil",
        xy=(280, energy[280]),
        xytext=(200, energy[280] + 0.25),
        arrowprops=dict(arrowstyle="->", color=C_MUTED),
        fontsize=9,
        color=C_MUTED,
    )

    save(fig, "fig04_energy_decay.png")


def fig05_algorithm_comparison() -> None:
    fig, ax = plt.subplots(figsize=(10, 4.2))
    ax.axis("off")
    ax.set_title("Algorithmen im Projekt-Pipeline (Offline vs. Browser)", pad=20)

    rows = [
        ["Algorithmus", "Rolle", "Komplexität", "Wo"],
        ["ForceAtlas2", "Globales Layout", "O(n log n) mit Barnes-Hut", "Offline (Python)"],
        ["Louvain", "Community-Farben", "O(n log n) typisch", "Offline (Python)"],
        ["Barnes-Hut", "Abstoßung approximieren", "O(n log n) pro Schritt", "In ForceAtlas2 / d3-force"],
        ["d3-force", "Interaktive Nachsimulation", "O(n log n) pro Frame", "Browser (Canvas)"],
        ["Quadtree", "Hover / Picking", "O(log n) pro Mausposition", "Browser (Canvas)"],
    ]

    table = ax.table(
        cellText=rows[1:],
        colLabels=rows[0],
        loc="center",
        cellLoc="left",
        colLoc="left",
    )
    table.auto_set_font_size(False)
    table.set_fontsize(9)
    table.scale(1, 1.6)

    for (row, col), cell in table.get_celld().items():
        cell.set_edgecolor("#dddddd")
        if row == 0:
            cell.set_facecolor(C_ACCENT)
            cell.set_text_props(color="white", fontweight="bold")
        elif row % 2 == 0:
            cell.set_facecolor("#f0f4f8")

    # timeline strip below
    timeline_y = 0.08
    stages = [
        ("Rohdaten\nwiki-Vote", 0.08),
        ("preprocess_graph.py\nFA2 + Louvain", 0.32),
        ("social_graph.json\n(x, y, group)", 0.58),
        ("force-graph.js\nCanvas + d3", 0.82),
    ]
    ax.plot([0.06, 0.94], [timeline_y, timeline_y], color=C_MUTED, lw=2, transform=ax.transAxes, clip_on=False)
    for label, x in stages:
        ax.scatter([x], [timeline_y], transform=ax.transAxes, s=80, c=C_ACCENT2, zorder=3, clip_on=False)
        ax.text(x, timeline_y - 0.06, label, transform=ax.transAxes, ha="center", va="top", fontsize=7.5, color=C_MUTED)

    save(fig, "fig05_algorithm_comparison.png")


def fig06_rendering_scale_tiers() -> None:
    fig, ax = plt.subplots(figsize=(10, 5))
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6)
    ax.axis("off")
    ax.set_title("Rendering-Wahl nach Skala (DOM vs. Bitmap vs. GPU)")

    tiers = [
        {
            "x": 1.0,
            "label": "Klein (~350 Knoten)",
            "tech": "SVG / DOM",
            "color": C_GOOD,
            "nodes": "~350",
            "dom": "1 Element\npro Knoten",
            "example": "3a Ego-Netz",
        },
        {
            "x": 4.0,
            "label": "Mittel (~7k Knoten)",
            "tech": "Canvas 2D",
            "color": C_ACCENT,
            "nodes": "~7 000",
            "dom": "1 Canvas\n+ Quadtree",
            "example": "3b wiki-Vote",
        },
        {
            "x": 7.0,
            "label": "Groß (Millionen)",
            "tech": "WebGL / GPU",
            "color": C_ACCENT2,
            "nodes": "10⁶+",
            "dom": "Instancing\nShader-Pipeline",
            "example": "3c Twitter (geplant)",
        },
    ]

    for t in tiers:
        box = FancyBboxPatch(
            (t["x"] - 0.9, 1.2),
            1.8,
            3.8,
            boxstyle="round,pad=0.05,rounding_size=0.15",
            facecolor="white",
            edgecolor=t["color"],
            linewidth=2.5,
        )
        ax.add_patch(box)
        ax.text(t["x"], 4.7, t["label"], ha="center", fontweight="bold", fontsize=10)
        ax.text(t["x"], 4.2, t["tech"], ha="center", fontsize=12, color=t["color"], fontweight="bold")
        ax.text(t["x"], 3.5, f"Knoten: {t['nodes']}", ha="center", fontsize=9)
        ax.text(t["x"], 2.7, t["dom"], ha="center", fontsize=8.5, color=C_MUTED)
        ax.text(t["x"], 1.6, t["example"], ha="center", fontsize=8, style="italic", color=C_MUTED)

    ax.annotate("", xy=(3.0, 3.0), xytext=(2.0, 3.0), arrowprops=dict(arrowstyle="-|>", color=C_MUTED, lw=2))
    ax.annotate("", xy=(6.0, 3.0), xytext=(5.0, 3.0), arrowprops=dict(arrowstyle="-|>", color=C_MUTED, lw=2))
    ax.text(5.0, 0.5, "Wachsende Knotenzahl → weniger DOM, mehr Batch-Rendering", ha="center", fontsize=9, color=C_MUTED)

    save(fig, "fig06_rendering_scale_tiers.png")


def fig07_small_multiples_params() -> None:
    g = make_demo_graph(seed=99)
    configs = [
        ("Schwache Abstoßung\n(kompakt)", {"charge": -30, "link_distance": 0.7}),
        ("Standard\n(ausgewogen)", {"charge": -80, "link_distance": 0.9}),
        ("Starke Abstoßung\n(gespreizt)", {"charge": -200, "link_distance": 0.9}),
        ("Kurze Kanten\n(dichte Cluster)", {"charge": -80, "link_distance": 0.4}),
    ]

    fig, axes = plt.subplots(2, 2, figsize=(9, 8))
    fig.suptitle("Gleicher Graph — Parameter der Kräfte (wie Abstoßung / Kantenlänge)", y=0.98)

    for ax, (title, params) in zip(axes.flat, configs):
        pos, _ = simple_force_layout(g, iterations=220, seed=11, **params)
        colors = [COMMUNITY_COLORS[d["community"] % len(COMMUNITY_COLORS)] for _, d in g.nodes(data=True)]
        draw_graph(ax, g, pos, node_color=colors, node_size=180, edge_alpha=0.45)
        ax.set_title(title, fontsize=10)
        param_text = f"charge={params['charge']}, dist={params['link_distance']}"
        ax.text(0.5, -0.06, param_text, transform=ax.transAxes, ha="center", fontsize=7.5, color=C_MUTED)

    save(fig, "fig07_small_multiples_params.png")


def fig08_wiki_vote_thumbnail(use_real: bool = True) -> None:
    fig, ax = plt.subplots(figsize=(7, 7))
    ax.set_title("wiki-Vote (Stichprobe aus vorberechnetem Layout)")

    if use_real and SOCIAL_GRAPH.exists():
        with SOCIAL_GRAPH.open() as fh:
            data = json.load(fh)
        nodes = data["nodes"]
        links = data["links"]
        rng = random.Random(42)
        sample_idx = set(rng.sample(range(len(nodes)), min(800, len(nodes))))
        idx_map = {old: new for new, old in enumerate(sorted(sample_idx))}
        pos = {}
        groups = {}
        degs = {}
        for new_i, old_i in enumerate(sorted(sample_idx)):
            n = nodes[old_i]
            pos[new_i] = (n["x"], n["y"])
            groups[new_i] = n["group"]
            degs[new_i] = n["deg"]
        g = nx.Graph()
        for i in pos:
            g.add_node(i, group=groups[i], deg=degs[i])
        for u, v in links:
            if u in sample_idx and v in sample_idx:
                g.add_edge(idx_map[u], idx_map[v])
        node_colors = [COMMUNITY_COLORS[groups[n] % len(COMMUNITY_COLORS)] for n in g.nodes()]
        sizes = [30 + 8 * math.sqrt(degs[n]) for n in g.nodes()]
        draw_graph(ax, g, pos, node_color=node_colors, node_size=1, edge_alpha=0.08, edge_width=0.3)
        nx.draw_networkx_nodes(
            g,
            pos,
            ax=ax,
            node_color=node_colors,
            node_size=sizes,
            edgecolors="none",
        )
        ax.text(0.5, -0.02, f"{len(g.nodes())} Knoten (Sample) · Farbe = Louvain · Größe = In-Degree", transform=ax.transAxes, ha="center", fontsize=8, color=C_MUTED)
    else:
        g = nx.barabasi_albert_graph(400, 2, seed=42)
        pos = nx.spring_layout(g, seed=42)
        draw_graph(ax, g, pos, node_color=C_ACCENT, node_size=20, edge_alpha=0.1)
        ax.text(0.5, -0.02, "(Synthetischer Ersatz — social_graph.json nicht gefunden)", transform=ax.transAxes, ha="center", fontsize=8, color=C_MUTED)

    save(fig, "fig08_wiki_vote_thumbnail.png")


def fig09_demo_screenshot_placeholder() -> None:
    fig, ax = plt.subplots(figsize=(10, 5.5))
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    frame = FancyBboxPatch(
        (0.03, 0.08),
        0.94,
        0.84,
        boxstyle="round,pad=0.01,rounding_size=0.02",
        facecolor="#eef2f7",
        edgecolor="#cbd5e0",
        linewidth=2,
    )
    ax.add_patch(frame)

    ax.text(0.5, 0.92, "Screenshot-Platzhalter: Interaktive Canvas-Demo (Abschnitt 3b)", ha="center", fontweight="bold", fontsize=12)
    ax.text(
        0.5,
        0.5,
        "[ Hier Screenshot einfügen:\n  quarto preview → Abschnitt 3b\n  Slider Abstoßung / Kantenlänge sichtbar ]",
        ha="center",
        va="center",
        fontsize=11,
        color=C_MUTED,
        bbox=dict(boxstyle="round", facecolor="white", edgecolor="#cbd5e0"),
    )

    controls = ["Abstoßung", "Kantenlänge", "Hub-Labels", "Neu anordnen"]
    for i, label in enumerate(controls):
        bx = 0.12 + i * 0.2
        rect = Rectangle((bx, 0.14), 0.14, 0.05, facecolor="white", edgecolor=C_ACCENT)
        ax.add_patch(rect)
        ax.text(bx + 0.07, 0.165, label, ha="center", va="center", fontsize=7)

    save(fig, "fig09_demo_screenshot_placeholder.png")


def fig10_louvain_schematic() -> None:
    g = make_demo_graph(seed=7)
    pos, _ = simple_force_layout(g, charge=-70, iterations=200, seed=3)
    fig, ax = plt.subplots(figsize=(7, 5.5))
    ax.set_title("Louvain: Modularität maximieren → Community-Farben")

    for n, data in g.nodes(data=True):
        ci = data["community"]
        nx.draw_networkx_nodes(
            g,
            pos,
            nodelist=[n],
            ax=ax,
            node_color=COMMUNITY_COLORS[ci % len(COMMUNITY_COLORS)],
            node_size=260,
            edgecolors="white",
            linewidths=0.8,
        )
    nx.draw_networkx_edges(g, pos, ax=ax, edge_color="#999999", alpha=0.35, width=0.9)

    # highlight intra vs inter
    ax.annotate(
        "viele Kanten\ninnerhalb",
        xy=pos[0],
        xytext=(pos[0][0] - 1.5, pos[0][1] + 1.2),
        arrowprops=dict(arrowstyle="->", color=C_GOOD),
        fontsize=9,
        color=C_GOOD,
    )
    ax.annotate(
        "wenige Brücken\nzwischen",
        xy=pos[1],
        xytext=(pos[1][0] + 1.0, pos[1][1] + 1.5),
        arrowprops=dict(arrowstyle="->", color=C_BAD),
        fontsize=9,
        color=C_BAD,
    )

    ax.axis("off")
    ax.set_aspect("equal")
    save(fig, "fig10_louvain_schematic.png")


def fig12_quadtree_hover() -> None:
    """Schematic: quadtree cells for Canvas hit-testing (O(log n) hover)."""
    fig, ax = plt.subplots(figsize=(7, 5.5))
    ax.set_title("Quadtree: Mausposition → nächster Knoten in $O(\\log n)$")
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 10)

    # nested quadtree cells
    levels = [
        (0.5, 0.5, 9, 9, 2.0, "#2780e3"),
        (0.5, 0.5, 4.5, 4.5, 1.2, "#5bc0de"),
        (5.5, 0.5, 4, 4.5, 1.0, "#5bc0de"),
        (0.5, 5.5, 4.5, 4, 1.0, "#5bc0de"),
        (5.5, 5.5, 4, 4, 1.0, "#5bc0de"),
        (5.5, 5.5, 2, 2, 0.6, "#ff7518"),
    ]
    for x, y, w, h, lw, color in levels:
        rect = Rectangle((x, y), w, h, fill=False, edgecolor=color, linewidth=lw, linestyle="-")
        ax.add_patch(rect)

    rng = random.Random(12)
    for _ in range(18):
        px = rng.uniform(1, 9)
        py = rng.uniform(1, 9)
        ax.plot(px, py, "o", color=C_ACCENT, markersize=5, alpha=0.85)

    # hovered node
    hx, hy = 7.2, 7.0
    ax.plot(hx, hy, "o", color=C_BAD, markersize=14, markeredgecolor="white", markeredgewidth=1.5)
    ax.annotate(
        "getroffener Knoten",
        xy=(hx, hy),
        xytext=(hx + 0.5, hy + 1.2),
        arrowprops=dict(arrowstyle="->", color=C_BAD),
        fontsize=9,
        color=C_BAD,
    )

    # cursor
    mx, my = 6.8, 6.5
    ax.plot(mx, my, "x", color=C_TEXT, markersize=10, markeredgewidth=2)
    ax.annotate(
        "Maus",
        xy=(mx, my),
        xytext=(mx - 1.5, my - 0.8),
        fontsize=9,
        color=C_TEXT,
    )

    ax.text(
        0.5,
        -0.02,
        "Canvas hat kein DOM pro Knoten → räumliche Suche statt 7.000 Distanztests",
        transform=ax.transAxes,
        fontsize=9,
        color=C_MUTED,
    )
    ax.set_aspect("equal")
    ax.axis("off")
    save(fig, "fig12_quadtree_hover.png")


FIGURE_JOBS = [
    ("fig01", fig01_hairball_vs_layout),
    ("fig02", fig02_force_model),
    ("fig03", fig03_barnes_hut_quadtree),
    ("fig04", fig04_energy_decay),
    ("fig05", fig05_algorithm_comparison),
    ("fig06", fig06_rendering_scale_tiers),
    ("fig07", fig07_small_multiples_params),
    ("fig08", fig08_wiki_vote_thumbnail),
    ("fig09", fig09_demo_screenshot_placeholder),
    ("fig10", fig10_louvain_schematic),
    ("fig12", fig12_quadtree_hover),
]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--no-real-sample",
        action="store_true",
        help="Skip sampling from social_graph.json for fig08",
    )
    parser.add_argument(
        "--only",
        nargs="+",
        choices=[name for name, _ in FIGURE_JOBS],
        help="Generate only selected figures (e.g. --only fig01 fig07)",
    )
    args = parser.parse_args()

    setup_style()
    print(f"Output directory: {OUT_DIR.relative_to(ROOT)}/")

    for name, fn in FIGURE_JOBS:
        if args.only and name not in args.only:
            continue
        print(f"Generating {name} ...")
        if fn is fig08_wiki_vote_thumbnail:
            fn(use_real=not args.no_real_sample)
        else:
            fn()

    print("Done.")


if __name__ == "__main__":
    main()
