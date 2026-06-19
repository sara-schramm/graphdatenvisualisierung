import networkx as nx
import pandas as pd
import community as community_louvain
from collections import Counter
import os
import json

# --- Graph laden  ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
edges   = pd.read_csv(os.path.join(BASE_DIR, '../../data_facebook_large/musae_facebook_edges.csv'))
targets = pd.read_csv(os.path.join(BASE_DIR, '../../data_facebook_large/musae_facebook_target.csv'))

G = nx.from_pandas_edgelist(edges, source='id_1', target='id_2') # csv zu network-x-graph
label_map = dict(zip(targets['id'], targets['page_type']))# {0: 'politician', 1: 'company', ...}
nx.set_node_attributes(G, label_map, 'category') # hängt dict als atrriubt an jeden knoten

# ---Louvain ---


print("\n=== Community Detection (Louvain) ===")
partition = community_louvain.best_partition(G, random_state=42) #{ 0: 4, 1: 4, 2: 17, 3: 4, 5: 12, ... }: node_id → community_id
nx.set_node_attributes(G, partition, 'community')
print(dict(list(G.nodes(data=True))[:5]))



num_communities = len(set(partition.values()))
print(f"Anzahl Communities: {num_communities}")


modularity = community_louvain.modularity(partition, G) # berechnet q-wert, misst wie gut m wirklich ist
print(f"Modularität Q: {modularity:.4f}")  # Ziel: > 0.3


community_sizes = Counter(partition.values())
print(f"\nGrößte Community:  {max(community_sizes.values())} Nodes")
print(f"Kleinste Community: {min(community_sizes.values())} Nodes")
print(f"Median Community:   {sorted(community_sizes.values())[num_communities//2]} Nodes")


communities_path = os.path.join(BASE_DIR, 'communities.json')
with open(communities_path, 'w') as f:
    json.dump(partition, f)
print("communities.json gespeichert")