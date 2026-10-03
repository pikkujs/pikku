#!/bin/bash
cd "$(dirname "$0")" || exit 1
status=0
for script in claim.sh done.sh merge.sh next.sh; do
  bash "$script" || status=1
done
exit $status
