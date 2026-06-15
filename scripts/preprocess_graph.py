"""Preprocess the SNAP wiki-Vote social graph into a compact JSON for the
D3 canvas stress-layout visualization used in section 3b of the website.

Pipeline:
  1. Read the edge list (skips `#` comment lines, tab/space separated).
  2. Build an UNDIRECTED graph (the directed votes are collapsed so the
     layout does not have to draw ~104k arrowheads) and keep the
     largest connected component.
  3. Remap the sparse SNAP node ids to a contiguous 0..N-1 range.
  4. Compute per-node in-degree (votes received) on the original directed
     graph, used for node sizing so hubs stand out.
  5. Detect communities with Louvain on the undirected projection, used for
     node coloring (the global-structure cue that replaces the ego cue of 3a).
  6. Compute a global stress-majorization layout (NetworkX energy method) and
     normalize coordinates.
  7. Write nodes (id, x, y, group, deg) and links (index pairs) to JSON.

Run once locally (deps in requirements.txt) and commit the resulting JSON;
the website / CI only consumes the static file.

    python scripts/preprocess_graph.py
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import networkx as nx
import community as community_louvain

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "wiki-Vote.txt.gz"
OUT = ROOT / "assets" / "data" / "social_graph.json"

STRESS_ITERATIONS = 500
STRESS_THRESHOLD = 1e-4
LAYOUT_SCALE = 1000.0  # half-width/height of the normalized coordinate box


def read_directed_graph(path: Path) -> nx.DiGraph:
    """Read the SNAP edge list into a directed graph, skipping comments."""
    opener = gzip.open if path.suffix == ".gz" else open
    g = nx.DiGraph()
    with opener(path, "rt") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            src, dst = line.split()[:2]
            g.add_edge(int(src), int(dst))
    return g


def largest_component_undirected(digraph: nx.DiGraph) -> nx.Graph:
    """Collapse to undirected and keep the largest connected component."""
    undirected = digraph.to_undirected()
    largest = max(nx.connected_components(undirected), key=len)
    return undirected.subgraph(largest).copy()


def compute_layout(graph: nx.Graph) -> dict[int, tuple[float, float]]:
    """Global stress layout via NetworkX energy optimization."""
    return nx.spring_layout(
        graph,
        method="energy",
        iterations=STRESS_ITERATIONS,
        threshold=STRESS_THRESHOLD,
        seed=42,
    )


def normalize(positions: dict[int, tuple[float, float]]) -> dict[int, tuple[float, float]]:
    """Center positions and scale into a [-LAYOUT_SCALE, LAYOUT_SCALE] box."""
    xs = [p[0] for p in positions.values()]
    ys = [p[1] for p in positions.values()]
    cx, cy = (min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0
    span = max(max(xs) - min(xs), max(ys) - min(ys)) or 1.0
    factor = (2.0 * LAYOUT_SCALE) / span
    return {
        node: ((x - cx) * factor, (y - cy) * factor)
        for node, (x, y) in positions.items()
    }


def main() -> None:
    if not RAW.exists():
        raise SystemExit(
            f"Missing raw data at {RAW}.\n"
            "Download it first:\n"
            "  curl -sSL https://snap.stanford.edu/data/wiki-Vote.txt.gz "
            "-o data/wiki-Vote.txt.gz"
        )

    print(f"Reading {RAW} ...")
    digraph = read_directed_graph(RAW)
    print(f"  directed: {digraph.number_of_nodes()} nodes, "
          f"{digraph.number_of_edges()} edges")

    graph = largest_component_undirected(digraph)
    print(f"  undirected largest component: {graph.number_of_nodes()} nodes, "
          f"{graph.number_of_edges()} edges")

    print("Detecting communities (Louvain) ...")
    partition = community_louvain.best_partition(graph, random_state=42)
    num_communities = len(set(partition.values()))
    print(f"  {num_communities} communities")

    print(f"Computing stress layout (energy method, {STRESS_ITERATIONS} iterations) ...")
    positions = normalize(compute_layout(graph))

    # in-degree (votes received) from the original directed graph, for sizing
    in_degree = dict(digraph.in_degree())

    index_of = {node: i for i, node in enumerate(graph.nodes())}
    nodes = []
    for node in graph.nodes():
        x, y = positions[node]
        nodes.append({
            "id": int(node),
            "x": round(x, 2),
            "y": round(y, 2),
            "group": int(partition[node]),
            "deg": int(in_degree.get(node, 0)),
        })

    links = [[index_of[u], index_of[v]] for u, v in graph.edges()]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w") as fh:
        json.dump({"nodes": nodes, "links": links}, fh, separators=(",", ":"))

    size_mb = OUT.stat().st_size / (1024 * 1024)
    print(f"Wrote {OUT} ({len(nodes)} nodes, {len(links)} links, "
          f"{size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
