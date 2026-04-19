import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Heart, Loader2, ScanFace, CameraOff, AlertTriangle, UserPlus, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoomLogo from "@/components/LoomLogo";
import { db, PersonRecord, RecognitionEvent, uuid } from "@/lib/db";
import { detectInVideo, euclidean, loadFaceModels, MATCH_THRESHOLD } from "@/lib/face";
import { useLoom } from "@/context/LoomContext";
import { broadcastSOS } from "@/lib/sos";
import { pushSOS, publishLocation } from "@/lib/pairing";
import { toast } from "sonner";

interface Match {
  person: PersonRecord;
  distance: number;
}

type CameraState = "idle" | "loading-models" | "models-failed" | "requesting-camera" | "camera-denied" | "no-people" | "ready";

const CameraView = () => {
  const nav = useNavigate();
  const { profile, playAnchor } = useLoom();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peopleRef = useRef<PersonRecord[]>([]);
  const lastSpokenRef = useRef<{ id: string; t: number } | null>(null);

  const [camState, setCamState] = useState<CameraState>("loading-models");
  const [status, setStatus] = useState("Looking for familiar faces…");
  const [recognized, setRecognized] = useState<Match | null>(null);
  const [history, setHistory] = useState<RecognitionEvent[]>([]);

  // Load models + people
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ppl = await db.people.toArray();
      peopleRef.current = ppl;
      if (ppl.length === 0) {
        if (!cancelled) setCamState("no-people");
        return;
      }
      try {
        await loadFaceModels();
        if (!cancelled) setCamState("requesting-camera");
      } catch (e) {
        console.error(e);
        if (!cancelled) setCamState("models-failed");
      }
      // load recognition history
      const recent = await db.recognitions.orderBy("timestamp").reverse().limit(3).toArray();
      if (!cancelled) setHistory(recent);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Camera + recognition loop
  useEffect(() => {
    if (camState !== "requesting-camera" && camState !== "ready") return;
    let cancelled = false;
    let rafId: number;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 720, height: 720 },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCamState("ready");
      } catch (e) {
        console.error(e);
        setCamState("camera-denied");
      }
    };
    if (camState === "requesting-camera") start();

    const tick = async () => {
      if (cancelled) return;
      const v = videoRef.current;
      const c = overlayRef.current;
      if (v && c && camState === "ready" && v.videoWidth > 0) {
        c.width = v.clientWidth;
        c.height = v.clientHeight;
        const ctx = c.getContext("2d")!;
        ctx.clearRect(0, 0, c.width, c.height);
        try {
          const faces = await detectInVideo(v);
          const sx = c.width / v.videoWidth;
          const sy = c.height / v.videoHeight;
          let best: Match | null = null;
          for (const f of faces) {
            const { x, y, width, height } = f.detection.box;
            const mx = c.width - (x + width) * sx;
            const my = y * sy;
            const mw = width * sx;
            const mh = height * sy;
            ctx.lineWidth = 3;
            ctx.strokeStyle = "hsl(271 91% 65%)";
            ctx.fillStyle = "hsl(271 91% 65% / 0.14)";
            roundRect(ctx, mx, my, mw, mh, 16);
            ctx.fill();
            ctx.stroke();

            for (const p of peopleRef.current) {
              if (!p.faceDescriptor) continue;
              const d = euclidean(f.descriptor as unknown as Float32Array, p.faceDescriptor);
              if (d < MATCH_THRESHOLD && (!best || d < best.distance)) {
                best = { person: p, distance: d };
              }
            }
          }

          if (faces.length === 0) {
            setStatus("Looking for familiar faces…");
            setRecognized(null);
          } else if (best) {
            setRecognized(best);
            setStatus(`✓ ${best.person.name} recognized`);
            const now = Date.now();
            if (
              !lastSpokenRef.current ||
              lastSpokenRef.current.id !== best.person.id ||
              now - lastSpokenRef.current.t > 8000
            ) {
              lastSpokenRef.current = { id: best.person.id, t: now };
              if (best.person.voiceNoteBlob) {
                const url = URL.createObjectURL(best.person.voiceNoteBlob);
                const a = new Audio(url);
                a.play().catch(() => {});
                a.onended = () => URL.revokeObjectURL(url);
              }
              // log recognition
              const ev: RecognitionEvent = {
                id: uuid(),
                personId: best.person.id,
                personName: best.person.name,
                timestamp: new Date().toISOString(),
              };
              db.recognitions.add(ev).then(async () => {
                const recent = await db.recognitions.orderBy("timestamp").reverse().limit(3).toArray();
                setHistory(recent);
              });
            }
          } else {
            setRecognized(null);
            setStatus(`${faces.length} face${faces.length > 1 ? "s" : ""} seen — not recognized`);
          }
        } catch {
          // swallow per-frame errors
        }
      }
      rafId = window.setTimeout(() => requestAnimationFrame(tick), 350) as unknown as number;
    };
    tick();

    return () => {
      cancelled = true;
      if (rafId) clearTimeout(rafId);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [camState]);

  const panic = async () => {
    playAnchor();
    // Try to get current location for the SOS
    let loc: { lat: number; lng: number } | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
      );
      loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      publishLocation("patient", { ...loc, accuracy: pos.coords.accuracy, updatedAt: new Date().toISOString() });
    } catch {
      // ignore — SOS still goes
    }
    await db.panicEvents.add({
      id: uuid(),
      timestamp: new Date().toISOString(),
      triggeredBy: "manual",
      note: "From camera view",
      patientLocation: loc,
    });
    pushSOS(profile?.name ?? "Patient", loc ? { ...loc, updatedAt: new Date().toISOString() } : null);
    const r = await broadcastSOS(profile?.name ?? "Patient");
    toast.success(r.message, { description: "Your caregiver has been alerted." });
  };

  return (
    <main className="min-h-screen bg-background flex flex-col">
      <header className="container pt-5 pb-3 flex items-center justify-between">
        <LoomLogo linkTo="/dashboard" size="sm" />
        <Link to="/dashboard" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      </header>

      <div className="flex-1 container flex flex-col items-center pt-2 pb-8">
        <div className="relative w-full max-w-md aspect-square rounded-3xl overflow-hidden shadow-card bg-muted">
          {/* Video + overlay only relevant when ready */}
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />

          {/* ERROR STATES */}
          <ErrorOverlay state={camState} onRetry={() => setCamState("loading-models")} />

          {/* Status badge */}
          {camState === "ready" && (
            <div className="absolute top-4 left-4 right-4 flex justify-center pointer-events-none">
              <AnimatePresence mode="wait">
                <motion.div
                  key={status}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`px-5 py-2.5 rounded-full backdrop-blur shadow-soft text-sm font-medium ${
                    recognized ? "bg-primary text-primary-foreground" : "bg-white/85 text-foreground"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <ScanFace className="w-4 h-4" />
                    {status}
                  </span>
                </motion.div>
              </AnimatePresence>
            </div>
          )}

          {recognized && camState === "ready" && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-4 left-4 right-4 loom-card flex items-center gap-4 p-4"
            >
              <PersonAvatar person={recognized.person} />
              <div className="flex-1 min-w-0">
                <div className="text-lg font-semibold truncate">{recognized.person.name}</div>
                <div className="text-sm text-foreground/60 truncate">{recognized.person.relationship}</div>
              </div>
            </motion.div>
          )}
        </div>

        {/* History strip — last 3 recognized */}
        <div className="w-full max-w-md mt-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <History className="w-4 h-4" />
            <span>Last recognized</span>
          </div>
          {history.length === 0 ? (
            <div className="loom-card p-4 text-sm text-foreground/60">
              No recognitions yet. Familiar faces will appear here.
            </div>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {history.map((h) => (
                <li key={h.id} className="loom-card p-3">
                  <div className="text-sm font-semibold truncate">{h.personName}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(h.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button
          onClick={panic}
          className="mt-6 loom-tap rounded-full h-14 px-8 gradient-peach text-foreground animate-pulse-soft shadow-soft"
        >
          <Heart className="w-5 h-5 mr-2 text-destructive" />
          I need reassurance
        </Button>
      </div>
    </main>
  );
};

function ErrorOverlay({ state, onRetry }: { state: CameraState; onRetry: () => void }) {
  if (state === "ready") return null;

  const content = (() => {
    switch (state) {
      case "loading-models":
        return {
          icon: <Loader2 className="w-10 h-10 text-primary animate-spin" />,
          title: "Loading face recognition…",
          desc: "Downloading models from CDN. This only happens once.",
          action: null,
        };
      case "models-failed":
        return {
          icon: <AlertTriangle className="w-10 h-10 text-destructive" />,
          title: "Couldn't load face models",
          desc: "Check your internet connection and try again.",
          action: (
            <Button onClick={onRetry} className="rounded-full gradient-sage text-white h-11 px-6">
              Retry
            </Button>
          ),
        };
      case "requesting-camera":
        return {
          icon: <Loader2 className="w-10 h-10 text-primary animate-spin" />,
          title: "Opening camera…",
          desc: "Please allow camera access when prompted.",
          action: null,
        };
      case "camera-denied":
        return {
          icon: <CameraOff className="w-10 h-10 text-destructive" />,
          title: "Camera access blocked",
          desc: "Allow camera in your browser settings, then tap Retry.",
          action: (
            <Button onClick={onRetry} className="rounded-full gradient-sage text-white h-11 px-6">
              Retry
            </Button>
          ),
        };
      case "no-people":
        return {
          icon: <UserPlus className="w-10 h-10 text-primary" />,
          title: "No people registered yet",
          desc: "Add at least one person so Loom knows who to recognize.",
          action: (
            <Link to="/add-person">
              <Button className="rounded-full gradient-sage text-white h-11 px-6">
                <UserPlus className="w-4 h-4 mr-2" /> Add a person
              </Button>
            </Link>
          ),
        };
      default:
        return null;
    }
  })();

  if (!content) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/95 p-6">
      <div className="text-center max-w-xs">
        <div className="w-20 h-20 rounded-3xl gradient-lavender mx-auto flex items-center justify-center mb-4">
          {content.icon}
        </div>
        <div className="text-lg font-semibold">{content.title}</div>
        <p className="text-sm text-foreground/70 mt-2">{content.desc}</p>
        {content.action && <div className="mt-5 flex justify-center">{content.action}</div>}
      </div>
    </div>
  );
}

function PersonAvatar({ person }: { person: PersonRecord }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    const u = URL.createObjectURL(person.imageBlob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [person.imageBlob]);
  return <img src={url} alt={person.name} className="w-14 h-14 rounded-2xl object-cover shrink-0" />;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default CameraView;
