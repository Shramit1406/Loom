import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ShieldCheck, Link2, MapPin, Bell, BellRing, LogOut, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LoomLogo from "@/components/LoomLogo";
import LiveMap from "@/components/LiveMap";
import {
  acceptPairing,
  clearPairing,
  clearSOS,
  getShared,
  publishLocation,
  SharedState,
  subscribeShared,
} from "@/lib/pairing";
import { toast } from "sonner";

const CaregiverApp = () => {
  const [shared, setShared] = useState<SharedState>(getShared());
  const [name, setName] = useState(localStorage.getItem("loom.caregiver.name") ?? "");
  const [code, setCode] = useState("");
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = subscribeShared(setShared);
    return unsub;
  }, []);

  // Stream caregiver location once paired
  const paired = !!shared.pairing?.acceptedAt && shared.pairing?.caregiverName === (name || shared.pairing?.caregiverName);
  useEffect(() => {
    if (!paired) return;
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation not supported in this browser");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        publishLocation("caregiver", {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          updatedAt: new Date().toISOString(),
        });
      },
      (err) => {
        console.warn("caregiver geo error", err);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    watchIdRef.current = id;
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [paired]);

  // SOS toast
  const lastSosId = useRef<string | null>(null);
  useEffect(() => {
    if (shared.sos && shared.sos.id !== lastSosId.current) {
      lastSosId.current = shared.sos.id;
      toast.error(`${shared.sos.patientName} needs reassurance`, {
        description: "Tap to view their live location.",
        duration: 8000,
      });
      // gentle audible cue
      try {
        const ctx = new AudioContext();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 660;
        g.gain.value = 0.05;
        o.connect(g).connect(ctx.destination);
        o.start();
        setTimeout(() => { o.stop(); ctx.close(); }, 350);
      } catch { /* ignore */ }
    }
  }, [shared.sos]);

  const tryPair = () => {
    if (!name.trim()) return toast.error("Enter your name first");
    if (!/^\d{6}$/.test(code.trim())) return toast.error("Enter the 6-digit code from the patient");
    const r = acceptPairing(code.trim(), name.trim());
    if (!r) return toast.error("Code not found. Ask the patient to generate a fresh one.");
    localStorage.setItem("loom.caregiver.name", name.trim());
    toast.success(`Paired with ${r.patientName}`);
  };

  const unpair = () => {
    if (!confirm("Unpair from this patient? Their location will stop being shared.")) return;
    clearPairing();
    toast.success("Unpaired");
  };

  const markers: { id: string; lat: number; lng: number; label: string; tone: "patient" | "caregiver" | "sos" }[] = [];
  if (shared.patientLocation) {
    markers.push({
      id: "patient",
      lat: shared.patientLocation.lat,
      lng: shared.patientLocation.lng,
      label: shared.pairing?.patientName ?? "Patient",
      tone: shared.sos ? "sos" : "patient",
    });
  }
  if (shared.caregiverLocation) {
    markers.push({
      id: "caregiver",
      lat: shared.caregiverLocation.lat,
      lng: shared.caregiverLocation.lng,
      label: name || "You",
      tone: "caregiver",
    });
  }

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="container pt-6 pb-4 flex items-center justify-between">
        <LoomLogo linkTo="/" size="sm" />
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Home
        </Link>
      </header>

      <section className="container max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-1.5 text-sm">
          <ShieldCheck className="w-4 h-4 text-primary" /> Caregiver app
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mt-3">
          {paired ? `Watching over ${shared.pairing?.patientName}` : "Pair with your loved one"}
        </h1>
        <p className="text-foreground/70 mt-2">
          {paired
            ? "You'll see their live location and be alerted the moment they need reassurance."
            : "Ask the patient to open Loom → Dashboard → 'Connect a caregiver' and share the 6-digit code."}
        </p>

        {/* SOS banner */}
        {shared.sos && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 loom-card flex items-center gap-4 border-2 border-destructive/40 bg-destructive/5"
          >
            <div className="w-12 h-12 rounded-2xl bg-destructive/15 flex items-center justify-center">
              <BellRing className="w-6 h-6 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-destructive">SOS from {shared.sos.patientName}</div>
              <div className="text-sm text-foreground/70">
                {new Date(shared.sos.at).toLocaleTimeString()} · {shared.sos.location ? "Location attached" : "No location"}
              </div>
            </div>
            <Button variant="ghost" onClick={() => clearSOS()} className="rounded-full">
              Acknowledge
            </Button>
          </motion.div>
        )}

        {/* Pair form */}
        {!paired && (
          <div className="loom-card mt-6">
            <div className="flex items-center gap-2 mb-4">
              <Link2 className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">Enter pairing code</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-foreground/70">Your name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sarah" className="mt-1 h-12 rounded-xl border-2" />
              </div>
              <div>
                <label className="text-sm text-foreground/70">6-digit code</label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  inputMode="numeric"
                  className="mt-1 h-12 rounded-xl border-2 tracking-[0.4em] text-center text-xl font-semibold"
                />
              </div>
            </div>
            <Button onClick={tryPair} className="mt-4 rounded-full gradient-sage text-white h-12 px-6">
              Pair with patient
            </Button>
            <p className="text-xs text-muted-foreground mt-3">
              For demo purposes pairing works between tabs on this device. Cross-device pairing requires Lovable Cloud.
            </p>
          </div>
        )}

        {/* Map */}
        {paired && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">Live map</h2>
              <span className="ml-auto text-xs text-muted-foreground">
                {shared.patientLocation
                  ? `Patient updated ${timeAgo(shared.patientLocation.updatedAt)}`
                  : "Waiting for patient location…"}
              </span>
            </div>
            <LiveMap markers={markers} />
            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              <Link to="/caregiver">
                <Button variant="outline" className="rounded-full border-2 h-12 w-full">
                  <Heart className="w-4 h-4 mr-2" /> Care dashboard
                </Button>
              </Link>
              <Button onClick={unpair} variant="ghost" className="rounded-full h-12 text-destructive hover:bg-destructive/10">
                <LogOut className="w-4 h-4 mr-2" /> Unpair
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
};

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export default CaregiverApp;
