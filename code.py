from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt

# EcoTrain analysis (simulated data).
# Input: readings.csv and alerts.csv downloaded from the app (Insights -> Data tools).
# Output: statistics in the console and charts.png

folders = [Path(__file__).parent, Path.home() / "Downloads"]


def find(name):
    for folder in folders:
        if (folder / name).exists():
            return folder / name
    # ENDTERM fix: the message named the wrong file (analysis.py)
    raise SystemExit(f"{name} not found. Download it from the app (Insights -> Data tools) "
                     f"and put it next to code.py")


readings = pd.read_csv(find("readings.csv"), parse_dates=["time"])
alerts = pd.read_csv(find("alerts.csv"))

stats = readings.groupby("metric")["value"].agg(["count", "mean", "min", "max"]).round(1)
print("Statistics per metric (simulated data):")
print(stats, "\n")

# ENDTERM fix: the same limits as classify() in app.js, low AND high side
# (before only the high side was checked, so the % for temperature/humidity differed from the app)
limits = {"co2": (None, 900), "temp": (20, 24), "hum": (30, 60), "noise": (None, 70)}
for metric, (low, high) in limits.items():
    data = readings[readings["metric"] == metric]["value"]
    if data.empty:
        continue
    too_high = data >= high if metric in ("co2", "noise") else data > high
    too_low = data < low if low is not None else False
    outside = too_high | too_low
    print(f"{metric}: {outside.mean() * 100:.0f}% of readings outside the normal range")

incidents_by_type = alerts["type"].value_counts()
incidents_by_train = alerts["train"].value_counts()
resolved_pct = (alerts["type"] == "resolved").mean() * 100
print(f"\nIncidents: {len(alerts)}, resolved: {resolved_pct:.0f}%")
print(incidents_by_type.to_string(), "\n")

# ENDTERM: average response time (new column in alerts.csv from the endterm version)
if "response_min" in alerts.columns and alerts["response_min"].notna().any():
    print(f"Average response time: {alerts['response_min'].mean():.1f} min "
          f"(from {alerts['response_min'].notna().sum()} incidents)\n")

co2 = readings[readings["metric"] == "co2"].copy()
co2["hour"] = co2["time"].dt.hour
co2["rush"] = co2["hour"].between(7, 9) | co2["hour"].between(16, 18)
high = co2[co2["value"] >= 900]
if len(co2):
    print(f"CO2 readings >= 900 ppm: {len(high)} ({len(high) / len(co2) * 100:.0f}%), "
          f"{high['rush'].mean() * 100 if len(high) else 0:.0f}% of them in rush hours")
    print(f"Average CO2 in rush hours: {co2[co2['rush']]['value'].mean():.0f} ppm, "
          f"other times: {co2[~co2['rush']]['value'].mean():.0f} ppm")

fig, axes = plt.subplots(1, 3, figsize=(17, 5))

ax = axes[0]
ax.plot(co2["time"], co2["value"], color="#ee6a50", linewidth=2)
ax.axhline(900, color="purple", linestyle="--", label="Watch 900 ppm")
ax.axhline(1000, color="black", linestyle="--", label="Critical 1000 ppm")
ax.set_title("CO₂ in Car 3 over time (simulated data)")
ax.set_xlabel("Time")
ax.set_ylabel("CO₂, ppm")
ax.legend()
ax.tick_params(axis="x", rotation=30)

colors = ["#f6a65a", "#ee6a50", "#d98fc9", "#a57ee0", "#8fc9a8"]
axes[1].pie(incidents_by_type, labels=incidents_by_type.index, autopct="%1.0f%%",
            colors=colors[:len(incidents_by_type)])
axes[1].set_title("Incidents by type")

ax = axes[2]
ax.bar(incidents_by_train.index, incidents_by_train.values, color="#f6a65a")
ax.set_title("Incidents per train")
ax.set_xlabel("Train")
ax.set_ylabel("Number of incidents")

plt.tight_layout()
fig.savefig(Path(__file__).parent / "charts.png", dpi=150)
plt.show()
