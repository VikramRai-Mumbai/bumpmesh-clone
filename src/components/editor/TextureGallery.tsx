"use client";

// Full texture gallery shown in place of the sidebar: search, category and favorites
// filters, and a grid where each texture can be starred.

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  TEXTURE_CATEGORIES,
  TEXTURE_PRESETS,
  type TextureCategory,
} from "@/lib/texture/presets";
import { useEditorStore, useTextureSettings } from "@/store/editor-store";
import { TextureTile } from "./TextureSettingsPanel";

const FAVORITES_KEY = "texture-favorites";

/** Favorite texture ids, remembered in this browser (a convenience; failures are ignored). */
function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
      return Array.isArray(stored)
        ? stored.filter((v) => typeof v === "string")
        : [];
    } catch {
      return [];
    }
  });

  // Adds or removes one id and saves the list.
  const toggle = (id: string) => {
    const next = favorites.includes(id)
      ? favorites.filter((f) => f !== id)
      : [...favorites, id];
    setFavorites(next);
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    } catch {
      // Storage blocked: favorites still work until the page is closed.
    }
  };
  return { favorites, toggle };
}

/** Gallery panel; clicking a texture applies it (one undo step), Done returns to settings. */
export default function TextureGallery() {
  const settings = useTextureSettings();
  const setTexture = useEditorStore((s) => s.setTexture);
  const setGalleryOpen = useEditorStore((s) => s.setGalleryOpen);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<
    TextureCategory | "All" | "Favorites"
  >("All");
  const { favorites, toggle } = useFavorites();

  const needle = query.trim().toLowerCase();
  const visible = TEXTURE_PRESETS.filter(
    (p) =>
      (category === "All" ||
        (category === "Favorites"
          ? favorites.includes(p.id)
          : p.category === category)) &&
      (needle === "" || p.name.toLowerCase().includes(needle)),
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Texture Gallery</h2>
        <Button
          size="sm"
          variant="primary"
          onClick={() => setGalleryOpen(false)}
        >
          Done
        </Button>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search textures"
        aria-label="Search textures"
        className="h-8 rounded-md border border-line bg-subtle px-3 text-xs"
      />

      <div className="flex flex-wrap gap-1.5">
        {(["All", "Favorites", ...TEXTURE_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${category === c ? "border-accent bg-accent text-white" : "border-line text-fg hover:bg-subtle"}`}
          >
            {c === "Favorites" ? `★ Favorites ${favorites.length}` : c}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-muted">
        Click a texture to try it on your model. Star your favorites to find
        them quickly.
      </p>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted">
          {category === "Favorites" && favorites.length === 0
            ? "No favorites yet. Use the star on a texture."
            : "No textures match."}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {visible.map((preset) => {
            const starred = favorites.includes(preset.id);
            return (
              <div key={preset.id} className="relative">
                <TextureTile
                  id={preset.id}
                  name={preset.name}
                  showName
                  selected={preset.id === settings.textureId}
                  onSelect={() => setTexture({ textureId: preset.id })}
                />
                <button
                  type="button"
                  aria-pressed={starred}
                  aria-label={
                    starred ? `Unstar ${preset.name}` : `Star ${preset.name}`
                  }
                  title={starred ? "Remove from favorites" : "Add to favorites"}
                  onClick={() => toggle(preset.id)}
                  className={`absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-sm leading-none ${starred ? "text-amber-400" : "text-white/80 hover:text-white"}`}
                >
                  {starred ? "★" : "☆"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
