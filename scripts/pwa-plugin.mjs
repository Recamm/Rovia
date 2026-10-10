import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

/** @returns {import("vite").Plugin} */
export default function pwa() {
  return {
    name: "rovia-pwa",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const paths = Object.keys(bundle)
        .filter((name) => /\.(js|css|woff2)$/.test(name))
        .sort();
      const version = createHash("sha256")
        .update(paths.join("\n"))
        .digest("hex")
        .slice(0, 16);
      const shell = [
        "/index.html",
        "/logo.svg",
        "/manifest.webmanifest",
        "/icons/rovia-32.png",
        "/icons/rovia-180.png",
        "/icons/rovia-192.png",
        "/icons/rovia-512.png",
        "/icons/rovia-maskable-512.png",
      ];
      const template = readFileSync(
        new URL("./service-worker.js", import.meta.url),
        "utf8",
      );
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: template
          .replace("__BUILD_ID__", version)
          .replace(
            "__ASSETS__",
            JSON.stringify([...shell, ...paths.map((p) => `/${p}`)]),
          ),
      });
    },
  };
}
