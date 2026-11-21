import type { Rect } from '../lib/image/analysis';
import type { Point } from './faceChecks';

export interface DetectedFace {
  box: Rect;
  score: number;
  landmarks: Point[];
  blink: { left: number; right: number };
}
export interface FaceEngine {
  detect(video: HTMLVideoElement, ts: number): DetectedFace[];
  close(): void;
}

/**
 * MediaPipe FaceLandmarker (tasks-vision) running fully in the browser.
 * WASM and model are self-hosted under `assetBase` (no third-party CDN; CSP 'self').
 */
export async function createFaceEngine(assetBase = '/mediapipe'): Promise<FaceEngine> {
  const vision = await import('@mediapipe/tasks-vision');
  const fileset = await vision.FilesetResolver.forVisionTasks(`${assetBase}/wasm`);
  const make = (delegate: 'GPU' | 'CPU') =>
    vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${assetBase}/face_landmarker.task`, delegate },
      runningMode: 'VIDEO',
      numFaces: 2,
      outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  let lm: Awaited<ReturnType<typeof make>>;
  try { lm = await make('GPU'); } catch { lm = await make('CPU'); }
  let lastTs = 0;
  return {
    detect(video, ts) {
      const t = ts <= lastTs ? lastTs + 1 : ts;
      lastTs = t;
      const res = lm.detectForVideo(video, t);
      const w = video.videoWidth;
      const h = video.videoHeight;
      return (res.faceLandmarks ?? []).map((pts, i) => {
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
        const cats = res.faceBlendshapes?.[i]?.categories ?? [];
        const get = (n: string) => cats.find((c) => c.categoryName === n)?.score ?? 0;
        return {
          box: { x: minX * w, y: minY * h, width: (maxX - minX) * w, height: (maxY - minY) * h },
          score: cats.length ? 0.9 : 0.7,
          landmarks: pts.map((p) => ({ x: p.x * w, y: p.y * h })),
          blink: { left: get('eyeBlinkLeft'), right: get('eyeBlinkRight') },
        };
      });
    },
    close() { lm.close(); },
  };
}
