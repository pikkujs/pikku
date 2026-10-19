/**
 * Every callable function this template owns, exercised once.
 *
 * The journey scenario proves a receptionist can do their job. This one proves
 * nothing is *unreached* — the question that went unasked while `reserveStay`
 * sat with a deposit charge, a confirmation and a guest notification that no
 * caller ever started.
 *
 * The MCP tools are called over MCP, not over RPC. Their names are in the RPC
 * type union, so `scenario.do('listRoomsTool', …)` compiles and then fails with
 * RPCNotFoundError at runtime — the RPC runtime serves only `expose: true`.
 * `callsMcpTool` goes through the mounted `/api/mcp` transport instead, which
 * is the only way an agent could reach them either.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenarios'

export const everyFunctionRuns = pikkuScenario<void, { checked: number }>({
  title: 'Every callable function runs',
  description: 'Invokes each callable function once, so an uncallable one fails loudly',
  tags: ['scenario', 'coverage'],
  func: async ({ logger }, _data, { scenario, actors }) => {
    if (!actors?.rafa) {
      throw new Error('needs the `rafa` actor — run via `pikku scenario run <environment>`')
    }

    const session = await scenario.do('reads the session', 'getSession', {}, { actor: actors.rafa })

    const rooms = await scenario.do('lists the board', 'listRooms', {}, { actor: actors.rafa })
    if (rooms.rooms.length === 0) throw new Error('the seed should leave rooms')

    await scenario.do('lists arrivals', 'listArrivals', {}, { actor: actors.rafa })

    const today = new Date().toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    const booking = await scenario.do(
      'takes a booking',
      'createBooking',
      { roomTypeId: 'rt_double', arrival: today, departure: tomorrow, guests: 2 },
      { actor: actors.rafa },
    )

    // Through the starter, not the workflow: a workflow invoked over plain RPC
    // gets no workflow context and dies on `workflow.do`.
    //
    // `checkIn` is not called here. The starter returns a runId immediately and
    // the confirmation happens asynchronously, so checking in straight after
    // races the workflow. The browser journey checks a guest in through the UI,
    // which is the better proof of it anyway.
    await scenario.do(
      'runs the reservation workflow',
      'startReservation',
      { bookingId: booking.bookingId },
      { actor: actors.rafa },
    )



    // The housekeeping board. Reading it as the receptionist on purpose: the
    // front desk holds `housekeeping:read` and needs to know when a room will
    // be ready, so if this ever starts requiring `housekeeping:complete` the
    // desk loses the board and this catches it.
    const tasks = await scenario.do(
      'lists the housekeeping board',
      'listHousekeepingTasks',
      {},
      { actor: actors.rafa },
    )

    // As the housekeeper, not the receptionist. `rafa` holds
    // `housekeeping:read` and not `housekeeping:complete`, so this returned 403
    // — the authorization model working exactly as designed, and worth keeping
    // that way rather than widening a scope to make a test pass.
    //
    // The id comes from the list now rather than being the seeded `hk_1`. A
    // test that has to know an id the app cannot show it is a test proving
    // something no user can do.
    // Top level, not inside the `if`. The scenario DSL is extracted from the
    // AST and a declaration inside a block is not recorded, so the whole
    // scenario silently becomes an empty one (PKU679).
    const outstanding = tasks.tasks[0]
    if (!outstanding) {
      throw new Error('the seed should leave an outstanding housekeeping task')
    }

    if (actors.priya) {
      await scenario.do(
        'completes a housekeeping task',
        'completeHousekeepingTask',
        { taskId: outstanding.taskId },
        { actor: actors.priya },
      )
    }

    await scenario.do(
      'queues a turnover',
      'scheduleTurnover',
      { roomId: rooms.rooms[0]!.roomId, priority: 'normal' },
      { actor: actors.rafa },
    )

    await scenario.do('sweeps no-shows', 'sweepNoShows', null, { actor: actors.rafa })



    // The scheduled sweep that replaced the setInterval poller. It fires the
    // trigger handler for each row it finds, so this covers both.
    await scenario.do('runs the scheduled sweep', 'sweepDueArrivals', null, { actor: actors.rafa })

    // The MCP tools, called over the mounted transport as a signed-in actor.
    //
    // Both `rpc.invoke` a session-requiring function, so until MCP carried the
    // caller's request these came back "ForbiddenError: Authentication
    // required" — the browser sent its cookie and the transport discarded it.
    // The fetch handler now wraps the incoming Request and the runner puts it
    // on the wire, so the app's own middleware sets the session and the same
    // scopes a receptionist has apply to an agent.
    await scenario.then(
      'calls listRoomsTool',
      'callsMcpTool',
      { tool: 'listRoomsTool', args: '{}' },
      { actor: actors.rafa },
    )
    await scenario.then(
      'calls checkInTool',
      'callsMcpTool',
      { tool: 'checkInTool', args: '{\"bookingId\":\"bk_probe\"}' },
      { actor: actors.rafa },
    )

    logger.info({ event: 'coverage_pass', user: session.email, booking: booking.bookingId })
    return { checked: 12 }
  },
})

export const coverageFeature = pikkuFeature({
  name: 'Coverage',
  description: 'Every callable function runs at least once',
  tags: ['coverage'],
  scenarios: [everyFunctionRuns],
})
