import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { useVideoConfig } from "remotion";
import { Cta, Describe, Grow, Install, Open, Proof, Route, Works } from "./scenes/Scenes";
import { FPS } from "./theme";

const TRANSITION = 12;

/** Seconds per scene: the promise, three steps, the result, what grows with you, the proof, how to start. */
export const SCENES = { open: 3.5, install: 4, describe: 6, route: 5, works: 6.5, grow: 7.5, proof: 3.5, cta: 4 };

export const DEMO_DURATION = Math.round(Object.values(SCENES).reduce((a, b) => a + b, 0) * FPS) - 7 * TRANSITION;

export const DemoVideo: React.FC = () => {
	const { fps } = useVideoConfig();
	const next = (direction: "from-right" | "from-bottom" = "from-right") => (
		<TransitionSeries.Transition presentation={slide({ direction })} timing={linearTiming({ durationInFrames: TRANSITION })} />
	);
	return (
		<TransitionSeries>
			<TransitionSeries.Sequence name="Let personal agents use your site" durationInFrames={SCENES.open * fps} premountFor={fps}>
				<Open />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />
			<TransitionSeries.Sequence name="1 Install" durationInFrames={SCENES.install * fps} premountFor={fps}>
				<Install />
			</TransitionSeries.Sequence>
			{next()}
			<TransitionSeries.Sequence name="2 Describe" durationInFrames={SCENES.describe * fps} premountFor={fps}>
				<Describe />
			</TransitionSeries.Sequence>
			{next()}
			<TransitionSeries.Sequence name="3 Route" durationInFrames={SCENES.route * fps} premountFor={fps}>
				<Route />
			</TransitionSeries.Sequence>
			{next("from-bottom")}
			<TransitionSeries.Sequence name="It works" durationInFrames={SCENES.works * fps} premountFor={fps}>
				<Works />
			</TransitionSeries.Sequence>
			{next()}
			<TransitionSeries.Sequence name="Approvals" durationInFrames={SCENES.grow * fps} premountFor={fps}>
				<Grow />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />
			<TransitionSeries.Sequence name="Proof" durationInFrames={SCENES.proof * fps} premountFor={fps}>
				<Proof />
			</TransitionSeries.Sequence>
			<TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />
			<TransitionSeries.Sequence name="Get started" durationInFrames={SCENES.cta * fps} premountFor={fps}>
				<Cta />
			</TransitionSeries.Sequence>
		</TransitionSeries>
	);
};
