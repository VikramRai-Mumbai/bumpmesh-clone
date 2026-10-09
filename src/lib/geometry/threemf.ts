// Minimal 3MF writer and reader (zip of XML parts, millimetre units) for export and its check.

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

const MODEL_PATH = "3D/3dmodel.model";

/**
 * Packs an indexed triangle mesh into a 3MF file.
 * @param positions - Vertex xyz triplets in mm.
 * @param index - Triangle vertex indices.
 */
export function write3MF(
  positions: ArrayLike<number>,
  index: ArrayLike<number>,
  name: string,
): Uint8Array {
  const parts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<resources><object id="1" type="model" name="${name.replace(/[<>&"]/g, "_")}"><mesh><vertices>`,
  ];
  for (let i = 0; i < positions.length; i += 3) {
    parts.push(
      `<vertex x="${positions[i].toFixed(4)}" y="${positions[i + 1].toFixed(4)}" z="${positions[i + 2].toFixed(4)}"/>`,
    );
  }
  parts.push("</vertices><triangles>");
  for (let t = 0; t < index.length; t += 3) {
    parts.push(
      `<triangle v1="${index[t]}" v2="${index[t + 1]}" v3="${index[t + 2]}"/>`,
    );
  }
  parts.push(
    `</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`,
  );

  return zipSync(
    {
      "[Content_Types].xml": strToU8(CONTENT_TYPES),
      "_rels/.rels": strToU8(RELS),
      [MODEL_PATH]: strToU8(parts.join("")),
    },
    { level: 6 },
  );
}

/** Reads back a 3MF written by write3MF: triangle count and bounding-box size. */
export function inspect3MF(bytes: Uint8Array): {
  triangles: number;
  size: [number, number, number];
} {
  const files = unzipSync(bytes, { filter: (f) => f.name === MODEL_PATH });
  const xml = files[MODEL_PATH];
  if (!xml) throw new Error("3MF check failed: model part missing.");
  const text = strFromU8(xml);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const vertex = /<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g;
  for (let m = vertex.exec(text); m; m = vertex.exec(text)) {
    for (let k = 0; k < 3; k++) {
      const v = Number(m[k + 1]);
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  const triangles = text.split("<triangle ").length - 1;
  return {
    triangles,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}
