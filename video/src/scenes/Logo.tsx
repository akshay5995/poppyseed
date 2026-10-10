import { color } from "../theme";

/** The Poppyseed mark: a poppy seen from above, four petals around a seed head. */
export const Logo: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
	<svg width={size} height={size} viewBox="0 0 100 100" style={style} aria-hidden>
		{[0, 90, 180, 270].map((angle) => (
			<ellipse key={angle} cx="50" cy="27" rx="21" ry="25" fill={color.petal} opacity={0.92} transform={`rotate(${angle} 50 50)`} />
		))}
		<circle cx="50" cy="50" r="15" fill={color.ink} />
		{[0, 60, 120, 180, 240, 300].map((angle) => (
			<line key={angle} x1="50" y1="50" x2="50" y2="38" stroke={color.pod} strokeWidth="3" strokeLinecap="round" transform={`rotate(${angle} 50 50)`} />
		))}
		<circle cx="50" cy="50" r="4" fill={color.pod} />
	</svg>
);
