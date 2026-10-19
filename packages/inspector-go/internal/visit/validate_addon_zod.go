package visit

import (
	"regexp"
	"sort"
	"strings"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/typesmap"
)

// Port of utils/validate-addon-zod-contract.ts.

var pikkuCorePathRe = regexp.MustCompile(`[\\/]@pikku[\\/]core[\\/]|[\\/]packages[\\/]core[\\/]`)

func namedSourceTypes(tm *typesmap.TypesMap, names []string) []string {
	found := map[string]bool{}
	var visit func(name string, seen map[string]bool)
	visit = func(name string, seen map[string]bool) {
		if seen[name] {
			return
		}
		seen[name] = true
		if custom, ok := tm.CustomType(name); ok {
			for _, ref := range custom.References {
				visit(ref, seen)
			}
			return
		}
		meta, err := tm.GetTypeMeta(name)
		if err != nil {
			return
		}
		if meta.Path != nil && *meta.Path != "" && !pikkuCorePathRe.MatchString(*meta.Path) {
			found[meta.OriginalName] = true
		}
	}
	for _, name := range names {
		visit(name, map[string]bool{})
	}
	out := make([]string, 0, len(found))
	for n := range found {
		out = append(out, n)
	}
	sort.Strings(out)
	return out
}

type addonContractTypeSource struct {
	name                            string
	usesGenerics                    bool
	hasInputSchema, hasOutputSchema bool
	inputNames, outputNames         []string
}

func addonZodContractViolation(tm *typesmap.TypesMap, fn addonContractTypeSource) string {
	var problems []string
	if fn.usesGenerics {
		problems = append(problems, "declares its input/output with TypeScript generics")
	}
	var named []string
	if !fn.hasInputSchema {
		named = append(named, namedSourceTypes(tm, fn.inputNames)...)
	}
	if !fn.hasOutputSchema {
		named = append(named, namedSourceTypes(tm, fn.outputNames)...)
	}
	if len(named) > 0 {
		var uniq []string
		seen := map[string]bool{}
		for _, n := range named {
			if !seen[n] {
				seen[n] = true
				uniq = append(uniq, n)
			}
		}
		problems = append(problems, "types its input/output with named source types ("+strings.Join(uniq, ", ")+")")
	}
	if len(problems) == 0 {
		return ""
	}
	return "Addon function '" + fn.name + "' is remote: true but " + strings.Join(problems, " and ") + ". " +
		"A remote addon's contract ships as a types-only SDK, so its input and output must be zod schemas: " +
		"declare `input: z.object({...})` and `output: z.object({...})` on the function and drop the generics. " +
		"TypeScript types would make the SDK import from the addon's src/, which the consumer does not have."
}
