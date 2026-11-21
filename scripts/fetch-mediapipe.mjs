// Copies MediaPipe tasks-vision WASM and downloads the FaceLandmarker model into candidate-web/public/mediapipe
// so the camera feature is fully self-hosted (no third-party CDN; strict CSP).
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = path.join(root, 'packages/ui/node_modules/@mediapipe/tasks-vision');
const out = path.join(root, 'apps/candidate-web/public/mediapipe');
mkdirSync(path.join(out, 'wasm'), { recursive: true });
cpSync(path.join(pkgDir, 'wasm'), path.join(out, 'wasm'), { recursive: true });
const model = path.join(out, 'face_landmarker.task');
if (!existsSync(model)) {
  const url = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model download failed: ${res.status}`);
  writeFileSync(model, Buffer.from(await res.arrayBuffer()));
}
console.log('MediaPipe assets ready in', out);
