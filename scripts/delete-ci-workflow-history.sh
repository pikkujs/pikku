username="$1"
reponame="$2"
limit="$3"

if [[ -z "$username" || -z "$reponame" ]]; then
    echo "Usage: delete_workflow_runs <username> <reponame> [limit]"
    exit 1
fi

echo "Fetching workflow runs for $username/$reponame (excluding main branch)..."

# Fetch workflow runs and filter out main branch runs
runs=$(gh api /repos/"$username"/"$reponame"/actions/runs --paginate | jq -r '.workflow_runs[] | select(.head_branch != "main") | .id')

if [[ -z "$runs" ]]; then
    echo "No workflow runs found (excluding main branch)."
    exit 0
fi

# Convert runs to array
runs_array=($runs)
total_runs=${#runs_array[@]}

if [[ -n "$limit" ]]; then
    echo "Found $total_runs workflow runs. Deleting up to $limit runs..."
    delete_count=$limit
else
    echo "Found $total_runs workflow runs. Deleting all..."
    delete_count=$total_runs
fi

deleted=0
for run_id in "${runs_array[@]}"; do
    if [[ $deleted -ge $delete_count ]]; then
        break
    fi

    echo "Deleting workflow run ID $run_id ($((deleted + 1))/$delete_count)"
    gh api -X DELETE /repos/"$username"/"$reponame"/actions/runs/"$run_id"
    ((deleted++))
done

echo "Deleted $deleted workflow runs (kept main branch runs)."
