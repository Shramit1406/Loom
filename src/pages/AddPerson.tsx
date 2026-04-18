import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoomLogo from "@/components/LoomLogo";
import PhotoCapture from "@/components/PhotoCapture";
import AudioRecorder from "@/components/AudioRecorder";
import { db, uuid } from "@/lib/db";
import { getDescriptorFromImage, loadImage } from "@/lib/face";
import { toast } from "sonner";

const RELATIONSHIPS = ["Daughter", "Son", "Spouse", "Sibling", "Grandchild", "Friend", "Nurse", "Neighbor", "Caregiver", "Other"];

const AddPerson = () => {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [rel, setRel] = useState("");
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim() && rel.trim() && photoBlob;

  const save = async () => {
    if (!canSave || !photoBlob) return;
    setSaving(true);
    let descriptor: number[] | undefined;
    try {
      const url = URL.createObjectURL(photoBlob);
      const img = await loadImage(url);
      const d = await getDescriptorFromImage(img);
      URL.revokeObjectURL(url);
      if (d) descriptor = Array.from(d);
      else toast.warning("No clear face detected — Loom can still play the voice note from the dashboard.");
    } catch (e) {
      console.warn("Face descriptor failed (offline / model load issue)", e);
    }

    await db.people.add({
      id: uuid(),
      name: name.trim(),
      relationship: rel.trim(),
      imageBlob: photoBlob,
      voiceNoteBlob: voiceBlob,
      faceDescriptor: descriptor,
      createdAt: new Date().toISOString(),
    });
    toast.success(`${name} added to your people`);
    nav("/dashboard");
  };

  return (
    <main className="min-h-screen bg-background pb-32">
      <header className="container pt-6 pb-4 flex items-center justify-between">
        <LoomLogo linkTo="/dashboard" size="sm" />
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      </header>

      <section className="container max-w-xl">
        <h1 className="text-3xl font-semibold tracking-tight">Add a person</h1>
        <p className="text-foreground/70 mt-2">A photo, a name, and a few words from you about who they are.</p>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="loom-card mt-8 space-y-8">
          <div>
            <Label className="text-base mb-3 block">Photo</Label>
            <PhotoCapture onCapture={setPhotoBlob} />
          </div>

          <div>
            <Label htmlFor="name" className="text-base mb-3 block">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sarah"
              className="h-14 text-lg rounded-2xl px-5 border-2"
            />
          </div>

          <div>
            <Label className="text-base mb-3 block">Relationship</Label>
            <div className="flex flex-wrap gap-2">
              {RELATIONSHIPS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRel(r)}
                  className={`loom-tap px-4 h-11 rounded-full border-2 text-sm transition ${
                    rel === r
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-border hover:border-primary/40"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {rel === "Other" && (
              <Input
                value={rel === "Other" ? "" : rel}
                onChange={(e) => setRel(e.target.value)}
                placeholder="Describe the relationship"
                className="mt-3 h-12 rounded-2xl px-5 border-2"
              />
            )}
          </div>

          <div>
            <Label className="text-base mb-3 block">Voice note (up to 30s)</Label>
            <AudioRecorder
              onRecordingComplete={setVoiceBlob}
              promptText={name ? `This is ${name}. They are ${rel || "someone you love"}.` : "This is… they are…"}
              maxDuration={30}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={() => nav("/dashboard")} className="rounded-full h-12 px-6">
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={!canSave || saving}
              className="loom-tap rounded-full h-12 px-6 gradient-sage text-white ml-auto"
            >
              <Save className="w-5 h-5 mr-2" />
              {saving ? "Saving…" : "Save person"}
            </Button>
          </div>
        </motion.div>
      </section>
    </main>
  );
};

export default AddPerson;
