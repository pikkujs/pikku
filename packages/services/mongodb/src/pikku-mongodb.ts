import type { Logger } from '@pikku/core/services'
import { MongoClient, type MongoClientOptions, type Db } from 'mongodb'

export class PikkuMongoDB {
  public db: Db
  private client: MongoClient
  private ownsConnection: boolean

  constructor(
    private logger: Logger,
    clientOrUri: MongoClient | string,
    private dbName: string,
    options?: MongoClientOptions
  ) {
    if (typeof clientOrUri === 'string') {
      this.client = new MongoClient(clientOrUri, options)
      this.ownsConnection = true
    } else {
      this.client = clientOrUri
      this.ownsConnection = false
    }
    this.db = this.client.db(dbName)
  }

  public async init() {
    this.logger.info(`Connecting to MongoDB database: ${this.dbName}`)
    try {
      await this.client.db('admin').command({ ping: 1 })
      this.logger.info('MongoDB connection successful')
    } catch (error) {
      this.logger.error('Error connecting to MongoDB', error)
      process.exit(1)
    }
  }

  public async close() {
    if (this.ownsConnection) {
      await this.client.close()
    }
  }
}
