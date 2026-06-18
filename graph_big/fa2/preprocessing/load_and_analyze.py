import pandas as pd
import json
import networkx as nx
from pathlib import Path



BASE = Path(__file__).parent.parent.parent / "data_facebook_large"

# ── 1. Daten laden ──────────────────────────────────────────────
print("=== Lade Daten... ===\n")

edges   = pd.read_csv(BASE / "musae_facebook_edges.csv")   # ← BASE / davor!
targets = pd.read_csv(BASE / "musae_facebook_target.csv")  # ← BASE / davor!

with open(BASE / "musae_facebook_features.json", "r") as f:
    features = json.load(f)

# ── 2. Rohe Daten checken ───────────────────────────────────────
print("--- edges.csv (erste 5 Zeilen) ---")
print(edges.head())
print(f"\nSpalten: {list(edges.columns)}")
print(f"Anzahl Kanten: {len(edges):,}\n")

print("--- target.csv (erste 5 Zeilen) ---")
print(targets.head())
print(f"\nSpalten: {list(targets.columns)}")
print(f"Anzahl Nodes: {len(targets):,}\n")

# ── 3. Label-Verteilung ─────────────────────────────────────────
print("--- Node-Kategorien ---")
if "page_type" in targets.columns:
    print(targets["page_type"].value_counts())
elif "target" in targets.columns:
    print(targets["target"].value_counts())
print()

# ── 4. Graph bauen und Basis-Stats ─────────────────────────────
print("=== Baue NetworkX Graph... ===")
G = nx.from_pandas_edgelist(edges, source=edges.columns[0], target=edges.columns[1])

print(f"Nodes:    {G.number_of_nodes():,}")
print(f"Edges:    {G.number_of_edges():,}")
print(f"Density:  {nx.density(G):.4f}")
print(f"Directed: {G.is_directed()}\n")

label_map = dict(zip(targets['id'], targets['page_type']))
nx.set_node_attributes(G, label_map, 'category')

name_map = dict(zip(targets['id'], targets['page_name']))
nx.set_node_attributes(G, name_map, 'name')

# Checken ob es geklappt hat
sample_node = list(G.nodes())[0]
print(G.nodes[sample_node])

# ── 5. Degree-Statistiken ───────────────────────────────────────
degrees = [d for _, d in G.degree()]
deg_series = pd.Series(degrees)

print("--- Degree-Verteilung ---")
print(deg_series.describe().round(2))
print(f"\nTop 5 Hubs (höchster Degree):")
top5 = sorted(G.degree(), key=lambda x: x[1], reverse=True)[:5]
for node, deg in top5:
    label = targets[targets.iloc[:, 0] == node].iloc[0, -1] if node in targets.iloc[:, 0].values else "?"
    print(f"  Node {node:5d} → Degree {deg:4d}  | Kategorie: {label}")

# ── 6. Komponenten ──────────────────────────────────────────────
print(f"\n--- Verbundenheit ---")
components = list(nx.connected_components(G))
print(f"Anzahl Connected Components: {len(components)}")
print(f"Größte Komponente: {max(len(c) for c in components):,} Nodes")
print(f"Isolierte Nodes:   {sum(1 for c in components if len(c) == 1)}")

# ── 7. Features kurz checken ────────────────────────────────────
print(f"\n--- Features (JSON) ---")
sample_key = list(features.keys())[0]
print(f"Beispiel Node '{sample_key}': {len(features[sample_key])} Features")
print(f"Feature-Werte (erste 10): {features[sample_key][:10]}")
print(f"\nTotal Nodes mit Features: {len(features):,}")