/**
 * @deprecated Cucumber is no longer how Pikku projects write end-to-end tests.
 * `pikkuScenario` / `pikkuScenarioStep` replace it: steps are ordinary typed
 * Pikku functions, results thread through as locals instead of World state, and
 * `pikku scenario run` drives them against any configured environment rather
 * than only localhost. This package stays published so existing suites keep
 * building, but it receives no new features.
 */
export { PersonaData } from './persona-data.js'
export { StubTracker, createStubProxy } from './tracker.js'
export { createDbUtils, type DbUtils } from './db.js'
