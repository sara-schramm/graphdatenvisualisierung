import matplotlib.pyplot as plt
import networkx as nx
import pandas as pd
from pathlib import Path
import json
import random


BASE = Path(__file__).parent
edges_path = BASE.parent / "data_facebook_large" / "musae_facebook_edges.csv"

print("Lade Kanten...")
df = pd.read_csv(edges_path)
G = nx.from_pandas_edgelist(df, source="id_1", target="id_2")
print(f"{G.number_of_nodes()} Knoten, {G.number_of_edges()} Kanten")

import random
random.seed(42)
pos = {n: (random.random() * 2 - 1, random.random() * 2 - 1) for n in G.nodes()}

data = {
    "nodes": [{"id": str(n), "x": pos[n][0], "y": pos[n][1]} for n in G.nodes()],
    "edges": [{"id": f"e{i}", "source": str(r.id_1), "target": str(r.id_2)} for i, r in df.iterrows()]
}

out = BASE / "hairball.json"
with open(out, "w") as f:
    json.dump(data, f)
print(f"Gespeichert: {out}")