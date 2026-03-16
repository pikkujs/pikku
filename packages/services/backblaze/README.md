# @pikku/backblaze

Backblaze B2 storage implementation of Pikku's `ContentService` interface.

## Installation

```bash
npm install @pikku/backblaze backblaze-b2
```

## Usage

```typescript
import { B2Content } from '@pikku/backblaze'

const content = new B2Content(
  {
    applicationKeyId: 'your-key-id',
    applicationKey: 'your-app-key',
    bucketId: 'your-bucket-id',
  },
  logger
)

// Upload a file
await content.writeFile('path/to/file.txt', stream)

// Read a file
const buffer = await content.readFileAsBuffer('path/to/file.txt')

// Get upload URL with headers for direct client upload
const { uploadUrl, assetKey, uploadHeaders, uploadMethod } =
  await content.getUploadURL('file.txt', 'text/plain')
```
