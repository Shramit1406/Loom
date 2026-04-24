import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { Camera } from "@capacitor/camera";
import { VoiceRecorder } from "capacitor-voice-recorder";
import { BleClient } from "@capacitor-community/bluetooth-le";

export type PermissionKey = "camera" | "microphone" | "location" | "bluetooth";
export type PermissionStateLike = "granted" | "prompt" | "denied" | "unsupported";

export const PERMISSIONS_META: { key: PermissionKey; title: string; body: string }[] = [
  { key: "camera", title: "Camera", body: "Face recognition and photo capture work best when the camera is ready." },
  { key: "microphone", title: "Microphone", body: "Voice notes and calming anchor messages need microphone access." },
  { key: "location", title: "Location", body: "Live safety maps and caregiver tracking depend on precise location." },
  { key: "bluetooth", title: "Bluetooth", body: "Offline SOS and nearby caregiver detection rely on Bluetooth availability." },
];

function normalizeState(state?: string): PermissionStateLike {
  if (state === "granted") return "granted";
  if (state === "denied") return "denied";
  return "prompt";
}

async function queryBrowserPermission(name: "camera" | "microphone" | "geolocation"): Promise<PermissionStateLike> {
  if (!("permissions" in navigator) || !navigator.permissions?.query) return "prompt";
  try {
    const result = await navigator.permissions.query({ name } as PermissionDescriptor);
    return normalizeState(result.state);
  } catch {
    return "prompt";
  }
}

async function requestUserMedia(constraints: MediaStreamConstraints): Promise<PermissionStateLike> {
  if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach((track) => track.stop());
    return "granted";
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") return "denied";
    return "prompt";
  }
}

export async function checkPermission(key: PermissionKey): Promise<PermissionStateLike> {
  if (Capacitor.isNativePlatform()) {
    try {
      switch (key) {
        case "camera": {
          const status = await Camera.checkPermissions();
          return normalizeState(status.camera);
        }
        case "microphone": {
          const { value } = await VoiceRecorder.hasAudioRecordingPermission();
          return value ? "granted" : "prompt";
        }
        case "location": {
          const status = await Geolocation.checkPermissions();
          return normalizeState(status.location);
        }
        case "bluetooth":
          return localStorage.getItem("loom.permission.bluetooth") === "granted" ? "granted" : "prompt";
      }
    } catch (err) {
      console.warn(`checkPermission failed for ${key}`, err);
      return "prompt";
    }
  }

  switch (key) {
    case "camera":
      return queryBrowserPermission("camera");
    case "microphone":
      return queryBrowserPermission("microphone");
    case "location":
      return queryBrowserPermission("geolocation");
    case "bluetooth":
      return "unsupported";
  }
}

export async function requestPermission(key: PermissionKey): Promise<PermissionStateLike> {
  if (Capacitor.isNativePlatform()) {
    try {
      switch (key) {
        case "camera": {
          const status = await Camera.requestPermissions();
          return normalizeState(status.camera);
        }
        case "microphone": {
          const { value } = await VoiceRecorder.requestAudioRecordingPermission();
          return value ? "granted" : "denied";
        }
        case "location": {
          const status = await Geolocation.requestPermissions();
          return normalizeState(status.location);
        }
        case "bluetooth":
          await BleClient.initialize({ androidNeverForLocation: true });
          localStorage.setItem("loom.permission.bluetooth", "granted");
          return "granted";
      }
    } catch (err) {
      console.error(`requestPermission failed for ${key}`, err);
      return "denied";
    }
  }

  switch (key) {
    case "camera":
      return requestUserMedia({ video: true });
    case "microphone":
      return requestUserMedia({ audio: true });
    case "location":
      return new Promise((resolve) => {
        if (!navigator.geolocation) {
          resolve("unsupported");
          return;
        }
        navigator.geolocation.getCurrentPosition(
          () => resolve("granted"),
          (error) => resolve(error.code === error.PERMISSION_DENIED ? "denied" : "prompt"),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
    case "bluetooth":
      return "unsupported";
  }
}
