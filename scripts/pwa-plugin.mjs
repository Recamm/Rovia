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
      const fingerprint = createHash("sha256")
        .update(paths.join("\n"))
        .update(template);
      fingerprint.update(
        readFileSync(new URL("../index.html", import.meta.url)),
      );
      for (const asset of shell.filter((path) => path !== "/index.html"))
        fingerprint.update(
          readFileSync(new URL(`../public${asset}`, import.meta.url)),
        );
      const version = fingerprint.digest("hex").slice(0, 16);
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
