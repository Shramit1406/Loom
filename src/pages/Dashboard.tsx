import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Camera, Plus, Play, Heart, Users, ShieldAlert, Settings2, UserCog, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import LoomLogo from "@/components/LoomLogo";
import { db, PersonRecord, uuid } from "@/lib/db";
import { useLoom } from "@/context/LoomContext";
import { broadcastSOS } from "@/lib/sos";
import { toast } from "sonner";
import PairingCard from "@/components/PairingCard";
import LiveMap from "@/components/LiveMap";
import { distanceMeters, getShared, publishLocation, SharedState, subscribeShared } from "@/lib/pairing";
import { startLocationWatch } from "@/lib/live-location";
// Light shim for live data — Dexie's reactive hook isn't included to avoid extra deps.
function usePeople(): PersonRecord[] {
  const [people, setPeople] = useState<PersonRecord[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const all = await db.people.orderBy("createdAt").reverse().toArray();
      if (alive) setPeople(all);
    };
    load();
    const iv = setInterval(load, 1500);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);
  return people;
}

const Dashboard = () => {
  const nav = useNavigate();
  const { profile, loading, mode, setMode, playAnchor } = useLoom();
  const people = usePeople();
  const [panicking, setPanicking] = useState(false);
  const [shared, setShared] = useState<SharedState>(getShared());

  useEffect(() => {
    if (!loading && !profile) nav("/onboarding");
  }, [loading, profile, nav]);

  useEffect(() => subscribeShared(setShared), []);

  useEffect(() => {
    if (!shared.pairing?.acceptedAt) return;
    let stop: (() => void) | undefined;
    void startLocationWatch(
      (location) => publishLocation("patient", location),
      () => {}
    ).then((cleanup) => {
      stop = cleanup;
    });
    return () => stop?.();
  }, [shared.pairing?.acceptedAt]);

  const triggerPanic = async () => {
    setPanicking(true);
    playAnchor();
    await db.panicEvents.add({
      id: uuid(),
      timestamp: new Date().toISOString(),
      triggeredBy: "manual",
    });
    const result = await broadcastSOS(profile?.name ?? "Patient");
    toast.success(result.message, { description: "You are safe. Take a slow breath." });
    setTimeout(() => {
      setPanicking(false);
      nav("/camera");
    }, 800);
  };

  const handleModeToggle = (checked: boolean) => {
    if (checked) {
      setMode("caregiver");
      nav("/caregiver-app");
      return;
    }

    setMode("patient");
  };

  const markers: { id: string; lat: number; lng: number; label: string; tone: "patient" | "caregiver" | "sos" }[] = [];
  if (shared.patientLocation) {
    markers.push({
      id: "patient",
      lat: shared.patientLocation.lat,
      lng: shared.patientLocation.lng,
      label: profile?.name ?? shared.pairing?.patientName ?? "Patient",
      tone: shared.sos ? "sos" : "patient",
    });
  }
  if (shared.caregiverLocation) {
    markers.push({
      id: "caregiver",
      lat: shared.caregiverLocation.lat,
      lng: shared.caregiverLocation.lng,
      label: shared.pairing?.caregiverName ?? "Caregiver",
      tone: "caregiver",
    });
  }

  const outsideZone =
    !!(shared.safeZone && shared.patientLocation &&
      distanceMeters(shared.patientLocation, shared.safeZone) > shared.safeZone.radiusM);

  return (
    <main className="min-h-screen bg-background pb-32">
      {/* Header */}
      <header className="container pt-6 pb-4 flex items-center justify-between">
        <LoomLogo linkTo="/" size="sm" />
        <div className="flex items-center gap-3 rounded-full bg-card px-4 py-2 shadow-soft">
          <UserCog className={`w-4 h-4 ${mode === "caregiver" ? "text-primary" : "text-muted-foreground"}`} />
          <span className="text-sm">Caregiver</span>
          <Switch
            checked={mode === "caregiver"}
            onCheckedChange={handleModeToggle}
          />
        </div>
      </header>

      <section className="container pt-2">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Hello {profile?.name || "friend"} <span className="inline-block">👋</span>
        </h1>
        <p className="text-foreground/70 mt-2 text-lg">You are safe. Your people are here.</p>
      </section>

      {/* Panic */}
      <section className="container mt-8">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={triggerPanic}
          disabled={panicking}
          className="w-full loom-card text-left flex items-center gap-5 hover:shadow-glow transition-shadow gradient-peach animate-pulse-soft"
        >
          <div className="w-16 h-16 rounded-2xl bg-white/70 backdrop-blur flex items-center justify-center shrink-0">
            <Heart className="w-8 h-8 text-destructive" />
          </div>
          <div className="flex-1">
            <div className="text-2xl font-semibold">I'm feeling confused</div>
            <div className="text-base text-foreground/70 mt-1">
              {panicking ? "Sending out a gentle alert…" : "Tap for your anchor voice and a friendly face"}
            </div>
          </div>
        </motion.button>
      </section>

      {/* Quick actions */}
      <section className="container mt-6 grid grid-cols-2 gap-4">
        <Link to="/camera">
          <div className="loom-card hover:shadow-glow transition-shadow h-full">
            <div className="w-12 h-12 rounded-2xl gradient-sage flex items-center justify-center mb-3">
              <Camera className="w-6 h-6 text-white" />
            </div>
            <div className="text-lg font-semibold">Open camera</div>
            <div className="text-sm text-foreground/60">Recognize a face</div>
          </div>
        </Link>
        <Link to="/add-person">
          <div className="loom-card hover:shadow-glow transition-shadow h-full">
            <div className="w-12 h-12 rounded-2xl gradient-lavender flex items-center justify-center mb-3">
              <Plus className="w-6 h-6 text-foreground" />
            </div>
            <div className="text-lg font-semibold">Add a person</div>
            <div className="text-sm text-foreground/60">Photo + voice note</div>
          </div>
        </Link>
      </section>

      {/* Caregiver pairing */}
      <section className="container mt-6">
        <PairingCard patientName={profile?.name ?? "Patient"} />
      </section>

      {shared.pairing?.acceptedAt && (
        <section className="container mt-6">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-5 h-5 text-primary" />
            <h2 className="text-2xl font-semibold">Live safety map</h2>
          </div>
          <LiveMap markers={markers} safeZone={shared.safeZone} outsideZone={outsideZone} />
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="loom-card p-4">
              <div className="text-sm text-foreground/60">Patient</div>
              <div className="mt-1 font-semibold">
                {shared.patientLocation ? `${shared.patientLocation.lat.toFixed(4)}, ${shared.patientLocation.lng.toFixed(4)}` : "Waiting for location"}
              </div>
            </div>
            <div className="loom-card p-4">
              <div className="text-sm text-foreground/60">Caregiver</div>
              <div className="mt-1 font-semibold">
                {shared.caregiverLocation ? `${shared.caregiverLocation.lat.toFixed(4)}, ${shared.caregiverLocation.lng.toFixed(4)}` : "Not connected yet"}
              </div>
            </div>
            <div className="loom-card p-4">
              <div className="text-sm text-foreground/60">Safe zone</div>
              <div className="mt-1 font-semibold">
                {shared.safeZone ? `${shared.safeZone.radiusM}m radius` : "Not set"}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* People */}
      <section className="container mt-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" /> Your people
          </h2>
          <Link to="/add-person">
            <Button variant="outline" className="rounded-full border-2 h-11">
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </Link>
        </div>

        {people.length === 0 ? (
          <div className="loom-card text-center py-12">
            <div className="w-16 h-16 mx-auto rounded-2xl gradient-lavender flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-foreground/60" />
            </div>
            <p className="text-lg font-medium">No people added yet</p>
            <p className="text-foreground/60 mt-1 mb-6">Tap "Add" to start weaving memories.</p>
            <Link to="/add-person">
              <Button className="rounded-full gradient-sage text-white h-12 px-6">
                <Plus className="w-5 h-5 mr-1" /> Add your first person
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {people.map((p) => (
              <PersonCard key={p.id} person={p} />
            ))}
          </div>
        )}
      </section>

      {/* Caregiver entry */}
      {mode === "caregiver" && (
        <section className="container mt-10">
          <Link to="/caregiver">
            <div className="loom-card flex items-center gap-4 hover:shadow-glow">
              <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center">
                <ShieldAlert className="w-6 h-6 text-foreground" />
              </div>
              <div className="flex-1">
                <div className="text-lg font-semibold">Caregiver dashboard</div>
                <div className="text-sm text-foreground/60">Panic history, manage people, anchor settings</div>
              </div>
              <Settings2 className="w-5 h-5 text-muted-foreground" />
            </div>
          </Link>
        </section>
      )}
    </main>
  );
};

function PersonCard({ person }: { person: PersonRecord }) {
  const imgUrl = useMemo(() => URL.createObjectURL(person.imageBlob), [person.imageBlob]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => URL.revokeObjectURL(imgUrl), [imgUrl]);

  const play = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!person.voiceNoteBlob) return;
    const url = URL.createObjectURL(person.voiceNoteBlob);
    audioRef.current?.pause();
    const a = new Audio(url);
    audioRef.current = a;
    a.play().catch(() => {});
    a.onended = () => URL.revokeObjectURL(url);
  };

  return (
    <div className="group loom-card p-4 hover:shadow-glow transition-shadow">
      <div className="relative aspect-square rounded-2xl overflow-hidden mb-3 bg-muted">
        <img src={imgUrl} alt={person.name} className="w-full h-full object-cover" />
        {person.voiceNoteBlob && (
          <button
            onClick={play}
            aria-label={`Play voice note about ${person.name}`}
            className="loom-tap absolute bottom-2 right-2 w-11 h-11 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-soft hover:scale-110 transition-transform"
          >
            <Play className="w-5 h-5 text-primary fill-primary" />
          </button>
        )}
      </div>
      <div className="text-lg font-semibold truncate">{person.name}</div>
      <div className="text-sm text-foreground/60 truncate">{person.relationship}</div>
    </div>
  );
}

export default Dashboard;
