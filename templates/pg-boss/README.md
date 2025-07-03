# Pikku pg-boss Queue Template

This template demonstrates how to use pg-boss as a queue system with Pikku. pg-boss is a PostgreSQL-based job queue for Node.js applications.

## Setup

1. **PostgreSQL Database**: Ensure you have a PostgreSQL database running and accessible.

2. **Environment Variables**: Set the `DATABASE_URL` environment variable:

   ```bash
   export DATABASE_URL="postgres://user:password@localhost:5432/your_database"
   ```

3. **Install Dependencies**:
   ```bash
   npm install
   # or
   yarn install
   ```

## Running

### Development

```bash
npm run dev
```

### Production

```bash
npm run start
```

## Features

- **PostgreSQL-based**: Uses PostgreSQL as the storage backend for reliability
- **Job Results**: Full support for job results and status tracking
- **Retries**: Built-in retry mechanism with configurable limits
- **Batch Processing**: Support for processing multiple jobs in parallel
- **Graceful Shutdown**: Proper cleanup when the process terminates

## Configuration

The template uses the pg-boss configuration mapping to handle worker settings:

### Supported Configurations

- `batchSize`: Number of jobs to process in parallel
- `pollInterval`: How often to poll for new jobs (in milliseconds)

### Unsupported Configurations

- `name`: Worker names are not supported (pg-boss uses queue names)
- `autorun`: Always enabled in pg-boss
- `lockDuration`: Managed by pg-boss internally
- `visibilityTimeout`: Not applicable (pg-boss uses PostgreSQL locks)

## Database Schema

pg-boss automatically creates the necessary database tables when it starts. No manual schema setup is required.

## Example Queue Functions

The template works with queue functions defined in the `functions` template. Make sure your queue processors are properly defined in your Pikku application.
