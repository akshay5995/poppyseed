"use client";

import { DEMO_DURATION, DemoVideo, FPS, HEIGHT, WIDTH } from "poppyseed-video";
import { Player } from "@remotion/player";

/** The demo video, played live from its Remotion composition. */
export function DemoPlayer() {
	return (
		<Player
			component={DemoVideo}
			durationInFrames={DEMO_DURATION}
			fps={FPS}
			compositionWidth={WIDTH}
			compositionHeight={HEIGHT}
			controls
			loop
			clickToPlay
			acknowledgeRemotionLicense
			// Open on the title rather than its first, black frame.
			initialFrame={60}
			style={{ width: "100%", aspectRatio: `${WIDTH} / ${HEIGHT}`, borderRadius: 6, border: "1px solid var(--line)", overflow: "hidden" }}
		/>
	);
}
