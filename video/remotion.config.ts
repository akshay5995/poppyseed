import { Config } from "@remotion/cli/config";

// The video's assets (the fonts) live in the site's public folder, which serves them to the Player too.
Config.setPublicDir("../site/public");
