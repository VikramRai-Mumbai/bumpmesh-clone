"use client";

// Viewport material: MeshStandardMaterial extended with the triplanar texture shader.
// Default mode shades bumps from the texture; 3D Preview moves vertices for real depth.
// Per-vertex `aMask` (0–1) scales the texture and `aPaint` tints painted faces.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { getProcessedHeightmap } from "@/lib/texture/heightmap";
import {
  blendPower,
  PROJECTION_CODES,
  type ProjectionFrame,
  TEXTURE_GLSL,
  type TextureSettings,
} from "@/lib/texture/triplanar";

type Options = {
  settings: TextureSettings;
  wireframe: boolean;
  /** Displace vertices on the GPU (needs a welded, subdivided mesh). */
  displace: boolean;
  /** Section View cut, or null. */
  clipPlane: THREE.Plane | null;
  /** Centre / radius / effective Size U for wrapped projections. */
  frame: ProjectionFrame;
};

/** Halves a square grid by averaging 2×2 blocks (sizes are powers of two). */
function downsample(data: Float32Array, size: number) {
  const half = size / 2;
  const out = new Float32Array(half * half);
  for (let y = 0; y < half; y++) {
    for (let x = 0; x < half; x++) {
      const i = 2 * y * size + 2 * x;
      out[y * half + x] =
        (data[i] + data[i + 1] + data[i + size] + data[i + size + 1]) / 4;
    }
  }
  return out;
}

const toHalf = (data: Float32Array) => {
  const out = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++)
    out[i] = THREE.DataUtils.toHalfFloat(data[i]);
  return out;
};

/**
 * Uploads a processed heightmap as a half-float, repeating texture with a mip chain built
 * on the CPU (WebGL can't generate mips for this format), so distant surfaces don't sparkle.
 */
function useHeightTexture(settings: TextureSettings) {
  const { textureId, invert, smoothing } = settings;
  const texture = useMemo(() => {
    const map = getProcessedHeightmap(textureId, invert, smoothing);
    const mipmaps: { data: Uint16Array; width: number; height: number }[] = [];
    let level = map.data;
    for (let size = map.size; size >= 1; size /= 2) {
      mipmaps.push({ data: toHalf(level), width: size, height: size });
      if (size > 1) level = downsample(level, size);
    }
    const tex = new THREE.DataTexture(
      mipmaps[0].data,
      map.size,
      map.size,
      THREE.RedFormat,
      THREE.HalfFloatType,
    );
    tex.mipmaps = mipmaps as unknown as THREE.DataTexture["mipmaps"];
    tex.generateMipmaps = false;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.needsUpdate = true;
    return tex;
  }, [textureId, invert, smoothing]);

  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/**
 * Returns a material that renders the current texture on any mesh in the scene.
 * Uniforms are updated in place, so dragging a slider does not recompile the shader.
 */
export function useTexturedMaterial({
  settings,
  wireframe,
  displace,
  clipPlane,
  frame,
}: Options) {
  const heightTexture = useHeightTexture(settings);

  const uniforms = useMemo(
    () => ({
      uHeightMap: { value: null as THREE.Texture | null },
      uTexSize: { value: new THREE.Vector2(10, 10) },
      uTexOffset: { value: new THREE.Vector2() },
      uTexRotation: { value: 0 },
      uBlendPower: { value: 8 },
      uProjection: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uRadius: { value: 1 },
      uSeam: { value: 0 },
      uCapCos: { value: 2 },
      uDepth: { value: 0.5 },
      uSymmetric: { value: 0 },
      uSign: { value: 1 },
      uBump: { value: 1 },
      uDisplace: { value: 0 },
    }),
    [],
  );

  // One material per displacement mode: 3D preview uses flat shading of the moved vertices.
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: "#22a6a1",
      roughness: 0.55,
      metalness: 0.1,
      side: THREE.DoubleSide,
      flatShading: displace,
    });
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
${TEXTURE_GLSL}
uniform float uDisplace;
attribute float aMask;
attribute float aPaint;
varying vec3 vTexPos;
varying vec3 vTexNormal;
varying float vTexMask;
varying float vPaint;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
vTexPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTexNormal = normalize(mat3(modelMatrix) * objectNormal);
vTexMask = aMask;
vPaint = aPaint;
if (uDisplace > 0.5) {
  float texH = textureHeight(vTexPos, vTexNormal);
  transformed += normalize(objectNormal) * displacementAmount(texH) * aMask;
}`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
${TEXTURE_GLSL}
uniform float uBump;
varying vec3 vTexPos;
varying vec3 vTexNormal;
varying float vTexMask;
varying float vPaint;

// Bump mapping for surfaces without UVs (Mikkelsen), using world-unit derivatives
// so the shading matches the real displacement depth.
vec3 texturedNormal(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 sigmaX = dFdx(surfPos);
  vec3 sigmaY = dFdy(surfPos);
  vec3 r1 = cross(sigmaY, surfNorm);
  vec3 r2 = cross(surfNorm, sigmaX);
  float det = dot(sigmaX, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.45, 0.4, 0.95), 0.55 * vPaint);`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
if (uBump > 0.0) {
  float texD = displacementAmount(textureHeight(vTexPos, normalize(vTexNormal))) * vTexMask;
  normal = texturedNormal(-vViewPosition, normal, vec2(dFdx(texD), dFdy(texD)) * uBump, faceDirection);
}`,
        );
    };
    m.customProgramCacheKey = () => `textured-${displace}`;
    return m;
  }, [uniforms, displace]);

  useEffect(() => () => material.dispose(), [material]);

  // Keep uniforms in sync with the current settings (after render, before the next frame).
  useEffect(() => {
    uniforms.uHeightMap.value = heightTexture;
    uniforms.uTexSize.value.set(frame.sizeU, settings.sizeV);
    uniforms.uProjection.value = PROJECTION_CODES[settings.projection];
    uniforms.uCenter.value.fromArray(frame.center);
    uniforms.uRadius.value = frame.radius;
    uniforms.uSeam.value = settings.seamBlend * 0.5 * Math.PI;
    uniforms.uCapCos.value =
      settings.capAngle > 0 ? Math.cos((settings.capAngle * Math.PI) / 180) : 2;
    uniforms.uTexOffset.value.set(settings.offsetU, settings.offsetV);
    uniforms.uTexRotation.value = (settings.rotation * Math.PI) / 180;
    uniforms.uBlendPower.value = blendPower(settings.transition);
    uniforms.uDepth.value = settings.depth;
    uniforms.uSymmetric.value = settings.symmetric ? 1 : 0;
    uniforms.uSign.value = settings.reverse ? -1 : 1;
    uniforms.uBump.value = displace ? 0 : 1;
    uniforms.uDisplace.value = displace ? 1 : 0;
    material.wireframe = wireframe;
    material.clippingPlanes = clipPlane ? [clipPlane] : null;
  });

  return material;
}
