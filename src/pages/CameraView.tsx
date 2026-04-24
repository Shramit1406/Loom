import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Heart,
  Loader2,
  ScanFace,
  CameraOff,
  UserPlus,
  History,
  CheckCircle2,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import LoomLogo from "@/components/LoomLogo";
import { db, PersonRecord, RecognitionEvent, uuid } from "@/lib/db";
import {
  detectInVideo,
  euclidean,
  loadFaceModels,
  modelsLoaded,
  MATCH_THRESHOLD,
  FaceKeypoint,
} from "@/lib/face";
import { useLoom } from "@/context/LoomContext";
import { broadcastSOS } from "@/lib/sos";
import { publishLocation } from "@/lib/pairing";
import { toast } from "sonner";

interface Match {
  person: PersonRecord;
  distance: number;
}

type CamStatus = "starting" | "denied" | "live";
type ScanStatus = "loading-model" | "no-face" | "unrecognized" | "recognized";

// ─── MediaPipe FaceMesh landmark paths (standard 468-point indices) ────────────

const FACE_OVAL   = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];
const LEFT_EYE    = [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398,362];
const RIGHT_EYE   = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246,33];
const LEFT_BROW   = [276,283,282,295,285,300,293,334,296,336];
const RIGHT_BROW  = [46,53,52,65,55,70,63,105,66,107];
const NOSE_BRIDGE = [168,6,197,195,5,4,1,19,94];
const LIPS_OUTER  = [61,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185,61];
const LIPS_INNER  = [78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191,78];
const MESH_PATHS  = [FACE_OVAL, LEFT_EYE, RIGHT_EYE, LEFT_BROW, RIGHT_BROW, NOSE_BRIDGE, LIPS_OUTER, LIPS_INNER];

// ─── Canvas drawing helpers ────────────────────────────────────────────────────

/**
 * Draw MediaPipe face mesh lines.
 * Video is CSS-mirrored (-scale-x-100) but keypoints are in natural space,
 * so we mirror x in JS: drawX = videoWidth - kp.x
 */
function drawFaceMesh(
  ctx: CanvasRenderingContext2D,
  kps: FaceKeypoint[],
  W: number,
  isMatch: boolean
) {
  const colour = isMatch ? "hsl(142 71% 55%)" : "hsl(270 76% 72%)";
  ctx.strokeStyle = colour;
  ctx.lineWidth   = 1.5;
  ctx.lineJoin    = "round";
  ctx.globalAlpha = 0.80;

  const pt = (i: number) => ({ x: W - kps[i].x, y: kps[i].y });

  for (const path of MESH_PATHS) {
    if (path.some((idx) => idx >= kps.length)) continue;
    ctx.beginPath();
    const s = pt(path[0]);
    ctx.moveTo(s.x, s.y);
    for (let i = 1; i < path.length; i++) {
      const p = pt(path[i]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1.0;
}

/** Scanner-style corner bracket around a face bounding box. */
function drawCornerBox(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
  W: number,
  isMatch: boolean
) {
  // Mirror x
  const rx = W - box.x - box.width;
  const ry = box.y;
  const rw = box.width;
  const rh = box.height;
  const cl = Math.min(rw * 0.22, rh * 0.22, 38);

  const colour = isMatch ? "hsl(142 71% 55%)" : "hsl(270 76% 72%)";
  ctx.strokeStyle = colour;
  ctx.lineWidth   = 3;
  ctx.lineCap     = "round";
  ctx.shadowColor = colour;
  ctx.shadowBlur  = 10;

  ctx.beginPath();
  // Top-left
  ctx.moveTo(rx + cl, ry);      ctx.lineTo(rx, ry);      ctx.lineTo(rx, ry + cl);
  // Top-right
  ctx.moveTo(rx + rw - cl, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + cl);
  // Bottom-left
  ctx.moveTo(rx, ry + rh - cl); ctx.lineTo(rx, ry + rh); ctx.lineTo(rx + cl, ry + rh);
  // Bottom-right
  ctx.moveTo(rx + rw - cl, ry + rh); ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx + rw, ry + rh - cl);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

/** Draw name label above the face box. */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number },
  W: number,
  name: string
) {
  const rx = W - box.x - box.width;
  const ry = box.y;
  ctx.font = "bold 22px system-ui, sans-serif";
  const tw = ctx.measureText(name).width;
  const lx = rx;
  const ly = ry - 10;
  ctx.fillStyle = "hsl(142 71% 40%)";
  roundRect(ctx, lx, ly - 28, tw + 20, 34, 8);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText(name, lx + 10, ly - 2);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ─── Component ────────────────────────────────────────────────────────────────

const CameraView = () => {
  const nav = useNavigate();
  const { profile, playAnchor } = useLoom();

  const videoRef   = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const peopleRef  = useRef<PersonRecord[]>([]);
  const lastSpokenRef = useRef<{ id: string; t: number } | null>(null);

  // Loop control — never trigger re-renders inside the loop
  const cancelRef     = useRef(false);
  const loopActiveRef = useRef(false);
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [camStatus,  setCamStatus]  = useState<CamStatus>("starting");
  const [scanStatus, setScanStatus] = useState<ScanStatus>("loading-model");
  const [recognized, setRecognized] = useState<Match | null>(null);
  const [noPeople,   setNoPeople]   = useState(false);
  const [history,    setHistory]    = useState<RecognitionEvent[]>([]);

  // ── Initialise camera + load models ────────────────────────────────────────
  useEffect(() => {
    cancelRef.current     = false;
    loopActiveRef.current = false;

    const init = async () => {
      try {
        // Load people
        const ppl = await db.people.toArray();
        peopleRef.current = ppl;
        if (ppl.length === 0) setNoPeople(true);

        // History
        const recent = await db.recognitions.orderBy("timestamp").reverse().limit(3).toArray();
        if (!cancelRef.current) setHistory(recent);

        // ── Start camera (no waiting for models) ──
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
          audio: false,
        });

        if (cancelRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }

        streamRef.current = stream;
        const vid = videoRef.current;
        if (vid) {
          vid.srcObject = stream;
          await vid.play();
        }
        setCamStatus("live");

        // ── Load models in background (camera already showing) ──
        if (ppl.length > 0) {
          try {
            await loadFaceModels();
          } catch (e) {
            console.error("[CameraView] model load error:", e);
            // still continue — loop will just return empty array
          }
          if (!cancelRef.current) setScanStatus("no-face");
        }
      } catch (err: unknown) {
        console.error("[CameraView] init error:", err);
        if (!cancelRef.current) {
          const msg = String(err);
          const isDenied = msg.includes("Permission") || msg.includes("NotAllowed") || msg.includes("NotFound");
          setCamStatus(isDenied ? "denied" : "denied"); // show denied screen for any camera error
        }
      }
    };

    init();

    return () => {
      cancelRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // ── Kick off recognition loop once camera is live ──────────────────────────
  useEffect(() => {
    if (camStatus !== "live") return;
    if (loopActiveRef.current) return;
    loopActiveRef.current = true;

    const loop = async () => {
      if (cancelRef.current) return;

      // Wait for models
      if (!modelsLoaded()) {
        timerRef.current = setTimeout(loop, 500);
        return;
      }

      const v = videoRef.current;
      const c = overlayRef.current;

      if (v && c && v.videoWidth > 0 && v.readyState >= 2) {
        // Set canvas to video intrinsic size; CSS scales it identically to the video
        c.width  = v.videoWidth;
        c.height = v.videoHeight;
        const W   = v.videoWidth;
        const ctx = c.getContext("2d")!;
        ctx.clearRect(0, 0, c.width, c.height);

        try {
          const faces = await detectInVideo(v);
          if (cancelRef.current) return;

          const ppl = peopleRef.current.filter(
            (p) => p.faceDescriptor && p.faceDescriptor.length > 0
          );
          let best: Match | null = null;

          for (const f of faces) {
            // Determine match for this face
            let fMatch: Match | null = null;
            for (const p of ppl) {
              const dist = euclidean(f.descriptor, p.faceDescriptor as number[]);
              if (dist < MATCH_THRESHOLD && (!fMatch || dist < fMatch.distance)) {
                fMatch = { person: p, distance: dist };
              }
            }
            const isMatch = fMatch !== null;

            // Draw face mesh lines
            drawFaceMesh(ctx, f.keypoints, W, isMatch);

            // Draw corner bracket box
            drawCornerBox(ctx, f.detection.box, W, isMatch);

            // Draw name label
            if (fMatch) drawLabel(ctx, f.detection.box, W, fMatch.person.name);

            // Track best global match
            if (fMatch && (!best || fMatch.distance < best.distance)) best = fMatch;
          }

          // Update status
          if (faces.length === 0) {
            setScanStatus("no-face");
            setRecognized(null);
          } else if (best) {
            setScanStatus("recognized");
            setRecognized(best);

            // Voice note — throttled per person, 8 s
            const now = Date.now();
            const last = lastSpokenRef.current;
            if (!last || last.id !== best.person.id || now - last.t > 8000) {
              lastSpokenRef.current = { id: best.person.id, t: now };
              if (best.person.voiceNoteBlob) {
                const url = URL.createObjectURL(best.person.voiceNoteBlob);
                const a = new Audio(url);
                a.play().catch(() => {});
                a.onended = () => URL.revokeObjectURL(url);
              }
              const ev: RecognitionEvent = {
                id: uuid(), personId: best.person.id,
                personName: best.person.name,
                timestamp: new Date().toISOString(),
              };
              db.recognitions.add(ev).then(async () => {
                const recent = await db.recognitions.orderBy("timestamp").reverse().limit(3).toArray();
                if (!cancelRef.current) setHistory(recent);
              });
            }
          } else {
            setScanStatus("unrecognized");
            setRecognized(null);
          }
        } catch {
          // swallow per-frame errors
        }
      }

      // Schedule next frame
      timerRef.current = setTimeout(loop, 350);
    };

    loop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camStatus]);

  // ── Panic ──────────────────────────────────────────────────────────────────
  const panic = async () => {
    playAnchor();
    let loc: { lat: number; lng: number } | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
      );
      loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      publishLocation("patient", { ...loc, accuracy: pos.coords.accuracy, updatedAt: new Date().toISOString() });
    } catch { /* ignore */ }

    await db.panicEvents.add({ id: uuid(), timestamp: new Date().toISOString(), triggeredBy: "manual", note: "From camera view", patientLocation: loc });
    const r = await broadcastSOS(profile?.name ?? "Patient");
    if (r.ok) {
      toast.success(r.message, { description: "Your caregiver has been alerted." });
    } else {
      toast.error(r.message);
    }
  };

  // ── Badge config ───────────────────────────────────────────────────────────
  const badge = (() => {
    if (camStatus === "starting") return { text: "Opening camera…",                   cls: "bg-white/85 text-foreground" };
    if (camStatus === "denied")   return null;
    if (noPeople)                 return { text: "Add people to enable recognition", cls: "bg-amber-100/90 text-amber-800" };
    switch (scanStatus) {
      case "loading-model":  return { text: "Preparing face AI…",          cls: "bg-white/85 text-foreground" };
      case "no-face":        return { text: "Looking for familiar faces…", cls: "bg-white/85 text-foreground" };
      case "unrecognized":   return { text: "Face seen — not recognised",  cls: "bg-white/85 text-foreground" };
      case "recognized":     return { text: `✓ ${recognized?.person.name}`, cls: "bg-primary text-primary-foreground" };
    }
  })();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-background flex flex-col">
      <header className="container pt-5 pb-3 flex items-center justify-between">
        <LoomLogo linkTo="/dashboard" size="sm" />
        <Link to="/dashboard" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      </header>

      <div className="flex-1 container flex flex-col items-center pt-2 pb-8">

        {/* ── Camera viewport ─────────────────────────────────────────────── */}
        <div className="relative w-full max-w-md aspect-square rounded-3xl overflow-hidden shadow-card bg-black">

          {/* Live video — CSS-mirrored */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            // @ts-ignore
            webkit-playsinline="true"
            muted
            className="w-full h-full object-cover -scale-x-100"
          />

          {/* Face-mesh canvas — NOT CSS-flipped; we mirror x in drawing code */}
          <canvas
            ref={overlayRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
          />

          {/* Starting spinner */}
          {camStatus === "starting" && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 gap-3">
              <Loader2 className="w-10 h-10 text-white animate-spin" />
              <span className="text-white text-sm font-medium">Opening camera…</span>
            </div>
          )}

          {/* Camera denied / error */}
          {camStatus === "denied" && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/85 gap-4 p-6 text-center">
              <CameraOff className="w-12 h-12 text-red-400" />
              <div className="text-white font-semibold text-lg">Camera unavailable</div>
              <p className="text-white/70 text-sm">Allow camera access in your device settings, then tap Retry.</p>
              <Button onClick={() => window.location.reload()} className="rounded-full h-11 px-6 bg-white text-black hover:bg-white/90">
                Retry
              </Button>
            </div>
          )}

          {/* No people nudge */}
          {noPeople && camStatus === "live" && (
            <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center pb-5 pt-4 gap-3 bg-gradient-to-t from-black/80 to-transparent">
              <UserPlus className="w-7 h-7 text-white/80" />
              <p className="text-white text-sm font-medium">No people added yet</p>
              <Link to="/add-person">
                <Button size="sm" className="rounded-full h-9 px-5 bg-white text-black hover:bg-white/90">
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Add a person
                </Button>
              </Link>
            </div>
          )}

          {/* Model-loading pill (non-blocking) */}
          {camStatus === "live" && scanStatus === "loading-model" && !noPeople && (
            <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
              <div className="bg-black/60 backdrop-blur rounded-full px-4 py-2 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                <span className="text-white text-xs font-medium">Preparing face AI…</span>
              </div>
            </div>
          )}

          {/* Status badge — top */}
          {badge && camStatus !== "starting" && camStatus !== "denied" && scanStatus !== "loading-model" && !noPeople && (
            <div className="absolute top-4 left-4 right-4 flex justify-center pointer-events-none">
              <AnimatePresence mode="wait">
                <motion.div
                  key={badge.text}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={`px-4 py-2 rounded-full backdrop-blur shadow-soft text-sm font-medium ${badge.cls}`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {scanStatus === "recognized" ? <CheckCircle2 className="w-4 h-4" /> : <ScanFace className="w-4 h-4" />}
                    {badge.text}
                  </span>
                </motion.div>
              </AnimatePresence>
            </div>
          )}

          {/* Recognised person card */}
          {recognized && scanStatus === "recognized" && (
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
              <Eye className="w-5 h-5 text-primary shrink-0" />
            </motion.div>
          )}
        </div>

        {/* ── History strip ────────────────────────────────────────────────── */}
        <div className="w-full max-w-md mt-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <History className="w-4 h-4" />
            <span>Last recognised</span>
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

        {/* ── Panic ─────────────────────────────────────────────────────────── */}
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

// ─── PersonAvatar ─────────────────────────────────────────────────────────────

function PersonAvatar({ person }: { person: PersonRecord }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    const u = URL.createObjectURL(person.imageBlob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [person.imageBlob]);
  return <img src={url} alt={person.name} className="w-14 h-14 rounded-2xl object-cover shrink-0" />;
}

export default CameraView;
