import { useEffect, useState } from "react";
import { Copy, Link2, Check, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearPairing,
  generatePairingCode,
  getShared,
  publishLocation,
  SharedState,
  subscribeShared,
} from "@/lib/pairing";
import { toast } from "sonner";

interface Props {
  patientName: string;
}

export default function PairingCard({ patientName }: Props) {
  const [shared, setShared] = useState<SharedState>(getShared());
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => subscribeShared(setShared), []);

  // Stream patient location once paired
  const paired = !!shared.pairing?.acceptedAt;
  useEffect(() => {
    if (!paired) return;
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) =>
        publishLocation("patient", {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          updatedAt: new Date().toISOString(),
        }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [paired]);

  const generate = async () => {
    setGenerating(true);
    const r = generatePairingCode(patientName);
    setGenerating(false);
    toast.success("Code ready", { description: "Share it with your caregiver." });
    return r;
  };

  const copy = async () => {
    if (!shared.pairing) return;
    await navigator.clipboard.writeText(shared.pairing.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const unpair = () => {
    if (!confirm("Disconnect from your caregiver?")) return;
    clearPairing();
    toast.success("Caregiver disconnected");
  };

  // Not yet generated
  if (!shared.pairing) {
    return (
      <div className="loom-card flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl gradient-lavender flex items-center justify-center">
          <Link2 className="w-6 h-6 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-semibold">Connect a caregiver</div>
          <div className="text-sm text-foreground/60">A family member can see if you need help.</div>
        </div>
        <Button onClick={generate} disabled={generating} className="rounded-full gradient-sage text-white h-11 px-5">
          {generating ? "…" : "Get code"}
        </Button>
      </div>
    );
  }

  // Generated, awaiting caregiver
  if (!shared.pairing.acceptedAt) {
    return (
      <div className="loom-card">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-2xl gradient-lavender flex items-center justify-center">
            <Link2 className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1">
            <div className="text-lg font-semibold">Share this code</div>
            <div className="text-sm text-foreground/60">Ask your caregiver to open Loom Caregiver and enter it.</div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => clearPairing()} aria-label="Cancel">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex gap-2 items-center">
          <Input
            readOnly
            value={shared.pairing.code}
            className="h-14 text-center text-3xl tracking-[0.6em] font-bold rounded-xl border-2 bg-secondary"
          />
          <Button onClick={copy} className="rounded-full gradient-sage text-white h-14 w-14 p-0">
            {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
          </Button>
        </div>
        <a
          href="/caregiver-app"
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-3 text-sm text-primary hover:underline"
        >
          Open Caregiver app in a new tab →
        </a>
      </div>
    );
  }

  // Paired — show caregiver, plus their location during SOS
  const showCaregiverLoc = !!shared.sos && shared.caregiverLocation;
  return (
    <div className="loom-card">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl gradient-sage flex items-center justify-center">
          <Check className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-semibold truncate">
            {shared.pairing.caregiverName} is watching over you
          </div>
          <div className="text-sm text-foreground/60">
            They will see your location and SOS alerts.
          </div>
        </div>
        <Button variant="ghost" onClick={unpair} className="rounded-full text-destructive hover:bg-destructive/10">
          Disconnect
        </Button>
      </div>

      {showCaregiverLoc && (
        <div className="mt-4 rounded-2xl bg-secondary p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-card flex items-center justify-center">
            <MapPin className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">{shared.pairing.caregiverName} is on the way</div>
            <div className="text-xs text-muted-foreground">
              {shared.caregiverLocation!.lat.toFixed(4)}, {shared.caregiverLocation!.lng.toFixed(4)}
            </div>
          </div>
          <a
            href={`https://www.google.com/maps?q=${shared.caregiverLocation!.lat},${shared.caregiverLocation!.lng}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary hover:underline"
          >
            Open
          </a>
        </div>
      )}
    </div>
  );
}
