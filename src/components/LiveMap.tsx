import { useEffect } from "react";
import { APIProvider, Map, AdvancedMarker, Pin, useMap } from "@vis.gl/react-google-maps";
import { AlertTriangle, MapPin } from "lucide-react";

interface MarkerSpec {
  id: string;
  lat: number;
  lng: number;
  label: string;
  tone: "patient" | "caregiver" | "sos";
}

interface SafeZoneSpec {
  lat: number;
  lng: number;
  radiusM: number;
}

interface LiveMapProps {
  markers: MarkerSpec[];
  center?: { lat: number; lng: number };
  zoom?: number;
  safeZone?: SafeZoneSpec | null;
  outsideZone?: boolean;
}

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const MAP_ID = "loom-map";

function SafeZoneCircle({ zone, breached }: { zone: SafeZoneSpec; breached: boolean }) {
  const map = useMap();
  useEffect(() => {
    const g = (window as unknown as { google?: typeof google }).google;
    if (!map || !g) return;
    const circle = new g.maps.Circle({
      map,
      center: { lat: zone.lat, lng: zone.lng },
      radius: zone.radiusM,
      strokeColor: breached ? "#ef4444" : "#A855F7",
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: breached ? "#ef4444" : "#A855F7",
      fillOpacity: 0.12,
    });
    return () => circle.setMap(null);
  }, [map, zone.lat, zone.lng, zone.radiusM, breached]);
  return null;
}

export default function LiveMap({ markers, center, zoom = 14, safeZone, outsideZone }: LiveMapProps) {
  if (!KEY) {
    return (
      <div className="loom-card flex flex-col items-center text-center p-8 gap-3">
        <div className="w-14 h-14 rounded-2xl gradient-lavender flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-accent" />
        </div>
        <div className="text-lg font-semibold">Google Maps key required</div>
        <p className="text-sm text-foreground/70 max-w-md">
          Add your Google Maps JavaScript API key as the env variable{" "}
          <code className="px-1.5 py-0.5 rounded bg-muted text-xs">VITE_GOOGLE_MAPS_API_KEY</code>{" "}
          to enable the live map.
        </p>
        <ul className="mt-2 w-full max-w-sm text-left text-sm">
          {markers.map((m) => (
            <li key={m.id} className="flex items-center gap-2 py-1.5 border-b border-border last:border-0">
              <MapPin className={`w-4 h-4 ${toneClass(m.tone)}`} />
              <span className="font-medium">{m.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {m.lat.toFixed(4)}, {m.lng.toFixed(4)}
              </span>
            </li>
          ))}
          {markers.length === 0 && <li className="py-2 text-muted-foreground">No live locations yet.</li>}
        </ul>
      </div>
    );
  }

  const c = center ?? markers[0] ?? (safeZone ? { lat: safeZone.lat, lng: safeZone.lng } : { lat: 37.7749, lng: -122.4194 });

  return (
    <div className="rounded-3xl overflow-hidden shadow-card h-[420px] bg-muted">
      <APIProvider apiKey={KEY}>
        <Map
          defaultCenter={c}
          defaultZoom={zoom}
          mapId={MAP_ID}
          gestureHandling="greedy"
          disableDefaultUI={false}
        >
          {markers.map((m) => (
            <AdvancedMarker key={m.id} position={{ lat: m.lat, lng: m.lng }} title={m.label}>
              <Pin background={pinBg(m.tone)} borderColor="#ffffff" glyphColor="#ffffff" />
            </AdvancedMarker>
          ))}
          {safeZone && <SafeZoneCircle zone={safeZone} breached={!!outsideZone} />}
          {safeZone && (
            <AdvancedMarker position={{ lat: safeZone.lat, lng: safeZone.lng }} title="Safe zone center">
              <Pin background="#22c55e" borderColor="#ffffff" glyphColor="#ffffff" />
            </AdvancedMarker>
          )}
        </Map>
      </APIProvider>
    </div>
  );
}

function toneClass(t: MarkerSpec["tone"]) {
  if (t === "sos") return "text-destructive";
  if (t === "caregiver") return "text-accent";
  return "text-primary";
}
function pinBg(t: MarkerSpec["tone"]) {
  if (t === "sos") return "#ef4444";
  if (t === "caregiver") return "#6D28D9";
  return "#A855F7";
}
