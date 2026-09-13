export class TrackerService {
  constructor() {}

  async track(event: string, properties: Record<string, any>): Promise<void> {
    console.log(`[TrackerService] Tracking event: ${event}`, properties)
  }
}
