import { Composition } from "remotion";

import { DURATION, FPS } from "./launch/cues";
import { Launch } from "./launch/Launch";

export function Root() {
  return (
    <Composition id="Launch" component={Launch} width={1920} height={1080} fps={FPS} durationInFrames={Math.round(DURATION * FPS)} defaultProps={{ debug: false }} />
  );
}
