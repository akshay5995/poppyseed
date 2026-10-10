import { withPoppyseed } from "poppyseed/next/config";

export default withPoppyseed({
	// The video ships as TypeScript source from the workspace.
	transpilePackages: ["poppyseed-video"],
});
