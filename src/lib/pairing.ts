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

export interface SharedState {
  pairing: PairingRecord | null;
  patientLocation: LiveLocation | null;
  caregiverLocation: LiveLocation | null;
  // Patient -> caregiver SOS signal
  sos: { id: string; patientName: string; at: string; location: LiveLocation | null } | null;
}

const KEY = "loom.shared.v1";
const CH = "loom.shared.channel.v1";

function read(): SharedState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { pairing: null, patientLocation: null, caregiverLocation: null, sos: null };
    return JSON.parse(raw) as SharedState;
  } catch {
    return { pairing: null, patientLocation: null, caregiverLocation: null, sos: null };
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
  // initial
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
  write({ pairing: null, patientLocation: null, caregiverLocation: null, sos: null });
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
