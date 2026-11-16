import { createEventHubDistributor } from '@pikku/core/internal/event-hub'

export const rogue = () => createEventHubDistributor({ topics: () => ['x'] })
