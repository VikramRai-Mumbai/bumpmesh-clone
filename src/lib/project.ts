// Project files (.texproj): a zip with project.json (settings) plus raw binary parts for
// the model, painted mask and custom heightmap. Loading validates everything first.

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { Rotation } from "@/lib/geometry/orientation";
import { DEFAULT_MASK, type MaskSettings } from "@/lib/mask/mask";
import type { Heightmap } from "@/lib/texture/heightmap";
import {
  DEFAULT_TEXTURE,
  PROJECTION_CODES,
  type TextureSettings,
} from "@/lib/texture/triplanar";

export const PROJECT_EXTENSION = ".texproj";
const APP_ID = "3d-texture-studio";
const VERSION = 1;

export type ProjectData = {
  name: string;
  rotation: Rotation;
  texture: TextureSettings;
  mask: MaskSettings;
  /** Non-indexed model positions, or null if the project has no model. */
  positions: Float32Array | null;
  customMap: { name: string; heightmap: Heightmap } | null;
};

/** Copies typed-array bytes into a standalone Uint8Array for the zip. */
const bytesOf = (a: Float32Array | Uint8Array) =>
  new Uint8Array(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength));

/** Packs a project into the .texproj zip format. */
export function saveProject(project: ProjectData): Uint8Array {
  const { paint, ...maskOptions } = project.mask;
  const manifest = {
    app: APP_ID,
    version: VERSION,
    name: project.name,
    rotation: project.rotation,
    texture: project.texture,
    mask: maskOptions,
    model: project.positions
      ? { vertices: project.positions.length / 3 }
      : null,
    customMap: project.customMap
      ? { name: project.customMap.name, size: project.customMap.heightmap.size }
      : null,
  };
  const files: Record<string, Uint8Array> = {
    "project.json": strToU8(JSON.stringify(manifest, null, 2)),
    "paint.bin": bytesOf(paint),
  };
  if (project.positions) files["model.bin"] = bytesOf(project.positions);
  if (project.customMap)
    files["custommap.bin"] = bytesOf(project.customMap.heightmap.data);
  return zipSync(files, { level: 6 });
}

const fail = (why: string): never => {
  throw new Error(`Not a valid project file: ${why}.`);
};
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** Keeps only known texture keys with values of the right type; anything else uses defaults. */
function readTexture(raw: unknown): TextureSettings {
  const out = { ...DEFAULT_TEXTURE } as Record<string, unknown>;
  if (raw && typeof raw === "object") {
    for (const [key, fallback] of Object.entries(DEFAULT_TEXTURE)) {
      const value = (raw as Record<string, unknown>)[key];
      if (
        typeof value === typeof fallback &&
        (typeof value !== "number" || isNum(value))
      ) {
        out[key] = value;
      }
    }
  }
  if (!(String(out.projection) in PROJECTION_CODES))
    out.projection = "triplanar";
  return out as TextureSettings;
}

/** Same idea for mask options; the painted bitset comes from paint.bin. */
function readMask(raw: unknown, paint: Uint8Array): MaskSettings {
  const out = { ...DEFAULT_MASK, paint } as Record<string, unknown>;
  if (raw && typeof raw === "object") {
    for (const key of [
      "mode",
      "topAngle",
      "bottomAngle",
      "falloff",
      "curve",
    ] as const) {
      const value = (raw as Record<string, unknown>)[key];
      if (typeof value === typeof DEFAULT_MASK[key]) out[key] = value;
    }
  }
  if (out.mode !== "exclude" && out.mode !== "include") out.mode = "exclude";
  if (!["linear", "scurve", "ease"].includes(String(out.curve)))
    out.curve = "linear";
  return out as MaskSettings;
}

/**
 * Reads and validates a .texproj file.
 * @throws Error with a readable reason if the file is not a valid project.
 */
export function loadProject(bytes: Uint8Array): ProjectData {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    return fail("it is not a project archive");
  }
  const manifestBytes =
    files["project.json"] ?? fail("project.json is missing");
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes));
  } catch {
    return fail("project.json is not valid JSON");
  }
  if (manifest.app !== APP_ID) fail("it was not made by this editor");
  if (!isNum(manifest.version) || manifest.version > VERSION)
    fail("it was saved by a newer version");

  const rotation = manifest.rotation;
  if (
    !Array.isArray(rotation) ||
    rotation.length !== 4 ||
    !rotation.every(isNum)
  )
    fail("rotation is invalid");

  let positions: Float32Array | null = null;
  if (files["model.bin"]) {
    const raw = files["model.bin"];
    if (raw.byteLength % 36 !== 0) fail("model data is truncated");
    positions = new Float32Array(raw.slice().buffer);
    if (!positions.every(Number.isFinite))
      fail("model contains invalid coordinates");
  }

  let customMap: ProjectData["customMap"] = null;
  const mapInfo = manifest.customMap as {
    name?: unknown;
    size?: unknown;
  } | null;
  if (mapInfo && files["custommap.bin"]) {
    const size = Number(mapInfo.size);
    const data = new Float32Array(files["custommap.bin"].slice().buffer);
    if (!Number.isInteger(size) || data.length !== size * size)
      fail("custom map data does not match its size");
    customMap = {
      name: String(mapInfo.name ?? "Custom"),
      heightmap: { size, data },
    };
  }

  const texture = readTexture(manifest.texture);
  if (texture.textureId === "custom" && !customMap)
    texture.textureId = DEFAULT_TEXTURE.textureId;

  return {
    name: typeof manifest.name === "string" ? manifest.name : "project",
    rotation: rotation as Rotation,
    texture,
    mask: readMask(
      manifest.mask,
      files["paint.bin"]?.slice() ?? new Uint8Array(0),
    ),
    positions,
    customMap,
  };
}
