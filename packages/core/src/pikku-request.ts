/**
 * Simplest class to represent a pikku request.
 * @template In - The type of the request body.
 * @group RequestResponse
 */
export abstract class PikkuRequest<In = any> {
  #data: In | undefined

  constructor(data: In) {
    this.#data = data
  }

  /**
   * Retrieves the data
   * @returns A promise that resolves to an object containing the combined data.
   */
  public async data(): Promise<In> {
    if (!this.#data) {
      throw new Error('Data not found')
    }
    return this.#data
  }
}
