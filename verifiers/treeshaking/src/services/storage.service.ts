export class StorageService {
  constructor() {}

  async save(key: string, value: any): Promise<void> {
    console.log(`[StorageService] Saving ${key}:`, value)
  }

  async get(key: string): Promise<any> {
    console.log(`[StorageService] Getting ${key}`)
    return null
  }
}
