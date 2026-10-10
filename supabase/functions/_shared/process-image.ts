import {
  ImageMagick,
  MagickImageInfo,
  MagickFormat,
  ResourceLimits,
} from "@imagemagick/magick-wasm";
export function processImage(bytes: Uint8Array, avatar = false) {
  if (bytes.length > 5 * 1024 * 1024 || bytes.length < 12)
    throw new Error(
      "El archivo debe pesar hasta 5 MB y ser una imagen válida.",
    );
  // Restrict by signature before calling the decoder: SVG/PDF and external delegates never run.
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = bytes
    .slice(0, 8)
    .every((v, i) => v === [137, 80, 78, 71, 13, 10, 26, 10][i]);
  const webp =
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (!jpeg && !png && !webp)
    throw new Error("Usá imágenes JPEG, PNG o WebP válidas.");
  ResourceLimits.memory = 64n * 1024n * 1024n;
  ResourceLimits.disk = 0n;
  ResourceLimits.listLength = 16n;
  ResourceLimits.width = 6000n;
  ResourceLimits.height = 6000n;
  const info = MagickImageInfo.create(bytes);
  if (info.width * info.height > 8000000)
    throw new Error(
      "La imagen tiene demasiados píxeles. Reducila a menos de 8 megapíxeles.",
    );
  return ImageMagick.read(bytes, (img) => {
    if (
      img.format !== MagickFormat.Jpeg &&
      img.format !== MagickFormat.Png &&
      img.format !== MagickFormat.WebP
    )
      throw new Error("Formato no permitido.");
    img.autoOrient();
    img.strip();
    img.quality = 82;
    const max = avatar ? 512 : 1600;
    const factor = Math.min(1, max / img.width, max / img.height);
    img.resize(Math.round(img.width * factor), Math.round(img.height * factor));
    const full = img.write(MagickFormat.Jpeg, (data) => new Uint8Array(data));
    const thumbFactor = Math.min(1, 360 / img.width, 360 / img.height);
    img.resize(
      Math.round(img.width * thumbFactor),
      Math.round(img.height * thumbFactor),
    );
    img.strip();
    const thumb = img.write(MagickFormat.Jpeg, (data) => new Uint8Array(data));
    return { full, thumb };
  });
}
