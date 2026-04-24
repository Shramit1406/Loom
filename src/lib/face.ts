/**
 * face.ts — TensorFlow.js face recognition (MediaPipe FaceMesh)
 *
 * Uses DYNAMIC imports so TFjs never crashes the whole app on import failure.
 * Descriptor is centroid-subtracted + scale-normalised + L2-normalised,
 * making it invariant to face position, distance, and scale.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FaceKeypoint {
  x: number;
  y: number;
  z: number;
}

export interface DetectionResult {
  descriptor: Float32Array;
  keypoints: FaceKeypoint[];
  detection: {
    box: { x: number; y: number; width: number; height: number };
  };
}

// ─── State ────────────────────────────────────────────────────────────────────

let detector: unknown = null;   // typed as unknown; we import the real type lazily
let loadingPromise: Promise<void> | null = null;
let loaded = false;

export function modelsLoaded(): boolean {
  return loaded;
}

// ─── Model loading (lazy dynamic import) ──────────────────────────────────────

export function loadFaceModels(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      // Dynamic imports — TFjs won't crash the app if it fails on old WebViews
      const tf = await import("@tensorflow/tfjs");
      const faceLandmarks = await import("@tensorflow-models/face-landmarks-detection");

      // Try WebGL first, fall back to CPU silently
      try {
        await tf.setBackend("webgl");
        await tf.ready();
      } catch {
        await tf.setBackend("cpu");
        await tf.ready();
      }

      detector = await faceLandmarks.createDetector(
        faceLandmarks.SupportedModels.MediaPipeFaceMesh,
        {
          runtime: "tfjs" as const,
          refineLandmarks: false,
          maxFaces: 5,
        }
      );

      loaded = true;
    } catch (err) {
      console.error("[face] Model load failed:", err);
      loadingPromise = null; // allow retry
      throw err;
    }
  })();

  return loadingPromise;
}

// ─── Descriptor helpers ────────────────────────────────────────────────────────

interface Keypoint { x: number; y: number; z?: number }

/**
 * Build a pose/scale-invariant face descriptor from 468 landmarks:
 *   1. Subtract centroid → translation invariant
 *   2. Divide by RMS distance → scale invariant
 *   3. L2-normalise → unit sphere (euclidean ≈ cosine distance)
 *
 * Same person at different distances: distance ~0.05–0.35
 * Different people: distance ~0.50–0.90
 */
function landmarksToDescriptor(keypoints: Keypoint[]): Float32Array {
  // 1. Centroid
  let cx = 0, cy = 0, cz = 0;
  for (const kp of keypoints) { cx += kp.x; cy += kp.y; cz += (kp.z ?? 0); }
  cx /= keypoints.length; cy /= keypoints.length; cz /= keypoints.length;

  // 2. RMS scale
  let rms = 0;
  for (const kp of keypoints) {
    const dx = kp.x - cx, dy = kp.y - cy, dz = (kp.z ?? 0) - cz;
    rms += dx * dx + dy * dy + dz * dz;
  }
  const scale = Math.sqrt(rms / keypoints.length) || 1;

  // 3. Normalised vector
  const raw = new Float32Array(keypoints.length * 3);
  for (let i = 0; i < keypoints.length; i++) {
    raw[i * 3 + 0] = (keypoints[i].x - cx) / scale;
    raw[i * 3 + 1] = (keypoints[i].y - cy) / scale;
    raw[i * 3 + 2] = ((keypoints[i].z ?? 0) - cz) / scale;
  }

  // 4. L2-normalise
  let norm = 0;
  for (let i = 0; i < raw.length; i++) norm += raw[i] * raw[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < raw.length; i++) raw[i] /= norm;

  return raw;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get descriptor from a static image (AddPerson page).
 * flipHorizontal: false → natural coordinate space.
 */
export async function getDescriptorFromImage(
  image: HTMLImageElement
): Promise<Float32Array | null> {
  await loadFaceModels();
  if (!detector) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = detector as any;
  const faces = await d.estimateFaces(image, { flipHorizontal: false });
  if (!faces.length || !faces[0].keypoints) return null;
  return landmarksToDescriptor(faces[0].keypoints);
}

/**
 * Detect all faces in a live video frame.
 * flipHorizontal: false → descriptor in natural space, same as getDescriptorFromImage.
 * Canvas callers must mirror x: drawX = videoWidth - kp.x
 */
export async function detectInVideo(
  video: HTMLVideoElement
): Promise<DetectionResult[]> {
  if (!loaded || !detector) return [];
  if (video.readyState < 2 || video.videoWidth === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = detector as any;
  let faces: Array<{ keypoints: Keypoint[] }>;
  try {
    faces = await d.estimateFaces(video, { flipHorizontal: false });
  } catch {
    return [];
  }

  return faces
    .filter((f) => f.keypoints && f.keypoints.length > 0)
    .map((f) => {
      const kps = f.keypoints;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const kp of kps) {
        if (kp.x < minX) minX = kp.x;
        if (kp.y < minY) minY = kp.y;
        if (kp.x > maxX) maxX = kp.x;
        if (kp.y > maxY) maxY = kp.y;
      }
      // 10% padding
      const pad = Math.min(maxX - minX, maxY - minY) * 0.10;
      return {
        descriptor: landmarksToDescriptor(kps),
        keypoints: kps.map((kp) => ({ x: kp.x, y: kp.y, z: kp.z ?? 0 })),
        detection: {
          box: {
            x: minX - pad,
            y: minY - pad,
            width: (maxX - minX) + pad * 2,
            height: (maxY - minY) + pad * 2,
          },
        },
      };
    });
}

// ─── Distance ─────────────────────────────────────────────────────────────────

export function euclidean(
  a: Float32Array | number[],
  b: Float32Array | number[]
): number {
  let s = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

/**
 * With the centroid+scale descriptor, same-person pairs: ~0.05–0.35
 * Different people: ~0.50–0.90
 */
export const MATCH_THRESHOLD = 0.50;

// ─── Utility ──────────────────────────────────────────────────────────────────

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}
