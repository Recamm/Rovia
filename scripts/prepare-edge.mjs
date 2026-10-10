import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
await mkdir("supabase/functions/image-upload", { recursive: true });
await copyFile(
  require.resolve("@imagemagick/magick-wasm/magick.wasm"),
  "supabase/functions/image-upload/magick.wasm",
);
console.log("WASM preparado para desplegar image-upload.");
