import { useState, useCallback, useRef } from 'react'

export type PendingFile = {
  id: string
  name: string
  mimeType: string
  previewUrl: string
  contentUrl: string
  isImage: boolean
}

export type UploadAttachmentFn = (args: {
  contentType: string
  sizeBytes: number
}) => Promise<{
  uploadUrl: string
  signedReadUrl: string
  uploadMethod?: string
}>

export const INLINE_SIZE_LIMIT = 1 * 1024 * 1024

export function useFileAttachment(upload: UploadAttachmentFn) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? [])
      e.target.value = ''
      if (!files.length) return
      setUploading(true)
      setUploadError(null)
      try {
        for (const file of files) {
          const previewUrl = URL.createObjectURL(file)
          let contentUrl: string

          if (
            file.type.startsWith('image/') &&
            file.size <= INLINE_SIZE_LIMIT
          ) {
            contentUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = (ev) => resolve(ev.target!.result as string)
              reader.onerror = reject
              reader.readAsDataURL(file)
            })
          } else {
            const { uploadUrl, signedReadUrl, uploadMethod } = await upload({
              contentType: file.type,
              sizeBytes: file.size,
            })
            const resp = await fetch(uploadUrl, {
              method: uploadMethod ?? 'PUT',
              body: file,
              headers: { 'Content-Type': file.type },
            })
            if (!resp.ok) throw new Error(`Upload failed (${resp.status})`)
            contentUrl = signedReadUrl
          }

          setPendingFiles((prev) => [
            ...prev,
            {
              id: `file_${Date.now().toString(36)}`,
              name: file.name,
              mimeType: file.type,
              previewUrl,
              contentUrl,
              isImage: file.type.startsWith('image/'),
            },
          ])
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
      }
    },
    [upload]
  )

  const removeFile = useCallback((id: string) => {
    setPendingFiles((prev) => {
      const f = prev.find((x) => x.id === id)
      if (f) URL.revokeObjectURL(f.previewUrl)
      return prev.filter((x) => x.id !== id)
    })
  }, [])

  const clearFiles = useCallback(() => {
    setPendingFiles((prev) => {
      prev.forEach((f) => URL.revokeObjectURL(f.previewUrl))
      return []
    })
  }, [])

  return {
    pendingFiles,
    uploading,
    uploadError,
    fileInputRef,
    handleFileChange,
    removeFile,
    clearFiles,
  }
}
