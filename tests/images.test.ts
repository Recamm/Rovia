// @vitest-environment node
import { beforeAll, describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import {
  initializeImageMagick,
  ImageMagick,
  MagickFormat,
  MagickColors,
} from "@imagemagick/magick-wasm";
import { processImage } from "../supabase/functions/_shared/process-image";
beforeAll(async () => {
  await initializeImageMagick(
    await readFile(
      import.meta
        .resolve("@imagemagick/magick-wasm/magick.wasm")
        .replace("file://", ""),
    ),
  );
}, 30000);
describe("Procesamiento real de imágenes con WASM", () => {
  it("reprocesa JPEG, genera miniatura y elimina metadatos", () => {
    const input = ImageMagick.read(MagickColors.Red, 800, 600, (img) => {
      img.comment = "ubicación privada de prueba";
      img.setProfile(
        "xmp",
        new TextEncoder().encode(
          '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></x:xmpmeta>',
        ),
      );
      return img.write(MagickFormat.Jpeg, (b) => new Uint8Array(b));
    });
    const { full, thumb } = processImage(input);
    ImageMagick.read(full, (img) => {
      expect(img.width).toBe(800);
      expect(img.profileNames).toEqual([]);
      expect(img.comment).toBeNull();
    });
    ImageMagick.read(thumb, (img) => expect(img.width).toBe(360));
  });
  it("rechaza contenido falso y archivos demasiado grandes", () => {
    expect(() =>
      processImage(new TextEncoder().encode("<svg>imagen falsa</svg>")),
    ).toThrow();
    expect(() => processImage(new Uint8Array(6 * 1024 * 1024))).toThrow();
    expect(() =>
      processImage(new Uint8Array([255, 216, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0])),
    ).toThrow();
  });
});
