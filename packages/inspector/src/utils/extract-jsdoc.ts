import * as ts from 'typescript'

export interface ExtractedJSDocMeta {
  summary?: string
  description?: string
  errors?: string[]
}

/**
 * Extracts JSDoc metadata from a TypeScript node.
 * Looks for @summary, @description, and @errors tags in JSDoc comments.
 *
 * @param node - The TypeScript node to extract JSDoc from
 * @returns Extracted JSDoc metadata or null if no JSDoc found
 */
export function extractJSDocMeta(node: ts.Node): ExtractedJSDocMeta | null {
  // Get JSDoc tags using TypeScript's built-in utilities
  const jsDocTags = ts.getJSDocTags(node)

  if (!jsDocTags || jsDocTags.length === 0) {
    return null
  }

  const result: ExtractedJSDocMeta = {}

  for (const tag of jsDocTags) {
    const tagName = tag.tagName.text
    const comment = getJSDocCommentText(tag)

    if (!comment) continue

    switch (tagName) {
      case 'summary':
        result.summary = comment
        break
      case 'description':
        result.description = comment
        break
      case 'errors':
        result.errors = parseErrorList(comment)
        break
    }
  }

  return Object.keys(result).length > 0 ? result : null
}

/**
 * Gets the comment text from a JSDoc tag.
 * Handles both string comments and NodeArray comments.
 */
function getJSDocCommentText(tag: ts.JSDocTag): string | undefined {
  if (!tag.comment) return undefined

  if (typeof tag.comment === 'string') {
    return tag.comment.trim()
  }

  // Handle NodeArray of JSDocComment nodes
  if (Array.isArray(tag.comment)) {
    return tag.comment
      .map((node) => {
        // Type guard for JSDocText nodes
        if ('text' in node && typeof node.text === 'string') {
          return node.text
        }
        return node.getText()
      })
      .join('')
      .trim()
  }

  return undefined
}

/**
 * Parses a comma-separated or space-separated list of error class names.
 * Filters to only include valid class names (starting with uppercase).
 *
 * @param text - The error list text from @errors tag
 * @returns Array of error class names
 */
function parseErrorList(text: string): string[] {
  return text
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s && /^[A-Z]/.test(s)) // Class names start with uppercase
}
