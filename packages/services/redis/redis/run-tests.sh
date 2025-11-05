#!/bin/bash

# Parse command line arguments
WATCH_MODE=false
COVERAGE_MODE=false

for arg in "$@"
do
    case $arg in
        --watch)
        WATCH_MODE=true
        shift
        ;;
        --coverage)
        COVERAGE_MODE=true
        shift
        ;;
    esac
done

# Build the command
CMD="node --import tsx --test src/**/*.test.ts"

if [ "$WATCH_MODE" = true ]; then
    CMD="$CMD --watch"
fi

if [ "$COVERAGE_MODE" = true ]; then
    CMD="$CMD --experimental-test-coverage"
fi

# Execute the command
eval $CMD
