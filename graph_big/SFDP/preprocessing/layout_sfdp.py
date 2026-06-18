# sfdp/preprocessing/compute_layout_sfdp.py

import json
import networkx as nx
from pathlib import Path

# --- Pfade ---
BASE = Path(__file__).parent
FA2_JSON   = BASE / "../../fa2/graph.json"
OUTPUT     = BASE / "graph_sfdp.json"

# --- 1. graph.json (FA2) laden ---
with open(FA2_JSON) as f:
    fa2_data = json.load(f)

# Node-Infos als Lookup: id → {community, category, name}
node_info = {n["id"]: n for n in fa2_data["nodes"]}

# --- 2. Graph aufbauen ---
G = nx.Graph()
for node in fa2_data["nodes"]:
    G.add_node(node["id"])
for edge in fa2_data["edges"]:
    G.add_edge(edge["source"], edge["target"])

print(f"Graph geladen: {G.number_of_nodes()} Nodes, {G.number_of_edges()} Edges")

# --- 3. SFDP Layout berechnen ---
print("Berechne SFDP Layout (dauert ~1-2 Min)...")
pos = nx.drawing.nx_agraph.graphviz_layout(G, prog='sfdp')

print("Fertig!")

# --- 4. graph_sfdp.json exportieren ---
nodes_out = []
for node_id, (x, y) in pos.items():
    info = node_info[node_id]
    nodes_out.append({
        "id":        info["id"],
        "x":         x,
        "y":         y,
        "community": info["community"],
        "category":  info["category"],
        "name":      info["name"]
    })

output = {
    "nodes": nodes_out,
    "edges": fa2_data["edges"]  # identisch übernehmen
}

with open(OUTPUT, "w") as f:
    json.dump(output, f)

print(f"Gespeichert: {OUTPUT}")