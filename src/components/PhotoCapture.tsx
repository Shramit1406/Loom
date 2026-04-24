import { useEffect, useRef, useState } from "react";
import { Camera as CameraIcon, Upload, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { toast } from "sonner";

interface PhotoCaptureProps {
  onCapture: (blob: Blob) => void;
  initialUrl?: string | null;
}

export default function PhotoCapture({ onCapture, initialUrl = null }: PhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl);
  const [active, setActive] = useState(false);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrl && previewUrl !== initialUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCam = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: true,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        width: 600,
        height: 600,
      });

      if (image.webPath) {
        const response = await fetch(image.webPath);
        const b = await response.blob();
        setPreviewUrl(image.webPath);
        onCapture(b);
      }
    } catch (e) {
      console.error(e);
      // User cancelled is also an "error" in getPhoto, but we should only toast for real issues
      if ((e as Error).message !== "User cancelled photos app") {
        toast.error("Camera error", { description: "You can upload a photo instead." });
      }
    }
  };

  const snap = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement("canvas");
    const size = Math.min(v.videoWidth, v.videoHeight);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const sx = (v.videoWidth - size) / 2;
    const sy = (v.videoHeight - size) / 2;
    ctx.drawImage(v, sx, sy, size, size, 0, 0, size, size);
    canvas.toBlob((b) => {
      if (!b) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(b));
      onCapture(b);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setActive(false);
    }, "image/jpeg", 0.85);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    onCapture(f);
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="relative w-64 h-64 rounded-3xl overflow-hidden bg-muted shadow-card border-2 border-primary-soft">
        {previewUrl ? (
          <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
        ) : active ? (
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <CameraIcon className="w-16 h-16 opacity-40" />
          </div>
        )}
      </div>

      <div className="flex gap-3 flex-wrap justify-center">
        {!previewUrl && !active && (
          <>
            <Button onClick={startCam} className="loom-tap gradient-sage text-white rounded-full h-12 px-6">
              <CameraIcon className="w-5 h-5 mr-2" /> Use camera
            </Button>
            <Button
              onClick={() => fileRef.current?.click()}
              variant="outline"
              className="loom-tap rounded-full h-12 px-6 border-2"
            >
              <Upload className="w-5 h-5 mr-2" /> Upload photo
            </Button>
          </>
        )}
        {active && !previewUrl && (
          <Button onClick={snap} className="loom-tap gradient-peach text-foreground rounded-full h-12 px-6">
            <CameraIcon className="w-5 h-5 mr-2" /> Take photo
          </Button>
        )}
        {previewUrl && (
          <Button onClick={reset} variant="outline" className="loom-tap rounded-full h-12 px-6">
            <RotateCcw className="w-5 h-5 mr-2" /> Retake
          </Button>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="user" onChange={onFile} className="hidden" />
      </div>
    </div>
  );
}
