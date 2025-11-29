import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// cameraFilename.ts

// Common camera-like prefixes
const CAMERA_PREFIXES = [
  "IMG_", // Canon, iOS
  "DSC_", // Nikon/Sony style
  "DSCN", // Nikon
  "DSCF", // Fujifilm
  "PICT", // Generic compacts
  "P", // Panasonic / DJI-like (we'll pad to 4 chars)
];

// Common image extensions
const IMAGE_EXTENSIONS = ["JPG"];

// Simple fast RNG helper
const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Generate a random camera-ish filename.
 * Example outputs:
 * - IMG_0123.JPG
 * - DSC_9876.JPG
 * - DSCN1234.JPG
 * - DSCF0042.JPG
 * - PICT4321.JPG
 * - P1000456.JPG
 */
export const generateCameraLikeFilename = (): string => {
  const prefix = CAMERA_PREFIXES[randInt(0, CAMERA_PREFIXES.length - 1)];
  const ext = IMAGE_EXTENSIONS[randInt(0, IMAGE_EXTENSIONS.length - 1)];

  // Sequence number 1–9999, padded to 4 digits
  const seq = String(randInt(1, 9999)).padStart(4, "0");
  const folderNum = String(randInt(100, 999));

  // Some cameras use variants of the prefix length/shape.
  // We handle a couple of realistic patterns explicitly.
  let base: string;

  switch (prefix) {
    case "IMG_":
    case "DSC_":
    case "DSCN":
    case "DSCF":
    case "PICT":
      // Standard pattern: PREFIX + 4-digit number
      base = `${prefix}${seq}`;
      break;

    case "P":
      // Panasonic/DJI-like: P + folder-ish digits + number
      // e.g. P1000123.JPG
      // First three digits: 100–999
      base = `${prefix}${folderNum}${seq}`;
      break;

    default:
      base = `${prefix}${seq}`;
  }

  return `${base}.${ext}`;
};
