#!/bin/bash

# Define the URL to check
HTTP_PREFIX=${HTTP_PREFIX:-http://localhost:4002}
URL="${HTTP_PREFIX}/hello-world"

# Maximum duration before exiting (in seconds)
TIMEOUT=30
START_TIME=$(date +%s)

while true; do
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")

    if [ "$RESPONSE" -eq 200 ]; then
        echo "Health check passed. Exiting."
        exit 0
    fi

    # Check if the timeout has been reached
    CURRENT_TIME=$(date +%s)
    ELAPSED_TIME=$((CURRENT_TIME - START_TIME))

    if [ "$ELAPSED_TIME" -ge "$TIMEOUT" ]; then
        echo "Health check failed after $TIMEOUT seconds. Exiting with failure."
        exit 1
    fi

    echo "Health check failed with status $RESPONSE. Retrying..."
    sleep 2
done
