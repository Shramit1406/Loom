import { Capacitor } from "@capacitor/core";
import { Geolocation, Position } from "@capacitor/geolocation";

export interface SimpleLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  updatedAt: string;
}

export function toSimpleLocation(position: Position | GeolocationPosition): SimpleLocation {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
    updatedAt: new Date().toISOString(),
  };
}

export async function startLocationWatch(
  onUpdate: (location: SimpleLocation) => void,
  onError?: (error: unknown) => void
): Promise<() => void> {
  if (Capacitor.isNativePlatform()) {
    const id = await Geolocation.watchPosition(
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
        minimumUpdateInterval: 5000,
      },
      (position, error) => {
        if (error) {
          onError?.(error);
          return;
        }
        if (position) onUpdate(toSimpleLocation(position));
      }
    );
    return () => {
      void Geolocation.clearWatch({ id });
    };
  }

  if (!navigator.geolocation) {
    onError?.(new Error("Geolocation not supported"));
    return () => {};
  }

  const id = navigator.geolocation.watchPosition(
    (position) => onUpdate(toSimpleLocation(position)),
    (error) => onError?.(error),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
  );

  return () => navigator.geolocation.clearWatch(id);
}
