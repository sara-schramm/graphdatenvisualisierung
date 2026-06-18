import json
import matplotlib.pyplot as plt
import matplotlib.cm as cm
import numpy as np
import os
script_dir = os.path.dirname(__file__)


with open(os.path.join(script_dir, "graph.json")) as f:
    data = json.load(f)

nodes = data["nodes"]

xs    = [n["x"] for n in nodes]
ys    = [n["y"] for n in nodes]
comms = [n["community"] for n in nodes]




#pro kategorie eine farbe 
cat_colors = {"tvshow": "red", "government": "blue", 
              "company": "green", "politician": "orange"}
colors = [cat_colors[n["category"]] for n in nodes]

plt.scatter(xs, ys, c=colors, s=1, alpha=0.5)
plt.title("ForceAtlas2 — eingefärbt nach Kategorie")

plt.figure(figsize=(12, 10))
plt.scatter(xs, ys, c=colors, s=1, alpha=0.5)
plt.axis("off")
plt.title("ForceAtlas2 — eingefärbt nach Community")
plt.savefig("check_communities.png", dpi=150, bbox_inches="tight")
plt.show()

