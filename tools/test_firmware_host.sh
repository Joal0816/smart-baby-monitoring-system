#!/bin/sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/smart-baby-host.XXXXXX")
trap 'rm -rf "$temp_dir"' EXIT HUP INT TERM

cc -std=c11 -Wall -Wextra -Werror -pedantic \
  -I"$root_dir/firmware/include" \
  "$root_dir/firmware/src/alert_logic.c" \
  "$root_dir/firmware/test/test_alert_logic.c" \
  -lm -o "$temp_dir/test-alert-logic"
"$temp_dir/test-alert-logic"
