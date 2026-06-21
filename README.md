# Graphdatenvisualisierung

Diese Anleitung beschreibt die notwendigen Schritte, um das Repository nach dem ersten Klonen lokal auszuführen.

## 1. Repository klonen

```bash
git clone <repo-url>
cd graphdatenvisualisierung
```

## 2. Quarto installieren

Für das Starten der Website wird **Quarto** benötigt:

- Download und Installation: [https://quarto.org/docs/get-started/](https://quarto.org/docs/get-started/)

Prüfen, ob Quarto installiert ist:

```bash
quarto --version
```

## 3. Python installieren

Für vorberechnete Inhalte und Python-Abhängigkeiten wird **Python 3** benötigt.

Prüfen, ob Python verfügbar ist:

```bash
python3 --version
```

## 4. Virtuelle Umgebung anlegen

Im Projektordner eine virtuelle Umgebung erstellen:

```bash
python3 -m venv .venv
```

## 5. Virtuelle Umgebung aktivieren

### macOS / Linux

```bash
source .venv/bin/activate
```

### Windows (PowerShell)

```powershell
.venv\Scripts\Activate.ps1
```

### Windows (CMD)

```cmd
.venv\Scripts\activate.bat
```

## 6. Python-Abhängigkeiten installieren

Die benötigten Pakete aus `requirements.txt` installieren:

```bash
pip install -r requirements.txt
```

## 7. Website lokal starten

Die Website mit Quarto starten:

```bash
quarto preview
```

Danach ist die Website lokal im Browser verfügbar und wird bei Änderungen automatisch neu geladen.

## 8. Hinweise zu den Daten

Die für die Website benötigten Ressourcen und Visualisierungsdateien sind bereits im Repository enthalten. Für den ersten Start ist daher keine zusätzliche Datenvorverarbeitung notwendig.


## 9. Falls `quarto preview` nicht funktioniert

Folgende Punkte prüfen:

- Ist Quarto installiert?
- Ist die virtuelle Umgebung aktiviert?
- Wurden die Abhängigkeiten mit `pip install -r requirements.txt` installiert?
- Befindet man sich im Projektordner?

## 10. Optional: anderen Port verwenden

Falls der Standard-Port bereits belegt ist:

```bash
quarto preview --port 3000
```
