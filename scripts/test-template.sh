#!/bin/bash

# Script to test a Pikku template by creating a test app and running tests
# Usage: ./test-template.sh <template-name> [version/branch-name]
#
# template-name: Must be one of the folder names in templates/ directory
# version/branch-name: Optional, defaults to current branch

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to log with color
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATES_DIR="$PROJECT_ROOT/templates"
TEST_APP_DIR="$PROJECT_ROOT/../test-app"

# Parse arguments
TEMPLATE_NAME="$1"
VERSION="${2:-}"

# Show usage if no template provided
if [ -z "$TEMPLATE_NAME" ]; then
    log_error "Usage: $0 <template-name> [version/branch-name]"
    echo ""
    echo "Available templates:"
    ls -1 "$TEMPLATES_DIR" | sed 's/^/  - /'
    echo ""
    echo "Examples:"
    echo "  $0 workflows-bullmq              # Uses current branch"
    echo "  $0 express-middleware main       # Uses specific branch"
    exit 1
fi

# Validate template exists
if [ ! -d "$TEMPLATES_DIR/$TEMPLATE_NAME" ]; then
    log_error "Template '$TEMPLATE_NAME' not found in templates directory"
    echo ""
    echo "Available templates:"
    ls -1 "$TEMPLATES_DIR" | sed 's/^/  - /'
    exit 1
fi

# Get current branch if version not specified
if [ -z "$VERSION" ]; then
    VERSION=$(git branch --show-current)
    log_info "No version specified, using current branch: $VERSION"
fi

log_info "Testing template: $TEMPLATE_NAME"
log_info "Version/branch: $VERSION"

# Clean up existing test-app directory
if [ -d "$TEST_APP_DIR" ]; then
    log_warning "Removing existing test-app directory..."
    rm -rf "$TEST_APP_DIR"
fi

# Step 1: Create test app from template
log_info "Creating test app from template..."
cd "$PROJECT_ROOT/packages/create"

if ! node ./dist/index.js \
    --template "$TEMPLATE_NAME" \
    --version "$VERSION" \
    --name ../../../test-app \
    --install \
    --package-manager yarn \
    --yarn-link ../pikku; then
    log_error "Failed to create test app from template"
    exit 1
fi

log_success "Test app created successfully"

# Step 2: Link packages, install dependencies, build, and test
log_info "Setting up and testing the app..."
cd "$TEST_APP_DIR"

# Link packages
log_info "Linking Pikku packages..."
if ! yarn link -A ../pikku; then
    log_error "Failed to link Pikku packages"
    exit 1
fi

# Install dependencies
log_info "Installing dependencies..."
if ! yarn install; then
    log_error "Failed to install dependencies"
    exit 1
fi

# Build
log_info "Building the app..."
if ! yarn run tsc; then
    log_error "TypeScript compilation failed"
    exit 1
fi

# Run tests
log_info "Running tests..."
if ! yarn run test; then
    log_error "Tests failed"
    exit 1
fi

log_success "All tests passed!"
log_success "Template '$TEMPLATE_NAME' tested successfully with version '$VERSION'"
