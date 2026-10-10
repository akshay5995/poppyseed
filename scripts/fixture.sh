#!/usr/bin/env bash
# Drives the Next.js fixture app (fixtures/next-app): the reference company
# served through poppyseed/next. Usage:
#   fixture.sh start [--no-build]   build, start on $PORT (default 3110), wait until ready
#   fixture.sh doctor               is the running instance ours, healthy, with test hooks?
#   fixture.sh check [conformance args…]   run the conformance suite over HTTP; evidence to $RUN_DIR
#   fixture.sh stop                 stop the instance this script started
#   fixture.sh e2e                  start, check with every hook (one allowed skip), stop: what `pnpm e2e` runs
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
APP="$ROOT/fixtures/next-app"
PORT=${PORT:-3110}
BASE="http://localhost:$PORT"
STATE="$ROOT/.verify/next"
PIDFILE="$STATE/server-$PORT.pid"
LOG="$STATE/server-$PORT.log"
mkdir -p "$STATE"

ready() { curl -fsS -o /dev/null "$BASE/.well-known/poppy.json" 2>/dev/null; }
alive() { [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }

case "${1:-}" in
start)
	if alive; then echo "already running: pid $(cat "$PIDFILE") at $BASE"; exit 0; fi
	if ready; then echo "✗ something else answers at $BASE; set PORT" >&2; exit 1; fi
	[ "${2:-}" = "--no-build" ] || (cd "$ROOT" && pnpm --filter poppyseed-fixture-next-app build)
	cd "$APP"
	# Its own session and process group, so stop can kill exactly what this started.
	POPPYSEED_BASE_URL="$BASE" POPPYSEED_TEST_HOOKS=1 POPPYSEED_SECRET=verify-only-secret-verify-only-secret-12 \
		setsid npx next start -p "$PORT" </dev/null >"$LOG" 2>&1 &
	echo $! >"$PIDFILE"
	for _ in $(seq 1 120); do
		ready && { echo "✓ fixture ready at $BASE (pid $(cat "$PIDFILE"), log $LOG)"; exit 0; }
		alive || break
		sleep 0.5
	done
	echo "✗ fixture did not start; last log lines:" >&2; tail -20 "$LOG" >&2; rm -f "$PIDFILE"; exit 1
	;;
doctor)
	alive || { echo "✗ no fixture started by this script (no live $PIDFILE)"; exit 1; }
	org=$(curl -fsS "$BASE/.well-known/poppy.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).organization.name))') || { echo "✗ $BASE/.well-known/poppy.json does not answer"; exit 1; }
	[ "$org" = "Reference Company" ] || { echo "✗ $BASE serves \"$org\", not the fixture"; exit 1; }
	hooks=$(curl -fsS "$BASE/test-hooks/hooks" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).hooks.join(", ")))') || { echo "✗ test hooks are off (start with this script)"; exit 1; }
	echo "✓ pid $(cat "$PIDFILE") serves the fixture at $BASE; hooks: $hooks"
	;;
check)
	shift
	RUN_DIR=${RUN_DIR:-"$STATE/runs/$(date -u +%Y%m%dT%H%M%SZ)"}
	mkdir -p "$RUN_DIR"
	cd "$ROOT"
	set +e
	pnpm --silent --filter poppyseed poppyseed check "$BASE" --hooks "$BASE/test-hooks" --json "$RUN_DIR/report.json" --markdown "$RUN_DIR/report.md" "$@" | tee "$RUN_DIR/console.txt"
	code=${PIPESTATUS[0]}
	set -e
	cp "$LOG" "$RUN_DIR/server.log" 2>/dev/null || true
	if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then cat "$RUN_DIR/report.md" >>"$GITHUB_STEP_SUMMARY"; fi
	echo "evidence: $RUN_DIR (exit $code)"
	exit "$code"
	;;
stop)
	if [ -f "$PIDFILE" ]; then
		pid=$(cat "$PIDFILE")
		kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
		rm -f "$PIDFILE"
		echo "✓ stopped pid $pid"
	else
		echo "nothing to stop"
	fi
	;;
e2e)
	# A fresh build on a port nothing else uses, so the run never tests an old server.
	if alive || ready; then echo "✗ something already answers at $BASE; stop it or set E2E_PORT" >&2; exit 1; fi
	"$0" start
	set +e
	# Agents run on 127.0.0.1, so the fixture must accept loopback agents; the in-process suite proves the refusal.
	"$0" check --allow-skip identity/private-agent-urls
	code=$?
	set -e
	"$0" stop
	exit "$code"
	;;
*)
	sed -n '2,9p' "$0"; exit 2
	;;
esac
