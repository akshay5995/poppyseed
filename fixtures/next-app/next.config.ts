import { withPoppyseed } from "poppyseed/next/config";

// cacheComponents is on, as create-next-app 16 sets it, so the suite proves Poppyseed works with it.
export default withPoppyseed({ transpilePackages: ["poppyseed-reference"], cacheComponents: true });
