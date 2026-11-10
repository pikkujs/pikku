import type { ContentService } from '@pikku/core/services'

// What `.pikku/backends/<name>/content-buckets.gen.ts` exports for a backend
// whose `content.buckets` is ["photos", "docs"], and for one with none.
type ContentBucket = 'photos' | 'docs'
type NoBuckets = never

const _assertions = (
  content: ContentService<ContentBucket>,
  closed: ContentService<NoBuckets>
) => {
  // A listed bucket passes.
  void content.getUploadURL({
    bucket: 'photos',
    fileKey: 'a.png',
    contentType: 'image/png',
  })
  void content.listFilesByPrefix('docs', 'x')

  // An unlisted bucket is a type error, on every method that takes one.
  void content.getUploadURL({
    // @ts-expect-error 'videos' is not one of this backend's buckets
    bucket: 'videos',
    fileKey: 'a.mp4',
    contentType: 'video/mp4',
  })
  // @ts-expect-error 'videos' is not one of this backend's buckets
  void content.listFilesByPrefix('videos', 'x')
  // @ts-expect-error a plain string widens past the listed buckets
  void content.deleteFile({ bucket: 'x' as string, key: 'k' })

  // A backend with no buckets cannot name any.
  // @ts-expect-error no bucket is allowed
  void closed.listFilesByPrefix('photos', 'x')
}
void _assertions
