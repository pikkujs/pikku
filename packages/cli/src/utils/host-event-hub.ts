// Host code, not an app function: `pikku dev` and `pikku serve` own the process,
// so they install the event hub distributor. The inspector refuses this import
// path in function files (PKU957); this file is listed in `ignoreFiles` of the
// CLI's own pikku.config.json so the CLI's project is not inspected for it.
export { installEventHubDistributor } from '@pikku/core/internal/event-hub'
