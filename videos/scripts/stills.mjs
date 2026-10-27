// Bundle once, render many stills: node scripts/stills.mjs <outDir> <seconds...> [--debug]
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const args = process.argv.slice(2);
const debug = args.includes("--debug");
const [outDir, ...times] = args.filter((a) => a !== "--debug");
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const inputProps = { debug };
const composition = await selectComposition({ serveUrl, id: "Launch", inputProps });
for (const s of times) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(s) * composition.fps));
  const output = path.resolve(outDir, `t${String(s).padStart(5, "0")}.png`);
  await renderStill({ serveUrl, composition, frame, output, inputProps });
  console.log(output);
}
