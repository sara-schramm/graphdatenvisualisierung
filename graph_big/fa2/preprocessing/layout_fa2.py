import networkx as nx
import pandas as pd
from fa2 import ForceAtlas2
import json
import os

# ── 1. Pfade ──────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))         
DATA_DIR   = os.path.join(BASE_DIR, "../../data_facebook_large")
GRAPH_DIR  = os.path.join(BASE_DIR, "..")                        

EDGES_CSV      = os.path.join(DATA_DIR, "musae_facebook_edges.csv")
TARGET_CSV     = os.path.join(DATA_DIR, "musae_facebook_target.csv")
COMMUNITY_JSON = os.path.join(BASE_DIR, "communities.json")     
OUTPUT_JSON    = os.path.join(GRAPH_DIR, "graph.json")           

# ── 2. Graph laden ────────────────────────────────────────────────────────────
print("Lade Graph ...")
edges_df  = pd.read_csv(EDGES_CSV)
target_df = pd.read_csv(TARGET_CSV)

G = nx.from_pandas_edgelist(edges_df, source="id_1", target="id_2")
label_map = dict(zip(target_df["id"], target_df["page_type"]))
name_map = dict(zip(target_df["id"], target_df["page_name"]))
nx.set_node_attributes(G, label_map, name="category")

print(f"  Knoten: {G.number_of_nodes()}, Kanten: {G.number_of_edges()}")

# ── 3. Communities laden ──────────────────────────────────────────────────────
print("Lade Communities ...")
with open(COMMUNITY_JSON, "r") as f:
    community_map = json.load(f)
community_map = {int(k): v for k, v in community_map.items()}

# ── 4. ForceAtlas2 Layout berechnen ──────────────────────────────────────────
print("Berechne ForceAtlas2-Layout ...")

forceatlas2 = ForceAtlas2(
    outboundAttractionDistribution=True,
    edgeWeightInfluence=1.0,
    jitterTolerance=1.0,
    barnesHutOptimize=True,
    barnesHutTheta=1.2,
    scalingRatio=10,  
    strongGravityMode=False,
    gravity=0.5,
    verbose=True,
)

positions = forceatlas2.forceatlas2_networkx_layout(G, pos=None, iterations=1000)

print("  Layout fertig.")

# ── 5. graph.json zusammenbauen ───────────────────────────────────────────────
print("Exportiere graph.json ...")

nodes = []

for node_id, (x, y) in positions.items():
    nodes.append({
        "id":        node_id,
        "x":         x,
        "y":         y,
        "community": community_map.get(node_id, -1),
        "category":  G.nodes[node_id].get("category", "unknown"),
        "name":      name_map.get(node_id, str(node_id)),
    })

edges = [
    {"source": int(u), "target": int(v)}
    for u, v in G.edges()
]

graph_data = {"nodes": nodes, "edges": edges}

with open(OUTPUT_JSON, "w") as f:
    json.dump(graph_data, f)

print(f"  graph.json gespeichert → {OUTPUT_JSON}")
print(f"  {len(nodes)} Nodes, {len(edges)} Edges")