import { useEffect, useRef } from "react";
import { Box } from "@chakra-ui/react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Feed, Station } from "../lib/data";
import { SX, statusColor } from "../lib/ui";

// Zoomable dark map of the monitored stations at their transmitter sites. Uses
// vector circle markers (no image assets) coloured by feed status, over CARTO's
// dark basemap.
export function MapPanel({ stations, feeds }: { stations: Station[]; feeds: Feed[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || mapRef.current) return;
    const pts = stations.filter((s) => typeof s.lat === "number" && typeof s.lon === "number");

    const map = L.map(el, { scrollWheelZoom: true, worldCopyJump: true });
    mapRef.current = map;

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
      detectRetina: true,
    }).addTo(map);

    const byId = new Map(feeds.map((f) => [f.id, f]));
    const latlngs: L.LatLngExpression[] = [];
    for (const s of pts) {
      const f = byId.get(s.id);
      const col = statusColor[f?.status ?? "unknown"] ?? SX.accent;
      const spins = f?.spins ?? 0;
      const r = 5 + Math.min(11, Math.sqrt(spins) / 5);
      const ll: L.LatLngExpression = [s.lat!, s.lon!];
      latlngs.push(ll);
      L.circleMarker(ll, { radius: r, color: col, weight: 1.5, fillColor: col, fillOpacity: 0.5 })
        .addTo(map)
        .bindPopup(
          `<b>${s.name}</b><br>${s.market}, ${s.prov ?? ""} · ${s.format}<br>` +
            `${spins.toLocaleString()} spins · <span style="color:${col}">${f?.status ?? "—"}</span>`
        );
    }
    if (latlngs.length) map.fitBounds(L.latLngBounds(latlngs).pad(0.25));
    else map.setView([58, -96], 3);
    // container is sized by CSS after mount; make sure Leaflet measures it
    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [stations, feeds]);

  return (
    <Box
      ref={ref}
      h={{ base: "320px", md: "460px" }}
      borderWidth="1px"
      borderColor={SX.line}
      borderRadius="4px"
      overflow="hidden"
    />
  );
}
