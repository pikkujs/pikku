import {
  WorkspaceFileNotFoundError,
  WorkspacePathError,
} from '@pikku/code-edit/files'
import { BadRequestError, NotFoundError } from '#pikku/addon/error'

/** Maps a files service failure onto the matching pikku error. */
export const toWorkspaceError = (error: unknown): unknown => {
  if (error instanceof WorkspaceFileNotFoundError)
    return new NotFoundError(error.message)
  if (error instanceof WorkspacePathError)
    return new BadRequestError(error.message)
  return error
}
