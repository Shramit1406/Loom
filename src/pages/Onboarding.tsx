import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LoomLogo from "@/components/LoomLogo";
import AudioRecorder from "@/components/AudioRecorder";
import { db, PROFILE_ID } from "@/lib/db";
import { useLoom } from "@/context/LoomContext";
import { toast } from "sonner";

const Onboarding = () => {
  const nav = useNavigate();
  const { refreshProfile } = useLoom();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    if (!name.trim() || !voiceBlob) return;
    setSaving(true);
    await db.userProfile.put({
      id: PROFILE_ID,
      name: name.trim(),
      anchorVoiceBlob: voiceBlob,
      createdAt: new Date().toISOString(),
    });
    await refreshProfile();
    toast.success("Your anchor is ready");
    nav("/dashboard");
  };

  const stepTitles = ["Welcome", "Your name", "Record your anchor voice", "Listen back", "Ready"];

  return (
    <main className="min-h-screen relative overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-16 w-96 h-96 rounded-full gradient-lavender opacity-40 blur-3xl" />
        <div className="absolute bottom-0 -right-20 w-[28rem] h-[28rem] rounded-full gradient-peach opacity-40 blur-3xl" />
      </div>

      <nav className="relative z-10 container flex items-center justify-between py-6">
        <LoomLogo linkTo="/" />
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back home
        </Link>
      </nav>

      <section className="relative z-10 container max-w-xl py-10">
        {/* Progress */}
        <div className="flex gap-2 mb-10">
          {stepTitles.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all ${i <= step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35 }}
            className="loom-card"
          >
            {step === 0 && (
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto rounded-2xl gradient-sage flex items-center justify-center mb-6">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-3xl font-semibold mb-3">Let's set up your memory anchor</h1>
                <p className="text-base text-foreground/70 mb-8">
                  In a few gentle steps we'll record your own voice. It becomes the calmest sound you can hear when you feel lost.
                </p>
                <Button onClick={() => setStep(1)} size="lg" className="loom-tap rounded-full h-14 px-8 gradient-sage text-white">
                  Begin <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            )}

            {step === 1 && (
              <div>
                <h2 className="text-2xl font-semibold mb-2">What's your name?</h2>
                <p className="text-foreground/70 mb-6">We'll use it to greet you and in your anchor recording.</p>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Margaret"
                  className="h-14 text-lg rounded-2xl px-5 border-2"
                  autoFocus
                />
                <div className="flex gap-3 mt-8">
                  <Button variant="ghost" onClick={() => setStep(0)} className="rounded-full h-12 px-6">Back</Button>
                  <Button
                    onClick={() => setStep(2)}
                    disabled={!name.trim()}
                    className="loom-tap rounded-full h-12 px-6 gradient-sage text-white ml-auto"
                  >
                    Continue <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-2xl font-semibold mb-2">Record your anchor voice</h2>
                <p className="text-foreground/70 mb-6">
                  Speak softly, the way you'd reassure yourself. Read this out loud:
                </p>
                <AudioRecorder
                  initialBlob={voiceBlob}
                  onRecordingComplete={(b) => setVoiceBlob(b)}
                  promptText={`My name is ${name}. I am safe.`}
                  maxDuration={20}
                />
                <div className="flex gap-3 mt-8">
                  <Button variant="ghost" onClick={() => setStep(1)} className="rounded-full h-12 px-6">Back</Button>
                  <Button
                    onClick={() => setStep(3)}
                    disabled={!voiceBlob}
                    className="loom-tap rounded-full h-12 px-6 gradient-sage text-white ml-auto"
                  >
                    Continue <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="text-2xl font-semibold mb-2">Listen back</h2>
                <p className="text-foreground/70 mb-6">
                  Does it sound calming? You can re-record if it doesn't feel right.
                </p>
                <AudioRecorder
                  initialBlob={voiceBlob}
                  onRecordingComplete={(b) => setVoiceBlob(b)}
                  promptText={`My name is ${name}. I am safe.`}
                  maxDuration={20}
                />
                <div className="flex gap-3 mt-8">
                  <Button variant="ghost" onClick={() => setStep(2)} className="rounded-full h-12 px-6">Back</Button>
                  <Button
                    onClick={() => setStep(4)}
                    disabled={!voiceBlob}
                    className="loom-tap rounded-full h-12 px-6 gradient-sage text-white ml-auto"
                  >
                    Sounds good <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto rounded-2xl gradient-peach flex items-center justify-center mb-6">
                  <Check className="w-8 h-8 text-foreground" />
                </div>
                <h2 className="text-3xl font-semibold mb-3">Your anchor is ready, {name}</h2>
                <p className="text-base text-foreground/70 mb-8">
                  Next, you can add the people you love. Loom will recognize their faces and play your voice.
                </p>
                <Button
                  onClick={finish}
                  disabled={saving}
                  size="lg"
                  className="loom-tap rounded-full h-14 px-8 gradient-sage text-white"
                >
                  {saving ? "Saving…" : "Start your journey"} <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </section>
    </main>
  );
};

export default Onboarding;
