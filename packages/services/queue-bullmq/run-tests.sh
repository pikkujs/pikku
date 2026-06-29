#!/bin/bash
cd "$(dirname "$0")"
exec node --test --experimental-test-coverage --loader=tsx/esm dist/**/*.test.js