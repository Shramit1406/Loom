import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { db, PROFILE_ID, UserProfile } from "@/lib/db";

type Mode = "patient" | "caregiver";

interface LoomCtx {
  profile: UserProfile | null;
  loading: boolean;
  mode: Mode;
  setMode: (m: Mode) => void;
  refreshProfile: () => Promise<void>;
  playAnchor: () => void;
}

const Ctx = createContext<LoomCtx | null>(null);

export function LoomProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setModeState] = useState<Mode>(() => {
    if (typeof window === "undefined") return "patient";
    return (localStorage.getItem("loom.mode") as Mode) || "patient";
  });

  const refreshProfile = useCallback(async () => {
    const p = await db.userProfile.get(PROFILE_ID);
    setProfile(p ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    localStorage.setItem("loom.mode", m);
  }, []);

  const playAnchor = useCallback(() => {
    if (!profile?.anchorVoiceBlob) return;
    const url = URL.createObjectURL(profile.anchorVoiceBlob);
    const audio = new Audio(url);
    audio.play().catch(() => {});
    audio.onended = () => URL.revokeObjectURL(url);
  }, [profile]);

  return (
    <Ctx.Provider value={{ profile, loading, mode, setMode, refreshProfile, playAnchor }}>
      {children}
    </Ctx.Provider>
  );
}

export function useLoom() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLoom must be used within LoomProvider");
  return ctx;
}
