import { z } from 'zod';

export const photoSpecSchema = z.object({
  width: z.number().int().min(100).max(1200).default(350),
  height: z.number().int().min(100).max(1600).default(450),
  minBytes: z.number().int().min(1000).default(20 * 1024),
  maxBytes: z.number().int().min(2000).default(50 * 1024),
  nameDateStrip: z.boolean().default(true),
  maxAttempts: z.number().int().min(1).max(20).default(5),
});
export type PhotoSpec = z.infer<typeof photoSpecSchema>;
export const DEFAULT_PHOTO_SPEC: PhotoSpec = photoSpecSchema.parse({});

export const signatureSpecSchema = z.object({
  width: z.number().int().default(140),
  height: z.number().int().default(60),
  minBytes: z.number().int().default(10 * 1024),
  maxBytes: z.number().int().default(20 * 1024),
});
export type SignatureSpec = z.infer<typeof signatureSpecSchema>;
export const DEFAULT_SIGNATURE_SPEC: SignatureSpec = signatureSpecSchema.parse({});

/** Thresholds for the in-browser face checks. */
export const FACE_CHECK_THRESHOLDS = {
  minFaceAreaRatio: 0.035,
  maxFaceAreaRatio: 0.45,
  maxCentreOffset: 0.12,
  minLuminance: 70,
  maxLuminance: 215,
  minBlurVariance: 60,
  blinkClosed: 0.5,
  blinkOpen: 0.25,
  headTurnYaw: 0.12,
  stableMs: 700,
} as const;

export const photoMetadataSchema = z.object({
  captureSessionId: z.string().min(10).max(100),
  capturedAt: z.string().datetime(),
  userAgent: z.string().max(500),
  attemptNo: z.number().int().min(1).max(50),
  liveness: z.object({ passed: z.boolean(), method: z.enum(['BLINK', 'HEAD_TURN']) }),
  scores: z.object({
    faceConfidence: z.number().min(0).max(1),
    centreOffset: z.number().min(0).max(2),
    areaRatio: z.number().min(0).max(1),
    luminance: z.number().min(0).max(255),
    blurVariance: z.number().min(0),
  }),
});
export type PhotoMetadata = z.infer<typeof photoMetadataSchema>;
