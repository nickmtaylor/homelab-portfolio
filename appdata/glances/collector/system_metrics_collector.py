#!/usr/bin/env python3
"""Polls Glances' REST API for NAS hardware stats and keeps a short
in-memory history for CPU% and CPU temp, for Homepage's custom "System"
panel (rendered by custom.js — this just serves the numbers). Also
proxies Open-Meteo's current-weather endpoint server-side, so the
browser never has to receive the home lat/long directly (the native
Homepage `openmeteo` info-widget this replaces also fetches server-side
for the same reason — this keeps that property rather than regressing
it by calling Open-Meteo straight from custom.js).

Deliberately does NOT use Glances' own /history endpoint: confirmed
against Glances' actual plugin source (glances/plugins/cpu/__init__.py)
that CPU history only tracks the user/system sub-components, not the
"total" figure shown everywhere else, and the sensors plugin doesn't
define history tracking at all. Polling the plain snapshot endpoints and
keeping our own ring buffer avoids both gaps and stays in our control.

Endpoints:
  GET /system            -> current cpu/mem/disk/temp snapshot + disks list
  GET /system/history     -> {"cpu": [...], "temp": [...]} last N samples
  GET /weather            -> {"label", "temp", "unit", "condition", "available"}
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock, Thread

GLANCES_URL = os.environ.get("GLANCES_URL", "http://127.0.0.1:61208").rstrip("/")
POLL_SECONDS = int(os.environ.get("METRICS_POLL_SECONDS", "10"))
# 2-minute rolling window at the default 10s poll interval — matches what
# the CPU/temp sparklines in the panel are meant to show at a glance, not
# a longer trend. Override METRICS_MAX_HISTORY if POLL_SECONDS changes and
# you want the same time span.
MAX_HISTORY = int(os.environ.get("METRICS_MAX_HISTORY", "12"))

WEATHER_LATITUDE = os.environ.get("WEATHER_LATITUDE", "").strip()
WEATHER_LONGITUDE = os.environ.get("WEATHER_LONGITUDE", "").strip()
WEATHER_UNITS = os.environ.get("WEATHER_UNITS", "imperial").strip().lower()
WEATHER_LABEL = os.environ.get("WEATHER_LABEL", "Home").strip()
# 15 min, matching the `cache: 15` the native openmeteo widget used —
# weather doesn't need anywhere near the 10s cadence the hardware stats do.
WEATHER_POLL_SECONDS = int(os.environ.get("WEATHER_POLL_SECONDS", "900"))

lock = Lock()
state = {
    "generated_at": None,
    "available": False,
    "cpu_percent": None,
    "cpu_temp_c": None,
    "mem_percent": None,
    "disks": [],
    "primary_disk": None,
    "history": {"timestamps": [], "cpu": [], "temp": []},
}
weather_state = {
    "available": False,
    "label": WEATHER_LABEL,
    "temp": None,
    "unit": "F" if WEATHER_UNITS != "metric" else "C",
    "condition": None,
    "generated_at": None,
}

# Standard WMO weather-interpretation codes (the same table Open-Meteo's
# own docs publish and the one Homepage's native openmeteo widget maps
# against) — condensed to the labels worth showing in a one-line summary.
WMO_CONDITIONS = {
    0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
    56: "Light freezing drizzle", 57: "Freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain",
    66: "Light freezing rain", 67: "Freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Light showers", 81: "Showers", 82: "Heavy showers",
    85: "Light snow showers", 86: "Snow showers",
    95: "Thunderstorm", 96: "Thunderstorm (hail)", 99: "Thunderstorm (hail)",
}


def fetch(path):
    request = urllib.request.Request(f"{GLANCES_URL}{path}", headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=6) as response:
        return json.loads(response.read().decode())


def pick_cpu_temp(sensors):
    # First core/package temperature sensor reported. Glances' sensor
    # "type" for CPU temps is "temperature_core" (confirmed against
    # glances/plugins/sensors/__init__.py); label text is hardware-
    # specific and can't be known ahead of time.
    for sensor in sensors or []:
        if isinstance(sensor, dict) and sensor.get("type") == "temperature_core":
            value = sensor.get("value")
            if isinstance(value, (int, float)):
                return float(value)
    return None


PRIMARY_MOUNT = "/mnt/volume1"


def pick_primary_disk(disks):
    # Exact match, not a guess: the compose file mounts /volume1 (the
    # NAS's real storage pool) at this specific path and nothing else,
    # so there's no ambiguity about which fs entry is "the" disk to
    # report — unlike the earlier version of this file, which mounted
    # the whole host root and had to guess by picking the largest
    # filesystem. Full list is still returned in "disks" regardless.
    for entry in disks or []:
        if isinstance(entry, dict) and entry.get("mount") == PRIMARY_MOUNT:
            return entry
    return None


def poll():
    global state
    while True:
        try:
            cpu = fetch("/api/4/cpu")
            mem = fetch("/api/4/mem")
            fs = fetch("/api/4/fs")
            sensors = fetch("/api/4/sensors")

            cpu_percent = cpu.get("total") if isinstance(cpu, dict) else None
            mem_percent = mem.get("percent") if isinstance(mem, dict) else None
            cpu_temp = pick_cpu_temp(sensors if isinstance(sensors, list) else [])

            disks = []
            if isinstance(fs, list):
                for entry in fs:
                    if not isinstance(entry, dict):
                        continue
                    disks.append({
                        "mount": entry.get("mnt_point"),
                        "device": entry.get("device_name"),
                        "percent": entry.get("percent"),
                        "size_bytes": entry.get("size"),
                        "used_bytes": entry.get("used"),
                    })
            primary = pick_primary_disk(disks)

            now = int(time.time())
            with lock:
                history = state["history"]
                if cpu_percent is not None:
                    history["timestamps"].append(now)
                    history["cpu"].append(round(cpu_percent, 1))
                    history["temp"].append(round(cpu_temp, 1) if cpu_temp is not None else None)
                    del history["timestamps"][:-MAX_HISTORY]
                    del history["cpu"][:-MAX_HISTORY]
                    del history["temp"][:-MAX_HISTORY]

                state = {
                    "generated_at": now,
                    "available": True,
                    "cpu_percent": round(cpu_percent, 1) if cpu_percent is not None else None,
                    "cpu_temp_c": cpu_temp,
                    "mem_percent": round(mem_percent, 1) if mem_percent is not None else None,
                    "disks": disks,
                    "primary_disk": primary,
                    "history": history,
                }
        except Exception:
            with lock:
                state = {**state, "generated_at": int(time.time()), "available": False}
        time.sleep(POLL_SECONDS)


def poll_weather():
    global weather_state
    if not WEATHER_LATITUDE or not WEATHER_LONGITUDE:
        return  # fails closed — /weather just reports unavailable, no crash
    temperature_unit = "fahrenheit" if WEATHER_UNITS != "metric" else "celsius"
    query = urllib.parse.urlencode({
        "latitude": WEATHER_LATITUDE,
        "longitude": WEATHER_LONGITUDE,
        "current_weather": "true",
        "temperature_unit": temperature_unit,
    })
    while True:
        try:
            request = urllib.request.Request(
                f"https://api.open-meteo.com/v1/forecast?{query}",
                headers={"Accept": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=8) as response:
                data = json.loads(response.read().decode())
            current = data.get("current_weather") or {}
            temp = current.get("temperature")
            code = current.get("weathercode")
            with lock:
                weather_state = {
                    "available": temp is not None,
                    "label": WEATHER_LABEL,
                    "temp": round(temp, 0) if isinstance(temp, (int, float)) else None,
                    "unit": "F" if WEATHER_UNITS != "metric" else "C",
                    "condition": WMO_CONDITIONS.get(code, None),
                    "generated_at": int(time.time()),
                }
        except Exception:
            with lock:
                weather_state = {**weather_state, "available": False, "generated_at": int(time.time())}
        time.sleep(WEATHER_POLL_SECONDS)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?", 1)[0].rstrip("/")
        with lock:
            if path in ("", "/system"):
                payload = json.dumps({k: v for k, v in state.items() if k != "history"}).encode()
            elif path == "/system/history":
                payload = json.dumps(state["history"]).encode()
            elif path == "/weather":
                payload = json.dumps(weather_state).encode()
            else:
                payload = json.dumps({"status": "ok", "service": "system-metrics-collector"}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        # Dashboard page (port 3000/8443) and this collector (port 9200) are
        # different origins to the browser even on the same host, so a plain
        # fetch() from custom.js gets silently blocked without this — curl
        # doesn't enforce CORS, which is why this worked from the terminal
        # but never populated the widgets. Read-only, no credentials, so a
        # wildcard origin is fine here.
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args):
        return


def main():
    Thread(target=poll, daemon=True).start()
    Thread(target=poll_weather, daemon=True).start()
    bind = os.environ.get("METRICS_BIND", "127.0.0.1")
    port = int(os.environ.get("METRICS_PORT", "9200"))
    ThreadingHTTPServer((bind, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
