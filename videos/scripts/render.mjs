// Final render: node scripts/render.mjs <version>  ->  out/launch/<version>/distance-shipping-launch.mp4 (+ poster.jpg)
import path from "node:path";
import fs from "node:fs";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";

const version = process.argv[2] ?? "v1";
const dir = path.resolve("out/launch", version);
fs.mkdirSync(dir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const inputProps = { debug: false };
const composition = await selectComposition({ serveUrl, id: "Launch", inputProps });
const output = path.join(dir, "distance-shipping-launch.mp4");
let last = -1;
await renderMedia({
  serveUrl, composition, inputProps, outputLocation: output,
  codec: "h264", crf: 16, pixelFormat: "yuv420p", colorSpace: "bt709", muted: true, imageFormat: "png",
  onProgress: ({ progress }) => { const p = Math.floor(progress * 10); if (p !== last) { last = p; console.log(`${p * 10}%`); } },
});
// Poster: the map scene with the checkout price, the clearest single frame.
await renderStill({ serveUrl, composition, frame: Math.round(9.6 * composition.fps), output: path.join(dir, "poster.jpg"), imageFormat: "jpeg", jpegQuality: 92, inputProps });
for (const f of fs.readdirSync(dir)) console.log(f, (fs.statSync(path.join(dir, f)).size / 1e6).toFixed(1), "MB");
