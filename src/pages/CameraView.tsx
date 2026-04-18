import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Heart, Loader2, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoomLogo from "@/components/LoomLogo";
import { db, PersonRecord, uuid } from "@/lib/db";
import { detectInVideo, euclidean, loadFaceModels, MATCH_THRESHOLD } from "@/lib/face";
import { useLoom } from "@/context/LoomContext";
import { broadcastSOS } from "@/lib/sos";
import { toast } from "sonner";

interface Match {
  person: PersonRecord;
  distance: number;
}

const CameraView = () => {
  const nav = useNavigate();
  const { profile, playAnchor } = useLoom();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peopleRef = useRef<PersonRecord[]>([]);
  const lastSpokenRef = useRef<{ id: string; t: number } | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [status, setStatus] = useState("Looking for familiar faces…");
  const [recognized, setRecognized] = useState<Match | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      peopleRef.current = await db.people.toArray();
      try {
        await loadFaceModels();
        if (!cancelled) setModelReady(true);
      } catch (e) {
        console.error(e);
        toast.error("Face models failed to load — recognition is disabled.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
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
      } catch (e) {
        console.error(e);
        toast.error("Camera access denied.");
        setStatus("Camera unavailable");
      }
    };
    start();

    const tick = async () => {
      if (cancelled) return;
      const v = videoRef.current;
      const c = overlayRef.current;
      if (v && c && modelReady && v.videoWidth > 0) {
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
            // Mirror x because we display the video mirrored
            const mx = c.width - (x + width) * sx;
            const my = y * sy;
            const mw = width * sx;
            const mh = height * sy;
            // Draw soft sage box
            ctx.lineWidth = 3;
            ctx.strokeStyle = "hsl(120 25% 65%)";
            ctx.fillStyle = "hsl(120 25% 65% / 0.12)";
            roundRect(ctx, mx, my, mw, mh, 16);
            ctx.fill();
            ctx.stroke();

            // Match
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
            }
          } else {
            setRecognized(null);
            setStatus(`${faces.length} face${faces.length > 1 ? "s" : ""} seen — not recognized`);
          }
        } catch (e) {
          // swallow detection errors per frame
        }
      }
      rafId = window.setTimeout(() => requestAnimationFrame(tick), 350) as unknown as number;
    };
    tick();

    return () => {
      cancelled = true;
      if (rafId) clearTimeout(rafId);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [modelReady]);

  const panic = async () => {
    playAnchor();
    await db.panicEvents.add({
      id: uuid(),
      timestamp: new Date().toISOString(),
      triggeredBy: "manual",
      note: "From camera view",
    });
    const r = await broadcastSOS(profile?.name ?? "Patient");
    toast.success(r.message, { description: "You are safe. Take a slow breath." });
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
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />

          {/* Status badge */}
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
                {!modelReady ? (
                  <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading face models…</span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <ScanFace className="w-4 h-4" />
                    {status}
                  </span>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {recognized && (
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

        {!modelReady && (
          <p className="text-sm text-muted-foreground mt-4 text-center max-w-sm">
            Loading face recognition models from CDN. This only happens once.
          </p>
        )}

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
