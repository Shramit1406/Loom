import { useEffect, useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Bluetooth, Camera, CheckCircle2, MapPinned, Mic, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkPermission, PermissionKey, PermissionStateLike, PERMISSIONS_META, requestPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type PermissionStatusMap = Record<PermissionKey, PermissionStateLike>;

const PERMISSIONS_WITH_ICONS = PERMISSIONS_META.map(p => ({
  ...p,
  icon: p.key === "camera" ? Camera : p.key === "microphone" ? Mic : p.key === "location" ? MapPinned : Bluetooth
}));

const INITIAL_STATUS: PermissionStatusMap = {
  camera: "prompt",
  microphone: "prompt",
  location: "prompt",
  bluetooth: "prompt",
};

export default function AppPermissionsGate() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statuses, setStatuses] = useState<PermissionStatusMap>(INITIAL_STATUS);

  const refresh = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    const entries = await Promise.all(
      PERMISSIONS.map(async ({ key }) => [key, await checkPermission(key)] as const)
    );
    const next = Object.fromEntries(entries) as PermissionStatusMap;
    setStatuses(next);
    setVisible(Object.values(next).some((state) => state !== "granted" && state !== "unsupported"));
  }, []);

  useEffect(() => {
    let mounted = true;
    void refresh();

    const listener = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive && mounted) {
        void refresh();
      }
    });

    return () => {
      mounted = false;
      void listener.then(l => l.remove());
    };
  }, [refresh]);

  const requestAll = async () => {
    setBusy(true);
    try {
      const next = { ...statuses };
      for (const { key } of PERMISSIONS_WITH_ICONS) {
        next[key] = await requestPermission(key);
        setStatuses({ ...next });
      }
      setVisible(Object.values(next).some((state) => state !== "granted" && state !== "unsupported"));
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  const grantedCount = Object.values(statuses).filter((state) => state === "granted" || state === "unsupported").length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-foreground/20 backdrop-blur-sm sm:items-center sm:justify-center overflow-y-auto pt-10 px-0 sm:px-4">
      <div className="w-full max-w-2xl mt-auto sm:mt-0 rounded-t-[2rem] sm:rounded-[2rem] bg-background px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-[0_-16px_60px_rgba(38,19,77,0.22)] sm:p-6 overflow-visible">
        <div className="mx-auto mb-5 h-1.5 w-14 rounded-full bg-border sm:hidden shrink-0" />
        <div className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-4 py-1.5 text-sm">
          <ShieldAlert className="h-4 w-4 text-primary" /> Android setup
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">Let Loom prepare your phone</h2>
        <p className="mt-2 text-sm text-foreground/70 sm:text-base">
          Turn on the essentials once so the Android app can feel immediate in stressful moments.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {PERMISSIONS.map(({ key, title, body, icon: Icon }) => (
            <div key={key} className="loom-card p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl gradient-lavender">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">{title}</div>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", badgeClass(statuses[key]))}>
                      {badgeLabel(statuses[key])}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-foreground/65">{body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button onClick={requestAll} disabled={busy} className="h-12 rounded-full gradient-sage px-6 text-white">
            {busy ? "Checking permissions..." : "Allow essentials"}
          </Button>
          <div className="flex items-center gap-2 text-sm text-foreground/65 sm:ml-auto">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            {grantedCount} of {PERMISSIONS_WITH_ICONS.length} ready
          </div>
        </div>
      </div>
    </div>
  );
}

function badgeClass(state: PermissionStateLike) {
  if (state === "granted") return "bg-emerald-100 text-emerald-700";
  if (state === "denied") return "bg-destructive/10 text-destructive";
  if (state === "unsupported") return "bg-muted text-muted-foreground";
  return "bg-secondary text-secondary-foreground";
}

function badgeLabel(state: PermissionStateLike) {
  if (state === "granted") return "Ready";
  if (state === "denied") return "Needs retry";
  if (state === "unsupported") return "Not needed";
  return "Pending";
}
