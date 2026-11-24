package analyze

import (
	"slices"
	"testing"
)

// projectServicesRead is what the project's pikkuServices factory destructures
// from its second parameter; a parameter that is not a destructuring pattern
// records nothing.
func TestProjectServicesRead(t *testing.T) {
	cases := []struct {
		name, factory string
		want          []string
	}{
		{"destructured", "pikkuServices(async (config, { nats }) => ({ queue: nats }))", []string{"nats"}},
		{"sorted unique, renamed, rest skipped", "pikkuServices(async (config, { nats, db: conn, nats: again, ...others }) => ({}))", []string{"db", "nats"}},
		{"no second parameter", "pikkuServices(async (config) => ({}))", nil},
		{"plain identifier", "pikkuServices(async (config, existingServices) => ({ ...existingServices }))", nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			res := inspectFiles(t, map[string][]string{"services.ts": {
				"import { pikkuServices } from '#pikku'",
				"export const createSingletonServices = " + c.factory,
			}}, false)
			got := []string(res.State.ProjectServicesRead)
			if !slices.Equal(got, c.want) {
				t.Errorf("projectServicesRead = %v, want %v", got, c.want)
			}
		})
	}
}
