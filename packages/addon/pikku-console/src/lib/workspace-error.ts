import {
  WorkspaceFileNotFoundError,
  WorkspacePathError,
} from '@pikku/code-edit/files'
import { GitCommandError } from '@pikku/code-edit/git'
import { BadRequestError, NotFoundError } from '#pikku/addon/error'

/** Maps a files/git service failure onto the matching pikku error. */
export const toWorkspaceError = (error: unknown): unknown => {
  if (error instanceof WorkspaceFileNotFoundError)
    return new NotFoundError(error.message)
  if (error instanceof WorkspacePathError || error instanceof GitCommandError)
    return new BadRequestError(error.message)
  return error
}
