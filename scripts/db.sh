#!/usr/bin/env bash
# Query the Supabase REST API for this project, with credentials read from .env.local.
#
# There is no psql or supabase CLI wired up here (migrations are run by hand in the Supabase SQL
# Editor -- see AGENTS.md), so PostgREST over curl is the only way to look at the data. This
# wraps the auth headers and, importantly, pages past PostgREST's silent 1000-row cap: an
# unranged select returns at most 1000 rows with no error and no indication it truncated, which
# has previously caused real companies to be dropped from target-companies.json.
#
# Usage:
#   scripts/db.sh 'postings?is_active=eq.true&select=company,title'   # GET, auto-paginated
#   scripts/db.sh --count 'postings?is_active=eq.true&select=id'      # just the row count
#   scripts/db.sh --patch 'postings?id=eq.<uuid>' '{"is_eligible":true}'
#
# Output is JSON on stdout, so pipe it: scripts/db.sh '...' | jq '.[].company' | sort -u
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$ROOT/.env.local" ] || { echo "scripts/db.sh: no .env.local at $ROOT" >&2; exit 1; }
set -a; . "$ROOT/.env.local"; set +a
: "${SUPABASE_URL:?not set in .env.local}" "${SUPABASE_SERVICE_ROLE_KEY:?not set in .env.local}"

AUTH=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
PAGE=1000

case "${1:-}" in
  --count)
    [ $# -ge 2 ] || { echo "scripts/db.sh --count <query>" >&2; exit 1; }
    curl -sS "${AUTH[@]}" -H "Prefer: count=exact" -H "Range: 0-0" -D- -o /dev/null \
      "$SUPABASE_URL/rest/v1/$2" | awk -F'/' '/[Cc]ontent-[Rr]ange/ {gsub(/\r/,"",$2); print $2}'
    ;;
  --patch)
    [ $# -ge 3 ] || { echo "scripts/db.sh --patch <query> <json>" >&2; exit 1; }
    curl -sS -X PATCH "${AUTH[@]}" -H "Content-Type: application/json" \
      -H "Prefer: return=representation" -d "$3" "$SUPABASE_URL/rest/v1/$2"
    ;;
  "" | -h | --help)
    awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "${BASH_SOURCE[0]}"
    ;;
  *)
    # Walk Range windows until a page comes back short, then emit one concatenated JSON array.
    offset=0
    { echo '['
      first=1
      while :; do
        page="$(curl -sS "${AUTH[@]}" -H "Range: $offset-$((offset + PAGE - 1))" "$SUPABASE_URL/rest/v1/$1")"
        n="$(printf '%s' "$page" | jq 'if type=="array" then length else -1 end')"
        if [ "$n" -lt 0 ]; then printf '%s' "$page" >&2; echo >&2; exit 1; fi
        if [ "$n" -gt 0 ]; then
          [ $first -eq 1 ] || echo ','
          first=0
          printf '%s' "$page" | jq -c '.[]' | paste -sd, -
        fi
        [ "$n" -lt "$PAGE" ] && break
        offset=$((offset + PAGE))
      done
      echo ']'
    } | jq -c '.'
    ;;
esac
