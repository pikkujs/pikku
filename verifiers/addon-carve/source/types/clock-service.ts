// A second user-defined (non-core) service type, used to prove multiple
// services carve together.
export interface ClockService {
  now(): Date
}
