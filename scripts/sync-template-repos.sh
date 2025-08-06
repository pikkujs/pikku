#!/bin/bash

# Script to sync a single template repository after a GitHub release
# Usage: ./sync-template-repos.sh <template-name> [--apply]
#
# Without --apply: Creates a new branch with the template content (dry run)
# With --apply: Deletes the old main branch and replaces it with the new content

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
TEMPLATE_NAME="$1"
APPLY_CHANGES="$2"

if [ -z "$TEMPLATE_NAME" ]; then
    echo -e "${RED}Usage: $0 <template-name> [--apply]${NC}"
    echo -e "${YELLOW}Examples:${NC}"
    echo -e "  $0 express-middleware           # Dry run"
    echo -e "  $0 express-middleware --apply   # Apply changes"
    exit 1
fi

# Function to log with color
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Main sync function
sync_template() {
    local template_name="$1"
    local apply_changes="$2"
    local repo_name="template-$template_name"
    local repo_url
    
    # Use SSH if no GITHUB_TOKEN, otherwise use HTTPS
    if [ -z "$GITHUB_TOKEN" ]; then
        repo_url="git@github.com:$GITHUB_ORG/$repo_name.git"
        log_info "Using SSH authentication"
    else
        repo_url="https://$GITHUB_TOKEN@github.com/$GITHUB_ORG/$repo_name.git"
        log_info "Using HTTPS authentication with token"
    fi
    
    local temp_dir="/tmp/pikku-sync-$template_name-$$"
    local test_app_dir="../test-app"
    local branch_name="sync-$(date +%Y%m%d-%H%M%S)"
    
    if [ "$apply_changes" = "--apply" ]; then
        log_info "Running in APPLY mode - changes will be permanent"
    else
        log_info "Running in DRY RUN mode - no permanent changes"
        log_warning "Use --apply flag to actually replace the main branch"
    fi
    
    log_info "Syncing template: $template_name"
    
    # Verify test-app exists and contains the generated template
    if [ ! -d "$test_app_dir" ]; then
        log_error "test-app directory not found at $test_app_dir"
        return 1
    fi
    
    # Create temporary directory for the repo
    mkdir -p "$temp_dir"
    
    # Clone the template repository
    log_info "Cloning $repo_url"
    if ! git clone "$repo_url" "$temp_dir" 2>/dev/null; then
        log_error "Failed to clone $repo_url - repository may not exist or authentication failed"
        rm -rf "$temp_dir"
        return 1
    fi
    
    cd "$temp_dir"
    
    # Create a new orphan branch
    log_info "Creating new orphan branch: $branch_name"
    git checkout --orphan "$branch_name"
    git rm -rf . 2>/dev/null || true
    
    # Copy files from test-app to the repo
    log_info "Copying files from $test_app_dir"
    
    # Get the absolute path of test-app directory
    test_app_abs_path=$(cd "$(dirname "$0")/$test_app_dir" && pwd)
    
    # Copy all files and directories from test-app
    cp -r "$test_app_abs_path/"* . 2>/dev/null || true
    cp -r "$test_app_abs_path/".* . 2>/dev/null || true
    
    # Add all files
    git add .
    
    # Check if there are any changes
    if git diff --cached --quiet; then
        log_warning "No changes detected for $template_name"
        cd /
        rm -rf "$temp_dir"
        return 0
    fi
    
    # Commit the changes
    log_info "Committing changes"
    git -c user.name="GitHub Actions" -c user.email="actions@github.com" \
        commit -m "Sync template from pikku release

This template was automatically generated and synced from the main pikku repository.

Generated on: $(date -u '+%Y-%m-%d %H:%M:%S UTC')
From commit: ${GITHUB_SHA:-unknown}"
    
    # Push the new branch
    log_info "Pushing branch: $branch_name"
    git push origin "$branch_name"
    
    if [ "$apply_changes" = "--apply" ]; then
        # Delete the old main/master branch if it exists and push new main
        if git ls-remote --exit-code --heads origin main >/dev/null 2>&1; then
            log_info "Deleting remote main branch"
            git push origin --delete main
        elif git ls-remote --exit-code --heads origin master >/dev/null 2>&1; then
            log_info "Deleting remote master branch"  
            git push origin --delete master
        fi
        
        # Push the new branch as main
        log_info "Pushing $branch_name as main"
        git push origin "$branch_name:main"
        
        log_success "Successfully replaced main branch for template: $template_name"
    else
        log_info "Dry run complete. New branch '$branch_name' created with updated content"
        log_warning "To apply changes, run: $0 $template_name --apply"
    fi
    
    # Clean up
    cd /
    rm -rf "$temp_dir"
    
    return 0
}

# Main execution
main() {
    # Change to the pikku directory (where this script should be run from)
    cd "$(dirname "$0")/.."
    
    if sync_template "$TEMPLATE_NAME" "$APPLY_CHANGES"; then
        if [ "$APPLY_CHANGES" = "--apply" ]; then
            log_success "Template $TEMPLATE_NAME successfully synced and applied!"
        else
            log_success "Dry run completed for template $TEMPLATE_NAME"
        fi
    else
        log_error "Failed to sync template: $TEMPLATE_NAME"
        exit 1
    fi
}

# Run main function
main "$@"