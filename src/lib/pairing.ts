// Local pairing + location sharing between Patient and Caregiver.
// Uses localStorage as a tiny shared "server" + BroadcastChannel for realtime.
// Works for two browser tabs/windows on the same device — perfect for demos.
// Paired across devices would require a real backend (Lovable Cloud).

import { uuid } from "./db";

export interface PairingRecord {
  code: string;                 // 6-digit code
  patientName: string;
  patientId: string;
  caregiverName?: string;
  caregiverId?: string;
  createdAt: string;
  acceptedAt?: string;
}

export interface LiveLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  updatedAt: string;
}

export interface SafeZone {
  lat: number;
  lng: number;
  radiusM: number;
  label?: string;
  setAt: string;
}

export interface SoothingMessage {
  id: string;
  audioDataUrl: string; // base64 data URL so it survives across tabs
  recordedAt: string;
  caregiverName?: string;
}

export interface GeofenceAlert {
  id: string;
  patientName: string;
  at: string;
  distanceM: number;
  location: LiveLocation;
}

export interface SharedState {
  pairing: PairingRecord | null;
  patientLocation: LiveLocation | null;
  caregiverLocation: LiveLocation | null;
  // Patient -> caregiver SOS signal
  sos: { id: string; patientName: string; at: string; location: LiveLocation | null } | null;
  safeZone: SafeZone | null;
  soothing: SoothingMessage | null;
  geofenceAlert: GeofenceAlert | null;
}

const KEY = "loom.shared.v1";
const CH = "loom.shared.channel.v1";

const EMPTY: SharedState = {
  pairing: null,
  patientLocation: null,
  caregiverLocation: null,
  sos: null,
  safeZone: null,
  soothing: null,
  geofenceAlert: null,
};

function read(): SharedState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<SharedState>) };
  } catch {
    return { ...EMPTY };
  }
}

function write(s: SharedState) {
  localStorage.setItem(KEY, JSON.stringify(s));
  try {
    const ch = new BroadcastChannel(CH);
    ch.postMessage({ type: "update", state: s });
    ch.close();
  } catch {
    // ignored
  }
}

export function getShared(): SharedState {
  return read();
}

export function subscribeShared(cb: (s: SharedState) => void): () => void {
  const ch = new BroadcastChannel(CH);
  const onMsg = (e: MessageEvent) => {
    if (e.data?.type === "update") cb(e.data.state as SharedState);
  };
  ch.addEventListener("message", onMsg);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb(read());
  };
  window.addEventListener("storage", onStorage);
  cb(read());
  return () => {
    ch.removeEventListener("message", onMsg);
    ch.close();
    window.removeEventListener("storage", onStorage);
  };
}

export function generatePairingCode(patientName: string): PairingRecord {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const rec: PairingRecord = {
    code,
    patientName,
    patientId: uuid(),
    createdAt: new Date().toISOString(),
  };
  const s = read();
  write({ ...s, pairing: rec });
  return rec;
}

export function acceptPairing(code: string, caregiverName: string): PairingRecord | null {
  const s = read();
  if (!s.pairing) return null;
  if (s.pairing.code !== code.trim()) return null;
  const updated: PairingRecord = {
    ...s.pairing,
    caregiverName,
    caregiverId: uuid(),
    acceptedAt: new Date().toISOString(),
  };
  write({ ...s, pairing: updated });
  return updated;
}

export function clearPairing() {
  write({ ...EMPTY });
}

export function publishLocation(role: "patient" | "caregiver", loc: LiveLocation) {
  const s = read();
  if (role === "patient") write({ ...s, patientLocation: loc });
  else write({ ...s, caregiverLocation: loc });
}

export function pushSOS(patientName: string, location: LiveLocation | null) {
  const s = read();
  write({
    ...s,
    sos: { id: uuid(), patientName, at: new Date().toISOString(), location },
  });
}

export function clearSOS() {
  const s = read();
  write({ ...s, sos: null });
}

export function setSafeZone(z: SafeZone | null) {
  const s = read();
  write({ ...s, safeZone: z, geofenceAlert: null });
}

export function setSoothingMessage(m: SoothingMessage | null) {
  const s = read();
  write({ ...s, soothing: m });
}

export function pushGeofenceAlert(a: GeofenceAlert) {
  const s = read();
  write({ ...s, geofenceAlert: a });
}

export function clearGeofenceAlert() {
  const s = read();
  write({ ...s, geofenceAlert: null });
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

