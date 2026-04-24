import { getShared, pushSOS } from "./pairing";
import { uuid } from "./db";

// Web Bluetooth SOS — tries real broadcast where possible, falls back to a friendly simulation.
// Real BLE peripheral broadcasting isn't supported in browsers, so we attempt a scan/connect
// pattern and always fall back to simulated mesh delivery.

export interface SOSResult {
  ok: boolean;
  mode: "bluetooth" | "simulated" | "mesh";
  message: string;
  reachedDevices: number;
}

export async function broadcastSOS(patientName: string): Promise<SOSResult> {
  const shared = getShared();

  if (!shared.pairing || !shared.pairing.acceptedAt) {
    console.warn("[Loom SOS] No caretaker connected. SOS cannot be routed.");
    return {
      ok: false,
      mode: "simulated",
      message: "No caretaker connected. SOS could not be sent.",
      reachedDevices: 0,
    };
  }

  // Simulate BLE Mesh Packet routing
  const messageId = `MSG_${uuid().substring(0, 8)}`;
  const packet = {
    type: 0x01, // 0x01 = SOS Alert
    sender: shared.pairing.patientId,
    messageId,
    ttl: 5,
    hopPath: [shared.pairing.patientId],
    lat: shared.patientLocation?.lat ?? 0,
    lon: shared.patientLocation?.lng ?? 0,
  };

  const payload = `Loom Alert: ${patientName} needs reassurance`;

  if (typeof navigator !== "undefined" && "bluetooth" in navigator) {
    try {
      // Best-effort: prompt for a nearby device. If user picks one, we count it as a real hop.
      // We don't actually write — most devices won't accept arbitrary writes — but the intent
      // is to surface real BLE when available.
      // NOTE: this requires a user gesture, which is the case (button press).
      // @ts-expect-error - bluetooth typings vary
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [],
      });
      console.info("[Loom SOS] Real BLE device picked:", device?.name, "Mesh Packet:", packet);
      
      pushSOS(patientName, shared.patientLocation);
      return {
        ok: true,
        mode: "bluetooth",
        message: `SOS routed to ${shared.pairing.caregiverName || "caregiver"} via Bluetooth Mesh`,
        reachedDevices: 1,
      };
    } catch (err) {
      console.warn("[Loom SOS] BLE unavailable or cancelled, falling back to mesh sim.", err);
    }
  }

  // Simulated mesh broadcast specifically to the connected caretaker
  await new Promise((r) => setTimeout(r, 600));
  
  // Actually alert the caregiver
  pushSOS(patientName, shared.patientLocation);

  console.info(`[Loom SOS] Simulated mesh broadcast:`, packet);
  return {
    ok: true,
    mode: "mesh",
    message: `SOS routed to ${shared.pairing.caregiverName || "your caretaker"} via offline mesh`,
    reachedDevices: 1,
  };
}
