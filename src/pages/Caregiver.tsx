import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Download, Mic, Trash2, ShieldAlert, Clock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LoomLogo from "@/components/LoomLogo";
import AudioRecorder from "@/components/AudioRecorder";
import { db, PanicEvent, PersonRecord, PROFILE_ID } from "@/lib/db";
import { useLoom } from "@/context/LoomContext";
import { toast } from "sonner";

const Caregiver = () => {
  const nav = useNavigate();
  const { profile, mode, setMode, refreshProfile } = useLoom();
  const [people, setPeople] = useState<PersonRecord[]>([]);
  const [events, setEvents] = useState<PanicEvent[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRel, setEditRel] = useState("");
  const [reRecording, setReRecording] = useState(false);

  const reload = async () => {
    setPeople(await db.people.orderBy("createdAt").reverse().toArray());
    setEvents(await db.panicEvents.orderBy("timestamp").reverse().toArray());
  };

  useEffect(() => {
    if (mode !== "caregiver") {
      nav("/dashboard");
      return;
    }
    reload();
  }, [mode, nav]);

  const startEdit = (p: PersonRecord) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditRel(p.relationship);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await db.people.update(editingId, { name: editName.trim(), relationship: editRel.trim() });
    setEditingId(null);
    await reload();
    toast.success("Updated");
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this person from Loom?")) return;
    await db.people.delete(id);
    await reload();
    toast.success("Person removed");
  };

  const onAnchorRecorded = async (b: Blob | null) => {
    if (!b || !profile) return;
    await db.userProfile.update(PROFILE_ID, { anchorVoiceBlob: b });
    await refreshProfile();
    toast.success("Anchor voice updated");
    setReRecording(false);
  };

  const exportData = async () => {
    const ppl = await db.people.toArray();
    const evs = await db.panicEvents.toArray();
    const prof = await db.userProfile.get(PROFILE_ID);
    const safePeople = ppl.map((p) => ({
      id: p.id,
      name: p.name,
      relationship: p.relationship,
      hasPhoto: !!p.imageBlob,
      hasVoiceNote: !!p.voiceNoteBlob,
      hasFaceData: !!p.faceDescriptor,
      createdAt: p.createdAt,
    }));
    const data = {
      exportedAt: new Date().toISOString(),
      profile: prof ? { name: prof.name, hasAnchorVoice: !!prof.anchorVoiceBlob, createdAt: prof.createdAt } : null,
      people: safePeople,
      panicEvents: evs,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `loom-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded");
  };

  return (
    <main className="min-h-screen bg-background pb-32">
      <header className="container pt-6 pb-4 flex items-center justify-between">
        <LoomLogo linkTo="/dashboard" size="sm" />
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Patient view
        </Link>
      </header>

      <section className="container max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-4 py-1.5 text-sm">
          <ShieldAlert className="w-4 h-4 text-primary" /> Caregiver mode
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mt-3">Caregiver dashboard</h1>
        <p className="text-foreground/70 mt-2">Manage {profile?.name ?? "the patient"}'s memory anchor and people.</p>

        {/* Panic history */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="loom-card mt-8"
        >
          <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-primary" /> Panic history
          </h2>
          {events.length === 0 ? (
            <p className="text-foreground/60">No panic events yet. That's a good sign.</p>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((e) => (
                <li key={e.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="text-base font-medium">
                      {new Date(e.timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                    {e.note && <div className="text-sm text-foreground/60">{e.note}</div>}
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full bg-secondary text-foreground/70 capitalize">{e.triggeredBy}</span>
                </li>
              ))}
            </ul>
          )}
        </motion.section>

        {/* People management */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="loom-card mt-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Manage people</h2>
            <Link to="/add-person">
              <Button variant="outline" className="rounded-full border-2 h-10">Add person</Button>
            </Link>
          </div>
          {people.length === 0 ? (
            <p className="text-foreground/60">No people added yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {people.map((p) => (
                <li key={p.id} className="py-4">
                  {editingId === p.id ? (
                    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-11 rounded-xl border-2" />
                      <Input value={editRel} onChange={(e) => setEditRel(e.target.value)} className="h-11 rounded-xl border-2" />
                      <div className="flex gap-2">
                        <Button onClick={saveEdit} className="rounded-full gradient-sage text-white h-10">Save</Button>
                        <Button variant="ghost" onClick={() => setEditingId(null)} className="rounded-full h-10">Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      <PersonThumb person={p} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{p.name}</div>
                        <div className="text-sm text-foreground/60 truncate">
                          {p.relationship}
                          {p.faceDescriptor ? "" : " · no face data"}
                          {p.voiceNoteBlob ? "" : " · no voice note"}
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => startEdit(p)} className="rounded-full h-10 w-10">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(p.id)} className="rounded-full h-10 w-10 text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </motion.section>

        {/* Voice settings */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="loom-card mt-6"
        >
          <h2 className="text-xl font-semibold flex items-center gap-2 mb-2">
            <Mic className="w-5 h-5 text-primary" /> Anchor voice
          </h2>
          <p className="text-foreground/70 mb-5">
            Played whenever {profile?.name ?? "the patient"} feels confused. Re-record if their voice has changed.
          </p>
          {reRecording ? (
            <AudioRecorder
              initialBlob={profile?.anchorVoiceBlob ?? null}
              onRecordingComplete={onAnchorRecorded}
              promptText={`My name is ${profile?.name ?? ""}. I am safe.`}
              maxDuration={20}
            />
          ) : (
            <Button onClick={() => setReRecording(true)} className="rounded-full gradient-sage text-white h-12 px-6">
              <Mic className="w-5 h-5 mr-2" /> Re-record anchor voice
            </Button>
          )}
        </motion.section>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <Button onClick={exportData} variant="outline" className="rounded-full border-2 h-12 px-6">
            <Download className="w-5 h-5 mr-2" /> Export data (JSON)
          </Button>
          <Button onClick={() => { setMode("patient"); nav("/dashboard"); }} className="rounded-full gradient-sage text-white h-12 px-6 sm:ml-auto">
            Switch to patient mode
          </Button>
        </div>
      </section>
    </main>
  );
};

function PersonThumb({ person }: { person: PersonRecord }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(person.imageBlob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [person.imageBlob]);
  return <img src={url} alt={person.name} className="w-12 h-12 rounded-2xl object-cover shrink-0" />;
}

export default Caregiver;
