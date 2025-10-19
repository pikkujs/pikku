export class AnalyticsService {
  constructor() {}

  async track(event: string, properties: Record<string, any>): Promise<void> {
    console.log(`[AnalyticsService] Tracking event: ${event}`, properties)
  }
}
