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
PACKAGE_MANAGER="${3:-yarn}"

# Show usage if no template provided
if [ -z "$TEMPLATE_NAME" ]; then
    log_error "Usage: $0 <template-name> [version/branch-name] [package-manager]"
    echo ""
    echo "Available templates:"
    ls -1 "$TEMPLATES_DIR" | sed 's/^/  - /'
    echo ""
    echo "Examples:"
    echo "  $0 workflows-bullmq              # Uses current branch, yarn"
    echo "  $0 express-middleware main bun   # Uses specific branch, bun"
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
log_info "Package manager: $PACKAGE_MANAGER"

# Clean up existing test-app directory
if [ -d "$TEST_APP_DIR" ]; then
    log_warning "Removing existing test-app directory..."
    rm -rf "$TEST_APP_DIR"
fi

# Step 1: Create test app from template
log_info "Creating test app from template..."
cd "$PROJECT_ROOT/packages/create"

if [ "$PACKAGE_MANAGER" = "yarn" ]; then
    CREATE_ARGS=(
        --template "$TEMPLATE_NAME"
        --version "$VERSION"
        --name ../../../test-app
        --install
        --package-manager yarn
        --yarn-link "$PROJECT_ROOT"
    )
else
    # For non-yarn: scaffold only so we can patch overrides
    # before the package manager resolves deps from npm.
    CREATE_ARGS=(
        --template "$TEMPLATE_NAME"
        --version "$VERSION"
        --name ../../../test-app
        --package-manager "$PACKAGE_MANAGER"
        --skip-install
    )
fi

if ! node ./dist/index.js "${CREATE_ARGS[@]}"; then
    log_error "Failed to create test app from template"
    exit 1
fi

log_success "Test app created successfully"

# Step 2: Link packages, install dependencies, build, and test
log_info "Setting up and testing the app..."
cd "$TEST_APP_DIR"

if [ "$PACKAGE_MANAGER" = "yarn" ]; then
    # Link packages
    # create-pikku already ran `yarn link --all --private ../pikku`, but the
    # postinstall (`pikku all`) ran during the install BEFORE that link applied,
    # so any subsequent `pikku ...` invocation can pick up the npm-published
    # CLI instead of the in-repo one. Re-link here to force the in-repo @pikku/*
    # packages for everything that follows (notably `pikku all --target ...`).
    log_info "Re-linking Pikku packages..."
    if ! yarn link -A "$PROJECT_ROOT"; then
        log_error "Failed to link Pikku packages"
        exit 1
    fi

    # Install dependencies (refreshes node_modules with the linked packages)
    log_info "Installing dependencies..."
    if ! yarn install; then
        log_error "Failed to install dependencies"
        exit 1
    fi

    # Replace duplicate copies of packages that use #private class fields with
    # symlinks to the monorepo's copy. With yarn portals, the portal's dependencies
    # resolve from the monorepo's node_modules while the test-app installs its own
    # copy, causing TypeScript to see two incompatible versions (TS2345).
    log_info "Deduplicating portal-conflicting packages..."
    for pkg in kysely fastify fastify-plugin; do
        if [ -d "node_modules/$pkg" ] && [ -d "$PROJECT_ROOT/node_modules/$pkg" ]; then
            rm -rf "node_modules/$pkg"
            ln -s "$(cd "$PROJECT_ROOT/node_modules/$pkg" && pwd)" "node_modules/$pkg"
        fi
    done
else
    log_info "Patching package.json with file: paths for @pikku/* packages..."
    PROJECT_ROOT="$PROJECT_ROOT" node -e "
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.env.PROJECT_ROOT;
const pkgPath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

// Scan every workspace member dir for @pikku/* packages. 'templates' must be
// included alongside 'packages' so workspace-only deps that live under
// templates/ (e.g. @pikku/templates-function-addon) also get a local path —
// otherwise their 'workspace:*' specifier survives and bun, lacking a workspace,
// fails to resolve it.
const dirs = ['packages', 'templates'];
const files = dirs.flatMap((d) =>
  execSync(
    'find ' + root + '/' + d + ' -name package.json -not -path \"*/node_modules/*\" -maxdepth 4',
    { encoding: 'utf8' }
  ).trim().split('\n').filter(Boolean)
);

const localPaths = {};
for (const f of files) {
  try {
    const p = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (p.name && p.name.startsWith('@pikku/')) {
      localPaths[p.name] = 'file:' + path.dirname(f);
    }
  } catch {}
}

const depTypes = ['dependencies', 'devDependencies', 'peerDependencies'];
for (const dt of depTypes) {
  if (pkg[dt]) {
    for (const [name, ver] of Object.entries(pkg[dt])) {
      if (localPaths[name]) {
        pkg[dt][name] = localPaths[name];
      }
    }
  }
}

// Drop entries duplicated across dependency types. A package present in both
// 'dependencies' and 'devDependencies' makes bun's file: linker emit a broken
// self-referential symlink (package.json -> package.json), so the package can't
// be resolved by tsc or the runtime. Keep the 'dependencies' copy.
for (const dt of ['devDependencies', 'peerDependencies']) {
  if (pkg.dependencies && pkg[dt]) {
    for (const name of Object.keys(pkg[dt])) {
      if (name in pkg.dependencies) {
        delete pkg[dt][name];
      }
    }
  }
}

// Force every @pikku/* package — including transitive ones pulled in via
// published version ranges (^0.12.x) by the file:-linked packages — to resolve
// to the in-repo copy. Without yarn's global 'link --all', bun would otherwise
// fetch those ranges from npm, which fails for versions not yet published.
pkg.overrides = Object.assign({}, pkg.overrides, localPaths);

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('Replaced ' + Object.keys(localPaths).length + ' @pikku/* entries with file: paths');
"

    log_info "Ensuring TypeScript declarations exist for @pikku/* file: deps..."
    for pkg_path in $(node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const all = {...(pkg.dependencies||{}), ...(pkg.devDependencies||{})};
Object.entries(all)
  .filter(([n,v]) => n.startsWith('@pikku/') && typeof v === 'string' && v.startsWith('file:'))
  .forEach(([n,v]) => console.log(v.replace('file:', '')));
" 2>/dev/null); do
        if [ -d "$pkg_path" ] && [ ! -f "$pkg_path/dist/index.d.ts" ]; then
            log_info "Rebuilding $pkg_path (dist/index.d.ts missing)..."
            (cd "$pkg_path" && yarn build 2>/dev/null) || log_warning "Build failed for $pkg_path"
        fi
    done

    log_info "Installing dependencies..."
    if ! "$PACKAGE_MANAGER" install; then
        log_error "Failed to install dependencies"
        exit 1
    fi

    log_info "Checking @pikku package installation..."
    for pkg in schedule modelcontextprotocol; do
        pkg_dir=$(find node_modules/@pikku -maxdepth 1 -name "$pkg" -type d -o -name "$pkg" -type l 2>/dev/null | head -1)
        if [ -n "$pkg_dir" ]; then
            if [ -f "$pkg_dir/dist/index.d.ts" ]; then
                log_success "@pikku/$pkg: dist/index.d.ts exists"
            else
                log_warning "@pikku/$pkg: dist/index.d.ts MISSING (root: $(ls $pkg_dir/ 2>/dev/null | tr '\n' ' '); dist/: $(ls $pkg_dir/dist/ 2>/dev/null | tr '\n' ' '))"
            fi
        fi
    done

    log_info "Running pikku codegen..."
    if ! "$PACKAGE_MANAGER" run pikku; then
        log_error "Pikku codegen failed"
        exit 1
    fi
fi

# Serverless-target templates: re-run codegen with --target serverless so
# server-only functions (e.g. those depending on metaService → node:fs) are
# pruned from the bundle. metaService is declared serverlessIncompatible in
# templates/functions/pikku.config.json.
case "$TEMPLATE_NAME" in
    aws-lambda|aws-lambda-websocket|cloudflare-workers|cloudflare-websocket|nextjs|nextjs-full)
        log_info "Regenerating with --target serverless for $TEMPLATE_NAME..."
        if [ "$PACKAGE_MANAGER" = "yarn" ]; then
            # `yarn pikku all` would treat `all` as a yarn subcommand; use `yarn run`
            # with `--` to forward args to the script verbatim.
            if ! yarn run pikku -- all --target serverless; then
                log_error "pikku all --target serverless failed"
                exit 1
            fi
        else
            if ! "$PACKAGE_MANAGER" run pikku all --target serverless; then
                log_error "pikku all --target serverless failed"
                exit 1
            fi
        fi
        ;;
esac

# Build
log_info "Building the app..."
case "$TEMPLATE_NAME" in
    nextjs|nextjs-full)
        if ! "$PACKAGE_MANAGER" run build; then
            log_error "Build failed"
            exit 1
        fi
        ;;
    *)
        if ! "$PACKAGE_MANAGER" run tsc; then
            log_error "TypeScript compilation failed"
            exit 1
        fi
        ;;
esac

# Cloudflare workers run in workerd, which reads secrets from the `env` binding,
# not the host process.env. wrangler dev loads `.dev.vars` into that binding, so
# write the build-only better-auth secret there for the test run (dev-only file,
# never committed). Non-CF templates read process.env directly and skip this.
case "$TEMPLATE_NAME" in
    cloudflare-workers|cloudflare-websocket)
        if [ -n "$BETTER_AUTH_SECRET" ]; then
            log_info "Writing .dev.vars for $TEMPLATE_NAME (wrangler env binding)..."
            echo "BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET" > .dev.vars
        fi
        ;;
esac

# Run tests
log_info "Running tests..."
if [ "$PACKAGE_MANAGER" = "yarn" ] && [ -n "$TEMPLATE_V8_COVERAGE_DIR" ]; then
    if ! NODE_V8_COVERAGE="$TEMPLATE_V8_COVERAGE_DIR" yarn run test; then
        log_error "Tests failed"
        exit 1
    fi
elif ! "$PACKAGE_MANAGER" run test; then
    log_error "Tests failed"
    exit 1
fi

log_success "All tests passed!"
log_success "Template '$TEMPLATE_NAME' tested successfully with version '$VERSION'"
