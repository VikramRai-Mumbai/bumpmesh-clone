"use client";

// Texture sections of the sidebar (Displacement Map, Projection, Displacement, Transform,
// Masking), laid out like the reference. Sliders preview live and commit one undo step
// on release.

import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, InfoTip, Select, Slider } from "@/components/ui/Field";
import { LinkIcon } from "@/components/ui/icons";
import { Section } from "@/components/ui/Section";
import { CUSTOM_TEXTURE_ID } from "@/lib/texture/heightmap";
import { TEXTURE_PRESETS } from "@/lib/texture/presets";
import { getThumbnail } from "@/lib/texture/thumbnail";
import {
  type ProjectionMode,
  projectionFrame,
  type TextureSettings,
} from "@/lib/texture/triplanar";
import { useEditorStore, useTextureSettings } from "@/store/editor-store";
import MaskingSection from "./MaskingSection";

type NumberKey = {
  [K in keyof TextureSettings]: TextureSettings[K] extends number ? K : never;
}[keyof TextureSettings];

const PROJECTIONS: { value: ProjectionMode; label: string }[] = [
  { value: "triplanar", label: "Triplanar" },
  { value: "cubic", label: "Cubic (Box)" },
  { value: "cylindrical", label: "Cylindrical" },
  { value: "spherical", label: "Spherical" },
  { value: "planarXY", label: "Planar XY" },
  { value: "planarXZ", label: "Planar XZ" },
  { value: "planarYZ", label: "Planar YZ" },
];

/** Number of textures shown directly in the sidebar; the rest are in the gallery. */
const QUICK_PICKS = 12;

/** Binds a numeric setting to a Slider: live preview while dragging, commit on release. */
function useNumberSetting(key: NumberKey) {
  const settings = useTextureSettings();
  const previewTexture = useEditorStore((s) => s.previewTexture);
  const setTexture = useEditorStore((s) => s.setTexture);
  return {
    value: settings[key],
    onChange: (v: number) => previewTexture({ [key]: v }),
    onCommit: (v: number) => setTexture({ [key]: v }),
  };
}

/** All texture sections; each control change is one undo step. */
export default function TextureSettingsPanel() {
  const settings = useTextureSettings();
  const setTexture = useEditorStore((s) => s.setTexture);
  const preview3d = useEditorStore((s) => s.preview3d);
  const setPreview3d = useEditorStore((s) => s.setPreview3d);
  const setGalleryOpen = useEditorStore((s) => s.setGalleryOpen);
  const previewBusy = useEditorStore((s) => s.previewBusy);
  const customMapName = useEditorStore((s) => s.customMapName);
  const setCustomMap = useEditorStore((s) => s.setCustomMap);
  const removeCustomMap = useEditorStore((s) => s.removeCustomMap);
  const size = useEditorStore((s) => s.placement.size);
  const imageInput = useRef<HTMLInputElement>(null);
  const wrapped =
    settings.projection === "cylindrical" ||
    settings.projection === "spherical";
  const snappedU = projectionFrame(settings, size).sizeU;

  const smoothing = useNumberSetting("smoothing");
  const transition = useNumberSetting("transition");
  const seamBlend = useNumberSetting("seamBlend");
  const capAngle = useNumberSetting("capAngle");
  const depth = useNumberSetting("depth");
  const sizeU = useNumberSetting("sizeU");
  const sizeV = useNumberSetting("sizeV");
  const offsetU = useNumberSetting("offsetU");
  const offsetV = useNumberSetting("offsetV");
  const rotation = useNumberSetting("rotation");

  return (
    <>
      <Section title="Displacement Map">
        <div className="grid grid-cols-4 gap-1.5">
          {TEXTURE_PRESETS.slice(0, QUICK_PICKS).map((preset) => (
            <TextureTile
              key={preset.id}
              id={preset.id}
              name={preset.name}
              selected={preset.id === settings.textureId}
              onSelect={() => setTexture({ textureId: preset.id })}
            />
          ))}
        </div>
        {customMapName && (
          <div className="flex items-center gap-2 rounded-md border border-line p-1.5">
            <div className="w-12 shrink-0">
              <TextureTile
                id={CUSTOM_TEXTURE_ID}
                name={customMapName}
                selected={settings.textureId === CUSTOM_TEXTURE_ID}
                onSelect={() => setTexture({ textureId: CUSTOM_TEXTURE_ID })}
              />
            </div>
            <span
              className="min-w-0 flex-1 truncate text-xs"
              title={customMapName}
            >
              {customMapName}
            </span>
            <Button
              size="sm"
              title="Remove custom map"
              onClick={removeCustomMap}
            >
              Remove
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setGalleryOpen(true)}>
            Texture Gallery
            <span className="text-muted">{TEXTURE_PRESETS.length}</span>
          </Button>
          <Button
            size="sm"
            title="Use your own grayscale image (PNG, JPG or WebP) as the heightmap"
            onClick={() => imageInput.current?.click()}
          >
            Upload custom map
          </Button>
          <input
            ref={imageInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void setCustomMap(file);
              e.target.value = "";
            }}
          />
        </div>
        <Checkbox
          label={
            <>
              Invert texture
              <InfoTip text="Swaps light and dark, so dark areas become raised instead of light ones." />
            </>
          }
          checked={settings.invert}
          onChange={(invert) => setTexture({ invert })}
        />
        <Slider
          label={
            <>
              Texture Smoothing
              <InfoTip text="Blurs the texture to soften sharp edges." />
            </>
          }
          min={0}
          max={10}
          step={1}
          {...smoothing}
        />
      </Section>

      <Section title="Projection">
        <Select
          label="Mode"
          value={settings.projection}
          options={PROJECTIONS}
          onChange={(v) => setTexture({ projection: v as ProjectionMode })}
        />
        {settings.projection === "triplanar" && (
          <Slider
            label={
              <>
                Transition Smoothing
                <InfoTip text="How softly the texture blends where the surface turns from one direction to another." />
              </>
            }
            min={0}
            max={1}
            step={0.05}
            {...transition}
          />
        )}
        {wrapped && (
          <>
            <Slider
              label={
                <>
                  Seam Blend
                  <InfoTip text="Cross-fades the texture where it wraps around and meets itself." />
                </>
              }
              min={0}
              max={1}
              step={0.05}
              {...seamBlend}
            />
            <Checkbox
              label={
                <>
                  Snap seamless
                  <InfoTip text="Rounds Size U so the texture wraps around a whole number of times, hiding the seam." />
                </>
              }
              checked={settings.snapSeamless}
              onChange={(snapSeamless) => setTexture({ snapSeamless })}
            />
            {settings.snapSeamless && (
              <p className="text-[11px] text-muted">
                Size U used: {snappedU.toFixed(2)} mm
              </p>
            )}
          </>
        )}
        {settings.projection === "cylindrical" && (
          <Slider
            label={
              <>
                Cap Angle (°)
                <InfoTip text="Faces within this angle of pointing up or down (the cylinder ends) get a flat projection instead. 0 = off." />
              </>
            }
            min={0}
            max={89}
            step={1}
            {...capAngle}
          />
        )}
      </Section>

      <Section title="Displacement">
        <Slider
          label="Texture height (mm)"
          min={0}
          max={3}
          step={0.05}
          {...depth}
        />
        <Checkbox
          label="Reverse direction (push in instead of out)"
          checked={settings.reverse}
          onChange={(reverse) => setTexture({ reverse })}
        />
        <Checkbox
          label={
            <>
              Symmetric displacement
              <InfoTip text="50% grey = no displacement; light pushes out, dark pushes in. Keeps part volume roughly constant." />
            </>
          }
          checked={settings.symmetric}
          onChange={(symmetric) => setTexture({ symmetric })}
        />
        <Checkbox
          label={
            <>
              3D Preview
              <InfoTip text="Subdivides the mesh and moves its vertices so you can judge the real depth. Heavier on the GPU." />
            </>
          }
          checked={preview3d}
          onChange={setPreview3d}
        />
        {previewBusy && (
          <p className="text-[11px] text-accent">Preparing 3D preview...</p>
        )}
      </Section>

      <Section title="Transform">
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1 space-y-2.5">
            <Slider
              label="Size U (mm)"
              min={1}
              max={50}
              step={0.5}
              {...sizeU}
            />
            <Slider
              label="Size V (mm)"
              min={1}
              max={50}
              step={0.5}
              {...sizeV}
            />
          </div>
          <button
            type="button"
            aria-pressed={settings.lockUV}
            title="Proportional scaling (U = V)"
            onClick={() => setTexture({ lockUV: !settings.lockUV })}
            className={`flex h-14 w-6 items-center justify-center rounded border ${settings.lockUV ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"}`}
          >
            <LinkIcon />
          </button>
        </div>
        <Slider label="Offset U" min={0} max={1} step={0.01} {...offsetU} />
        <Slider label="Offset V" min={0} max={1} step={0.01} {...offsetV} />
        <Slider label="Rotation (°)" min={0} max={360} step={1} {...rotation} />
      </Section>

      <MaskingSection />
    </>
  );
}

/** Square texture thumbnail button with selected state. */
export function TextureTile({
  id,
  name,
  selected,
  onSelect,
  showName = false,
}: Readonly<{
  id: string;
  name: string;
  selected: boolean;
  onSelect: () => void;
  showName?: boolean;
}>) {
  return (
    <button
      type="button"
      title={name}
      aria-pressed={selected}
      onClick={onSelect}
      className="group flex flex-col items-center gap-1 text-[11px] text-fg"
    >
      {/* biome-ignore lint/performance/noImgElement: generated data-URL thumbnail, nothing for next/image to optimise */}
      <img
        src={getThumbnail(id)}
        alt={name}
        width={96}
        height={96}
        className={`aspect-square w-full rounded border-2 object-cover ${selected ? "border-accent" : "border-transparent group-hover:border-line"}`}
      />
      {showName && <span className="truncate">{name}</span>}
    </button>
  );
}
