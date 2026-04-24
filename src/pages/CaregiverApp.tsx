import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ShieldCheck, Link2, MapPin, BellRing, LogOut, Heart, Shield, Mic, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import LoomLogo from "@/components/LoomLogo";
import LiveMap from "@/components/LiveMap";
import AudioRecorder from "@/components/AudioRecorder";
import {
  acceptPairing,
  blobToDataUrl,
  clearGeofenceAlert,
  clearPairing,
  clearSOS,
  distanceMeters,
  getShared,
  publishLocation,
  setSafeZone,
  setSoothingMessage,
  SharedState,
  subscribeShared,
} from "@/lib/pairing";
import { toast } from "sonner";

const CaregiverApp = () => {
  const [shared, setShared] = useState<SharedState>(getShared());
  const [name, setName] = useState(localStorage.getItem("loom.caregiver.name") ?? "");
  const [code, setCode] = useState("");
  const [radius, setRadius] = useState<number>(shared.safeZone?.radiusM ?? 200);
  const [showRecorder, setShowRecorder] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = subscribeShared(setShared);
    return unsub;
  }, []);

  useEffect(() => {
    if (shared.safeZone) setRadius(shared.safeZone.radiusM);
  }, [shared.safeZone]);

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
      (err) => console.warn("caregiver geo error", err),
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
        description: shared.soothing ? "Your soothing message is auto-playing on their device." : "Tap to view their live location.",
        duration: 8000,
      });
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
  }, [shared.sos, shared.soothing]);

  // Geofence alert toast
  const lastFenceId = useRef<string | null>(null);
  useEffect(() => {
    if (shared.geofenceAlert && shared.geofenceAlert.id !== lastFenceId.current) {
      lastFenceId.current = shared.geofenceAlert.id;
      toast.error(`${shared.geofenceAlert.patientName} left the safe zone`, {
        description: `${shared.geofenceAlert.distanceM} m from home · ${new Date(shared.geofenceAlert.at).toLocaleTimeString()}`,
        duration: 10000,
      });
    }
  }, [shared.geofenceAlert]);

  const tryPair = () => {
    if (!name.trim()) return toast.error("Enter your name first");
    if (!/^\d{6}$/.test(code.trim())) return toast.error("Enter the 6-digit code from the patient");
    const r = acceptPairing(code.trim(), name.trim());
    if (!r) return toast.error("Code not found. Ask the patient to generate a fresh one.");
    localStorage.setItem("loom.caregiver.name", name.trim());
    toast.success(`Paired with ${r.patientName}`);
  };

  const confirmUnpair = () => {
    clearPairing();
    toast.success("Unpaired");
  };

  const setHomeHere = () => {
    if (!("geolocation" in navigator)) return toast.error("Geolocation not supported");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSafeZone({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          radiusM: radius,
          label: "Home",
          setAt: new Date().toISOString(),
        });
        toast.success("Safe zone set to your current location");
      },
      () => toast.error("Could not read your location"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const setHomeFromPatient = () => {
    if (!shared.patientLocation) return toast.error("Waiting for patient location…");
    setSafeZone({
      lat: shared.patientLocation.lat,
      lng: shared.patientLocation.lng,
      radiusM: radius,
      label: "Home",
      setAt: new Date().toISOString(),
    });
    toast.success("Safe zone set to patient's current location");
  };

  const updateRadius = (v: number[]) => {
    const r = v[0];
    setRadius(r);
    if (shared.safeZone) {
      setSafeZone({ ...shared.safeZone, radiusM: r });
    }
  };

  const removeZone = () => {
    setSafeZone(null);
    toast.success("Safe zone removed");
  };

  const onSoothingRecorded = async (b: Blob | null) => {
    if (!b) {
      setSoothingMessage(null);
      setShowRecorder(false);
      return;
    }
    const dataUrl = await blobToDataUrl(b);
    setSoothingMessage({
      id: crypto.randomUUID(),
      audioDataUrl: dataUrl,
      recordedAt: new Date().toISOString(),
      caregiverName: name || shared.pairing?.caregiverName,
    });
    toast.success("Soothing message saved", { description: "It will auto-play on the patient's device during SOS." });
    setShowRecorder(false);
  };

  const removeSoothing = () => {
    setSoothingMessage(null);
    toast.success("Soothing message removed");
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

  const outsideZone =
    !!(shared.safeZone && shared.patientLocation &&
      distanceMeters(shared.patientLocation, shared.safeZone) > shared.safeZone.radiusM);

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
            ? "You'll see their live location, get geofence alerts, and your recorded message will comfort them on SOS."
            : "Ask the patient to open Loom → Dashboard → 'Connect a caregiver' and share the 6-digit code."}
        </p>

        {/* Geofence breach banner */}
        {shared.geofenceAlert && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 loom-card flex items-center gap-4 border-2 border-destructive/40 bg-destructive/5"
          >
            <div className="w-12 h-12 rounded-2xl bg-destructive/15 flex items-center justify-center">
              <Shield className="w-6 h-6 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-destructive">
                {shared.geofenceAlert.patientName} left the safe zone
              </div>
              <div className="text-sm text-foreground/70">
                {shared.geofenceAlert.distanceM} m from home · {new Date(shared.geofenceAlert.at).toLocaleTimeString()}
              </div>
            </div>
            <Button variant="ghost" onClick={() => clearGeofenceAlert()} className="rounded-full">
              Acknowledge
            </Button>
          </motion.div>
        )}

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
                {shared.soothing ? " · Soothing message playing on patient device" : ""}
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
            <LiveMap markers={markers} safeZone={shared.safeZone} outsideZone={outsideZone} />

            {/* Safe zone controls */}
            <div className="loom-card mt-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">Safe zone</h3>
                <span className="ml-auto text-xs text-muted-foreground">
                  {shared.safeZone
                    ? `Center ${shared.safeZone.lat.toFixed(4)}, ${shared.safeZone.lng.toFixed(4)} · ${shared.safeZone.radiusM}m`
                    : "Not set"}
                </span>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground/70">Radius</span>
                    <span className="font-semibold">{radius} m</span>
                  </div>
                  <Slider value={[radius]} min={50} max={2000} step={10} onValueChange={updateRadius} className="mt-2" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={setHomeHere} className="rounded-full gradient-sage text-white h-11">
                    Use my location as home
                  </Button>
                  <Button onClick={setHomeFromPatient} variant="outline" className="rounded-full border-2 h-11">
                    Use patient's current location
                  </Button>
                  {shared.safeZone && (
                    <Button onClick={removeZone} variant="ghost" className="rounded-full h-11 text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-4 h-4 mr-1" /> Remove zone
                    </Button>
                  )}
                </div>
                {outsideZone && (
                  <p className="text-sm text-destructive">⚠ Patient is currently outside the safe zone.</p>
                )}
              </div>
            </div>

            {/* Soothing message */}
            <div className="loom-card mt-4">
              <div className="flex items-center gap-2 mb-3">
                <Mic className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">Soothing voice message</h3>
                <span className="ml-auto text-xs text-muted-foreground">
                  {shared.soothing ? `Recorded ${timeAgo(shared.soothing.recordedAt)}` : "Not recorded"}
                </span>
              </div>
              <p className="text-sm text-foreground/70 mb-3">
                Auto-plays on {shared.pairing?.patientName ?? "the patient"}'s device whenever they tap the panic button.
              </p>
              {showRecorder || !shared.soothing ? (
                <AudioRecorder
                  initialBlob={null}
                  onRecordingComplete={onSoothingRecorded}
                  promptText={`Hi ${shared.pairing?.patientName ?? ""}, you are safe. I love you. I'll be there soon.`}
                  maxDuration={30}
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      const a = new Audio(shared.soothing!.audioDataUrl);
                      a.play().catch(() => {});
                    }}
                    variant="outline"
                    className="rounded-full border-2 h-11"
                  >
                    Play preview
                  </Button>
                  <Button onClick={() => setShowRecorder(true)} className="rounded-full gradient-sage text-white h-11">
                    <Mic className="w-4 h-4 mr-2" /> Re-record
                  </Button>
                  <Button onClick={removeSoothing} variant="ghost" className="rounded-full h-11 text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4 mr-1" /> Remove
                  </Button>
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              <Link to="/caregiver">
                <Button variant="outline" className="rounded-full border-2 h-12 w-full">
                  <Heart className="w-4 h-4 mr-2" /> Care dashboard
                </Button>
              </Link>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" className="rounded-full h-12 text-destructive hover:bg-destructive/10">
                    <LogOut className="w-4 h-4 mr-2" /> Unpair
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-[2rem]">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Unpair from patient?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will stop location sharing and SOS updates. You'll need to re-enter a pairing code to reconnect.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmUnpair} className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Unpair now
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
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
