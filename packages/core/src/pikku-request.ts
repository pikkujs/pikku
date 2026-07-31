/**
 * @group RequestResponse
 */
export abstract class PikkuRequest<In = any> {
  #data: In | undefined

  constructor(data: In) {
    this.#data = data
  }

  public async data(): Promise<In> {
    if (this.#data === undefined) {
      throw new Error('Data not found')
    }
    return this.#data
  }
}
