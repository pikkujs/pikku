export class CorePikkuRouteHandler {
  private subscriptions = new Map<string, Set<(data: unknown) => void>>()

  constructor(
    private route: string,
    private sendData: (data: string) => void
  ) {}

  public subscribe(
    method: string | number | symbol,
    callback: (data: any) => void
  ) {
    const method2 = method.toString()
    const subs = this.subscriptions.get(method2) || new Set()
    subs.add(callback)
    this.subscriptions.set(method2, subs)
  }

  public unsubscribe(
    method?: string | number | symbol,
    callback?: (data: any) => void
  ) {
    const method2 = method?.toString()
    if (!method2 && !callback) {
      this.subscriptions.clear()
    } else if (method2 && !callback) {
      this.subscriptions.delete(method2)
    } else if (method2 && callback) {
      const subs = this.subscriptions.get(method2)
      subs?.delete(callback)
    }
  }

  public send(method: string | number | symbol, data: any) {
    const method2 = method.toString()
    this.sendData(
      JSON.stringify({
        [this.route]: method2,
        ...data,
      })
    )
  }

  /**
   * This is in an internal function that is called when a message is received.
   *
   * @ignore
   */
  public _handleMessage(method: string | number | symbol, data: any) {
    const method2 = method.toString()
    const subs = this.subscriptions.get(method2)
    if (subs) {
      subs.forEach((sub) => sub(data))
    }
  }
}
