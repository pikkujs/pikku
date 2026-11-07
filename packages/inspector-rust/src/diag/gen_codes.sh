#!/bin/sh
# Regenerates codes_gen.rs from the TS ErrorCode enum (the same source as Go's
# internal/diag/gen_codes.sh). Run from this directory.
set -e
src=../../../inspector/src/error-codes.ts
{
echo "// Generated from packages/inspector/src/error-codes.ts by gen_codes.sh. DO NOT EDIT."
echo
grep -E "^\s+[A-Z_0-9]+ = 'PKU[0-9]+'," "$src" | sed -E "s/^ *([A-Z_0-9]+) = '(PKU[0-9]+)',/pub const \1: \&str = \"\2\";/"
} > codes_gen.rs
