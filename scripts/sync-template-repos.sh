#!/bin/bash

# Script to sync a single template repository after a GitHub release
# Usage: ./sync-template-repos.sh <template-name> [--apply] [--token xxx]
#
# Without --apply: Creates a new branch with the template content (dry run)
# With --apply: Deletes the old main branch and replaces it with the new content
# --token xxx: Optionally provides a GitHub token for HTTPS auth

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
GITHUB_ORG="pikkujs"

# Parse arguments
APPLY_CHANGES="false"
GITHUB_TOKEN=""
TEMPLATE_NAME=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --apply)
            APPLY_CHANGES="true"
            shift
            ;;
        --token)
            GITHUB_TOKEN="$2"
            shift 2
            ;;
        -*)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
        *)
            if [ -z "$TEMPLATE_NAME" ]; then
                TEMPLATE_NAME="$1"
                shift
            else
                echo -e "${RED}Unexpected positional argument: $1${NC}"
                exit 1
            fi
            ;;
    esac
done

if [ -z "$TEMPLATE_NAME" ]; then
    echo -e "${RED}Usage: $0 <template-name> [--apply] [--token xxx]${NC}"
    echo -e "${YELLOW}Examples:${NC}"
    echo -e "  $0 express-middleware"
    echo -e "  $0 express-middleware --apply"
    echo -e "  $0 express-middleware --token ghp_xxx"
    exit 1
fi

# Function to log with color
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Main sync function
sync_template() {
    local template_name="$1"
    local repo_name="template-$template_name"
    local repo_url

    if [ -z "$GITHUB_TOKEN" ]; then
        repo_url="git@github.com:$GITHUB_ORG/$repo_name.git"
        log_info "Using SSH authentication"
    else
        repo_url="https://x-access-token:$GITHUB_TOKEN@github.com/$GITHUB_ORG/$repo_name.git"
        log_info "Using HTTPS authentication with token"
    fi

    local temp_dir="/tmp/pikku-sync-$template_name-$$"
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local test_app_dir="${script_dir}/../../test-app"
    local branch_name="sync-$(date +%Y%m%d-%H%M%S)"

    if [ "$APPLY_CHANGES" = "true" ]; then
        log_info "Running in APPLY mode - changes will be permanent"
    else
        log_info "Running in DRY RUN mode - no permanent changes"
        log_warning "Use --apply flag to actually replace the main branch"
    fi

    log_info "Syncing template: $template_name"

    if [ ! -d "$test_app_dir" ]; then
        log_error "test-app directory not found at $test_app_dir"
        return 1
    fi

    mkdir -p "$temp_dir"

    log_info "Cloning $repo_url"
    if ! git clone "$repo_url" "$temp_dir" 2>/dev/null; then
        log_error "Failed to clone $repo_url - repository may not exist or authentication failed"
        rm -rf "$temp_dir"
        return 1
    fi

    cd "$temp_dir"

    log_info "Creating new orphan branch: $branch_name"
    git checkout --orphan "$branch_name"
    git rm -rf . 2>/dev/null || true

    log_info "Copying files from $test_app_dir"

    test_app_abs_path=$(cd "$test_app_dir" && pwd)

    rm -rf "$test_app_abs_path/node_modules" 2>/dev/null || true
    cp -r "$test_app_abs_path/"* . 2>/dev/null || true
    cp -r "$test_app_abs_path/".gitignore . 2>/dev/null || true

    echo "Copying complete. Current directory contents:"
    ls -alh

    git add .

    if git diff --cached --quiet; then
        log_warning "No changes detected for $template_name"
        cd /
        rm -rf "$temp_dir"
        return 0
    fi

    log_info "Committing changes"
    git -c user.name="GitHub Actions" -c user.email="actions@github.com" \
        commit -m "Sync template from pikku release

This template was automatically generated and synced from the main pikku repository.

Generated on: $(date -u '+%Y-%m-%d %H:%M:%S UTC')
From commit: ${GITHUB_SHA:-unknown}"

    log_info "Pushing branch: $branch_name"
    git push origin "$branch_name"

    if [ "$APPLY_CHANGES" = "true" ]; then
        log_info "Replacing remote 'main' branch with $branch_name"
        git push origin "$branch_name:main" --force
        git push origin --delete "$branch_name"
        log_success "Successfully replaced main branch for template: $template_name"
    else
        log_info "Dry run complete. New branch '$branch_name' created with updated content"
        log_warning "To apply changes, run: $0 $template_name --apply"
    fi

    cd /
    rm -rf "$temp_dir"
    return 0
}

# Main execution
main() {
    cd "$(dirname "$0")/.."

    if sync_template "$TEMPLATE_NAME"; then
        if [ "$APPLY_CHANGES" = "true" ]; then
            log_success "Template $TEMPLATE_NAME successfully synced and applied!"
        else
            log_success "Dry run completed for template $TEMPLATE_NAME"
        fi
    else
        log_error "Failed to sync template: $TEMPLATE_NAME"
        exit 1
    fi
}

main "$@"
