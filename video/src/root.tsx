import { Composition, Folder, registerRoot } from "remotion";
import { DEMO_DURATION, DemoVideo, SCENES } from "./DemoVideo";
import { Cta, Describe, Grow, Install, Open, Proof, Route, Works } from "./scenes/Scenes";
import { FPS, HEIGHT, WIDTH } from "./theme";

const scene = (id: string, component: React.FC, seconds: number) => (
	<Composition id={id} component={component} durationInFrames={Math.round(seconds * FPS)} fps={FPS} width={WIDTH} height={HEIGHT} />
);

const RemotionRoot: React.FC = () => (
	<>
		<Composition id="DemoVideo" component={DemoVideo} durationInFrames={DEMO_DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />
		<Folder name="Scenes">
			{scene("Open", Open, SCENES.open)}
			{scene("Install", Install, SCENES.install)}
			{scene("Describe", Describe, SCENES.describe)}
			{scene("Route", Route, SCENES.route)}
			{scene("Works", Works, SCENES.works)}
			{scene("Grow", Grow, SCENES.grow)}
			{scene("Proof", Proof, SCENES.proof)}
			{scene("Cta", Cta, SCENES.cta)}
		</Folder>
	</>
);

registerRoot(RemotionRoot);
