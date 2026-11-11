package analyze

import (
	"strings"
	"testing"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
)

// The cases of packages/inspector/src/add/add-file-with-factory.test.ts
// (PKU564): a factory call inside a cast (`as`, `<T>`, `!`) fails the build,
// naming the export and its line, and is not registered. `satisfies` and
// parentheses are read through: the factory registers as if direct.

func hiddenFactories(t *testing.T, lines ...string) ([]string, int) {
	t.Helper()
	res := inspectFiles(t, map[string][]string{"services.ts": lines}, false)
	var out []string
	for _, d := range res.Diagnostics {
		if d.Code == diag.FactoryNotADirectCall {
			out = append(out, d.Message)
		}
	}
	st := res.State
	registered := len(st.SingletonServicesFactories.Keys()) + len(st.WireServicesFactories.Keys()) +
		len(st.ConfigFactories.Keys()) + len(st.ServerLifecycleFactories.Keys())
	return out, registered
}

func TestHiddenFactoryFormsArePKU564(t *testing.T) {
	cases := []struct {
		name, wrapper, initializer, form, remove string
	}{
		{"as unknown as", "pikkuAddonServices", "pikkuAddonServices(async () => ({ noop: 1 })) as unknown as CreateSingletonServices", "an `as` cast", "the cast"},
		{"as", "pikkuServices", "pikkuServices(async () => ({})) as any", "an `as` cast", "the cast"},
		{"angle-bracket", "pikkuWireServices", "<any>pikkuWireServices(async () => ({}))", "a `<T>` cast", "the cast"},
		{"non-null", "pikkuAddonWireServices", "pikkuAddonWireServices(async () => ({}))!", "a non-null assertion (`!`)", "the `!`"},
		{"cast in parentheses", "pikkuAddonConfig", "(pikkuAddonConfig(async () => ({})) as any)", "an `as` cast", "the cast"},
		{"cast under satisfies", "pikkuConfig", "pikkuConfig(async () => ({}))! satisfies unknown", "a non-null assertion (`!`)", "the `!`"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, registered := hiddenFactories(t,
				"import { "+c.wrapper+" } from '#pikku'",
				"type CreateSingletonServices = unknown",
				"",
				"export const factory = "+c.initializer,
			)
			want := "'factory' at services.ts:4 wraps " + c.wrapper + "(...) in " + c.form + ". " +
				"The inspector reads a factory only from a direct " + c.wrapper + "(...) call, so this one would not be registered and nothing it provides would exist at runtime. " +
				"Remove " + c.remove + ", and fix the type mismatch it hides in the factory itself."
			if len(got) != 1 || got[0] != want {
				t.Errorf("PKU564 = %q\nwant  %q", got, want)
			}
			if registered != 0 {
				t.Errorf("%d factories registered, want 0", registered)
			}
		})
	}
}

func TestDirectFactoryIsNotPKU564(t *testing.T) {
	got, registered := hiddenFactories(t,
		"import { pikkuServices } from '#pikku'",
		"declare const other: () => unknown",
		"export const createSingletonServices = pikkuServices(",
		"  async () => ({ schema: {} as any })",
		")",
		"export const notAFactory = other() as any",
	)
	if len(got) != 0 {
		t.Errorf("PKU564 = %s", strings.Join(got, "\n"))
	}
	if registered != 1 {
		t.Errorf("%d factories registered, want 1", registered)
	}
}

func TestSatisfiesAndParenthesesAreReadThrough(t *testing.T) {
	cases := []struct{ name, wrapper, initializer string }{
		{"satisfies", "pikkuConfig", "pikkuConfig(async () => ({})) satisfies unknown"},
		{"parentheses", "pikkuServerLifecycle", "(pikkuServerLifecycle({}))"},
		{"parentheses around satisfies", "pikkuWireServices", "(pikkuWireServices(async ({ logger }) => ({})) satisfies unknown)"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, registered := hiddenFactories(t,
				"import { "+c.wrapper+" } from '#pikku'",
				"export const factory = "+c.initializer,
			)
			if len(got) != 0 {
				t.Errorf("PKU564 = %s", strings.Join(got, "\n"))
			}
			if registered != 1 {
				t.Errorf("%d factories registered, want 1", registered)
			}
		})
	}
}

func TestAddonFactoryUnderSatisfiesKeepsItsContract(t *testing.T) {
	res := inspectFiles(t, map[string][]string{"services.ts": {
		"import { pikkuAddonServices } from '#pikku'",
		"export const createSingletonServices = pikkuAddonServices(",
		"  async (_config, { logger }) => ({ noop: logger })",
		") satisfies unknown",
	}}, false)
	st := res.State
	if !st.AddonServicesFactorySeen {
		t.Errorf("addon services factory not seen")
	}
	if strings.Join(st.AddonRequiredParentServices, ",") != "logger" {
		t.Errorf("required parent services = %v, want [logger]", st.AddonRequiredParentServices)
	}
	if strings.Join(st.AddonCreatedServices, ",") != "noop" {
		t.Errorf("created services = %v, want [noop]", st.AddonCreatedServices)
	}
}
