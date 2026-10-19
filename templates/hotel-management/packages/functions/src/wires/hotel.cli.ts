import { wireCLI, pikkuCLICommand } from '#pikku/cli/pikku-cli-types.gen.js'
import { listRooms } from '../functions/list-rooms.function.js'
import { sweepNoShows } from '../functions/sweep-no-shows.function.js'

/**
 * The same functions the HTTP routes and MCP tools call.
 *
 * A night manager running `hotel no-shows` by hand and the 04:00 scheduler run
 * the identical function, so there is no "the script does it slightly
 * differently" drift to discover at 4am.
 */
// @snippet start wireCli
wireCLI({
  program: 'hotel',
  commands: {
    rooms: pikkuCLICommand({
      description: 'List rooms and their housekeeping status',
      func: listRooms,
    }),
    'no-shows': pikkuCLICommand({
      description: 'Mark yesterday’s unarrived bookings as no-shows',
      func: sweepNoShows,
    }),
  },
})
// @snippet end wireCli
