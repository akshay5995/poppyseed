#!/usr/bin/env bash
# Proves docs/quickstart.md as written: packs the package as npm would
# publish them, creates a fresh Next.js app, installs the tarballs with npm,
# writes the quickstart's files from its own code blocks, then runs the
# documented agent command against `npm run dev` and checks `npm run build`.
# Usage: scripts/quickstart.sh [next version], default latest.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
PORT=3000
NEXT_VERSION="${1:-latest}"
# The dev server runs in its own process group, so stopping it stops next-server too.
stop() { kill -- -"$(cat "$WORK/dev.pid" 2>/dev/null)" 2>/dev/null || true; }
trap stop EXIT

(cd "$ROOT/packages/core" && pnpm pack --pack-destination "$WORK" >/dev/null)
cd "$WORK"
npx -y "create-next-app@$NEXT_VERSION" my-site --ts --app --no-tailwind --no-eslint --no-src-dir --import-alias "@/*" --use-npm --yes >create.log 2>&1
cd my-site
# The quickstart says `npm install poppyseed zod`; the tarball stands in for the registry.
npm install "$WORK"/poppyseed-0.*.tgz zod >/dev/null 2>&1
# The documented secret command, run as written.
secret=$(grep -o '^echo "POPPYSEED_SECRET=.*' "$ROOT/docs/quickstart.md")
eval "$secret"
python3 - "$ROOT/docs/quickstart.md" <<'PY'
import os, re, sys
docs = open(sys.argv[1]).read()
for lang, body in re.findall(r"```(\w+)\n(.*?)```", docs, re.S):
    m = re.match(r"// (\S+)\n", body)
    # next.config.ts is wrapped below, the way the docs say, so create-next-app's own options (cacheComponents) stay.
    if lang == "ts" and m and m.group(1) != "next.config.ts":
        os.makedirs(os.path.dirname(m.group(1)) or ".", exist_ok=True)
        open(m.group(1), "w").write(body)
assert "export default withPoppyseed(nextConfig);" in docs, "docs no longer wrap nextConfig"
config = open("next.config.ts").read()
assert "export default nextConfig;" in config, config
open("next.config.ts", "w").write('import { withPoppyseed } from "poppyseed/next/config";\n' + config.replace("export default nextConfig;", "export default withPoppyseed(nextConfig);"))
PY

setsid npm run dev -- -p $PORT >dev.log 2>&1 & echo $! >"$WORK/dev.pid"
for _ in $(seq 1 90); do curl -sf "http://localhost:$PORT/.well-known/poppy.json" >/dev/null && break; sleep 1; done
command=$(grep -o 'npx poppyseed agent [^`]*' "$ROOT/docs/quickstart.md" | head -1)
echo "\$ $command"
eval "$command" | tee agent.log
grep -q '"drinks"' agent.log
stop
npm run build >build.log 2>&1 || { tail -20 build.log; exit 1; }
echo "✓ the quickstart works as written on Next.js $(node -p "require('next/package.json').version") ($WORK/my-site)"
