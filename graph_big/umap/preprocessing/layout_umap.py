import networkx as nx
import pandas as pd
import numpy as np
import umap
import json
import os

# ── 1. Pfade ──────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_DIR       = os.path.join(BASE_DIR, "../../data_facebook_large")
GRAPH_DIR  = os.path.join(BASE_DIR, "..")

EDGES_CSV      = os.path.join(DATA_DIR, "musae_facebook_edges.csv")
TARGET_CSV     = os.path.join(DATA_DIR, "musae_facebook_target.csv")
FEATURES_JSON  = os.path.join(DATA_DIR, "musae_facebook_features.json")
COMMUNITY_JSON = os.path.join(BASE_DIR, "../../fa2/preprocessing/communities.json")
OUTPUT_JSON    = os.path.join(BASE_DIR, "../graph_umap.json")

# ── 2. Graph laden ────────────────────────────────────────────────────────────
print("Lade Graph ...")
edges_df  = pd.read_csv(EDGES_CSV)
target_df = pd.read_csv(TARGET_CSV)

G = nx.from_pandas_edgelist(edges_df, source="id_1", target="id_2")
label_map = dict(zip(target_df["id"], target_df["page_type"]))
name_map  = dict(zip(target_df["id"], target_df["page_name"]))
nx.set_node_attributes(G, label_map, name="category")

print(f"  Knoten: {G.number_of_nodes()}, Kanten: {G.number_of_edges()}")

# ── 3. Communities laden ──────────────────────────────────────────────────────
print("Lade Communities ...")
with open(COMMUNITY_JSON, "r") as f:
    community_map = json.load(f)
community_map = {int(k): v for k, v in community_map.items()}

# ── 4. Feature-Matrix aufbauen ────────────────────────────────────────────────
# Die MUSAE-Features sind sparse: jeder Wert ist eine Liste von aktiven Feature-Indizes,
# kein dichter Vektor. Wir bauen eine binäre One-Hot-Matrix daraus.
print("Lade Features ...")
with open(FEATURES_JSON, "r") as f:
    features_raw = json.load(f)

num_nodes    = len(features_raw)
all_indices  = [idx for feat_list in features_raw.values() for idx in feat_list]
num_features = max(all_indices) + 1
print(f"  {num_nodes} Nodes × {num_features} Features (sparse → dense)")

feature_matrix = np.zeros((num_nodes, num_features), dtype=np.float32)
for node_id_str, feat_indices in features_raw.items():
    feature_matrix[int(node_id_str), feat_indices] = 1.0

# ── 5. UMAP Layout berechnen ──────────────────────────────────────────────────
print("Berechne UMAP-Layout ...")

reducer = umap.UMAP(
    n_components=2,
    n_neighbors=15,
    min_dist=0.1,
    random_state=42,
    verbose=True,
)

embedding = reducer.fit_transform(feature_matrix)
print("  Layout fertig.")
print(f"  X range: {embedding[:,0].min():.2f} – {embedding[:,0].max():.2f}")
print(f"  Y range: {embedding[:,1].min():.2f} – {embedding[:,1].max():.2f}")

# ── 6. graph_umap.json zusammenbauen ─────────────────────────────────────────
print("Exportiere graph_umap.json ...")

nodes = []
for node_id in G.nodes():
    nodes.append({
        "id":        node_id,
        "x":         float(embedding[node_id][0]),
        "y":         float(embedding[node_id][1]),
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

print(f"  graph_umap.json gespeichert → {OUTPUT_JSON}")
print(f"  {len(nodes)} Nodes, {len(edges)} Edges")