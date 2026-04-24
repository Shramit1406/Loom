import { useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Trash2, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceRecorder } from "capacitor-voice-recorder";
import { toast } from "sonner";

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob | null) => void;
  initialBlob?: Blob | null;
  maxDuration?: number;
  promptText?: string;
}

export default function AudioRecorder({
  onRecordingComplete,
  initialBlob = null,
  maxDuration = 30,
  promptText,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(initialBlob);
  const [url, setUrl] = useState<string | null>(initialBlob ? URL.createObjectURL(initialBlob) : null);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    try {
      const { value } = await VoiceRecorder.startRecording();
      if (!value) throw new Error("Failed to start recording");
      setIsRecording(true);
      setElapsed(0);
      tickRef.current = window.setInterval(() => {
        setElapsed((e) => {
          if (e + 1 >= maxDuration) {
            stop();
          }
          return e + 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Mic error", err);
      toast.error("Microphone error", { description: "Please ensure microphone permissions are granted in settings." });
    }
  };

  const stop = async () => {
    try {
      const result = await VoiceRecorder.stopRecording();
      setIsRecording(false);
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }

      if (result.value) {
        const { recordDataBase64, mimeType } = result.value;
        const b = base64ToBlob(recordDataBase64, mimeType);
        if (url) URL.revokeObjectURL(url);
        const u = URL.createObjectURL(b);
        setBlob(b);
        setUrl(u);
        onRecordingComplete(b);
      }
    } catch (err) {
      console.error("Stop recording failed", err);
      toast.error("Failed to save recording");
    }
  };

  function base64ToBlob(base64: string, type: string) {
    const bin = atob(base64);
    const len = bin.length;
    const array = new Uint8Array(len);
    for (let i = 0; i < len; i++) array[i] = bin.charCodeAt(i);
    return new Blob([array], { type });
  }

  const togglePlay = () => {
    if (!url) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
      setPlaying(true);
    }
  };

  const remove = () => {
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    setBlob(null);
    setPlaying(false);
    audioRef.current = null;
    onRecordingComplete(null);
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {promptText && (
        <p className="text-center text-base text-muted-foreground italic">
          "{promptText}"
        </p>
      )}

      {!isRecording && !blob && (
        <Button
          onClick={start}
          size="lg"
          className="loom-tap gradient-sage text-white rounded-full px-8 h-14 text-lg shadow-soft hover:shadow-glow"
        >
          <Mic className="w-6 h-6 mr-2" />
          Start recording
        </Button>
      )}

      {isRecording && (
        <Button
          onClick={stop}
          size="lg"
          className="loom-tap rounded-full px-8 h-14 text-lg bg-destructive text-destructive-foreground animate-pulse-soft"
        >
          <Square className="w-6 h-6 mr-2" />
          Recording {elapsed}s — Tap to stop
        </Button>
      )}

      {blob && !isRecording && (
        <div className="flex items-center gap-3">
          <Button
            onClick={togglePlay}
            size="lg"
            variant="outline"
            className="loom-tap rounded-full h-14 px-6 border-2 border-primary text-primary hover:bg-primary-soft"
          >
            {playing ? <Pause className="w-5 h-5 mr-2" /> : <Play className="w-5 h-5 mr-2" />}
            {playing ? "Pause" : "Play back"}
          </Button>
          <Button
            onClick={remove}
            size="lg"
            variant="ghost"
            className="loom-tap rounded-full h-14 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="w-5 h-5 mr-2" />
            Re-record
          </Button>
        </div>
      )}
    </div>
  );
}
