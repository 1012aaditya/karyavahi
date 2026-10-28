#!/usr/bin/env bash
# Restarts the production server, optionally restoring the pristine seed first.
# The order matters: the server holds the SQLite file open, so it must exit before the
# file is replaced or its shutdown checkpoint will write the old pages back over the copy.
#   scripts/restart.sh [--reset]
set -u
cd "$(dirname "$0")/.."
LOG="${KARYAVAHI_LOG:-/tmp/karyavahi-server.log}"

for pid in $(ps -eo pid,args | grep -E 'next-server|next start|next dev' | grep -v grep | awk '{print $1}'); do
  kill "$pid" 2>/dev/null
done
for _ in $(seq 1 20); do
  sleep 0.5
  ps -eo args | grep -qE 'next-server|next start' || break
done
sleep 1

if [ "${1:-}" = "--reset" ]; then
  rm -f .data/karyavahi.db-wal .data/karyavahi.db-shm
  cp .data/karyavahi.pristine.db .data/karyavahi.db
  echo "restored the pristine seed"
fi

(setsid nohup npm run start > "$LOG" 2>&1 < /dev/null &)
for i in $(seq 1 30); do
  sleep 1
  if [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/login 2>/dev/null)" = "200" ]; then
    echo "server ready after ${i}s"
    exit 0
  fi
done
echo "server did not come up; see $LOG"
tail -20 "$LOG"
exit 1
