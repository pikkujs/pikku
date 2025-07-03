#!/bin/bash
cd "$(dirname "$0")"
node --loader tsx --test --experimental-test-coverage src/**/*.test.ts "$@"