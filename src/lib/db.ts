import Dexie, { Table } from "dexie";

export interface UserProfile {
  id: string;
  name: string;
  anchorVoiceBlob: Blob | null;
  createdAt: string;
}

export interface PersonRecord {
  id: string;
  name: string;
  relationship: string;
  imageBlob: Blob;
  voiceNoteBlob: Blob | null;
  faceDescriptor?: number[];
  createdAt: string;
}

export interface PanicEvent {
  id: string;
  timestamp: string;
  triggeredBy: "manual" | "auto";
  note?: string;
  patientLocation?: { lat: number; lng: number } | null;
}

export interface RecognitionEvent {
  id: string;
  personId: string;
  personName: string;
  timestamp: string;
}

class LoomDatabase extends Dexie {
  userProfile!: Table<UserProfile, string>;
  people!: Table<PersonRecord, string>;
  panicEvents!: Table<PanicEvent, string>;
  recognitions!: Table<RecognitionEvent, string>;

  constructor() {
    super("LoomDatabase");
    this.version(1).stores({
      userProfile: "id",
      people: "id, name, relationship, createdAt",
      panicEvents: "id, timestamp",
    });
    this.version(2).stores({
      userProfile: "id",
      people: "id, name, relationship, createdAt",
      panicEvents: "id, timestamp",
      recognitions: "id, personId, timestamp",
    });
  }
}

export const db = new LoomDatabase();

export const PROFILE_ID = "me";

export function blobToUrl(blob: Blob | null | undefined): string | null {
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
