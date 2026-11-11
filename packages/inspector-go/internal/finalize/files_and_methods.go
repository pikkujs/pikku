package finalize

import (
	"encoding/json"
	"fmt"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
)

// Port of utils/get-files-and-methods.ts.

// TypesOptions is InspectorOptions.types.
type TypesOptions struct {
	ConfigFileType               string `json:"configFileType"`
	UserSessionType              string `json:"userSessionType"`
	SingletonServicesFactoryType string `json:"singletonServicesFactoryType"`
	WireServicesFactoryType      string `json:"wireServicesFactoryType"`
}

func getMetaTypes(typ string, m *state.PathToNameAndType, desired string, errs *state.Map[state.PathToNameAndType]) (state.Raw, error) {
	if desired != "" {
		for _, file := range m.Keys() {
			for _, e := range m.At(file) {
				if e.Type == nil || *e.Type != desired {
					continue
				}
				if e.TypePath == nil {
					return nil, fmt.Errorf("Unknown state due to metaType calculation: entryType or typePath is null for %s in %s", desired, file)
				}
				return ToRaw(Obj("file", file, "variable", e.Variable, "type", *e.Type, "typePath", *e.TypePath)), nil
			}
		}
		if errs != nil {
			errs.Set(fmt.Sprintf("No %s found that extends %s", desired, typ), *m)
		}
		return nil, nil
	}

	total := 0
	for _, file := range m.Keys() {
		total += len(m.At(file))
	}
	switch {
	case total == 0:
		msg := "No " + typ + " found"
		if typ == "CoreConfig" {
			msg = "No " + typ + " found. Make sure you have exported a createConfig function in your codebase:\n\n" +
				"export const createConfig = pikkuConfig(async () => {\n" +
				"  return {}\n" +
				"})\n\n" +
				"Possible issues:\n" +
				"- srcDirectories in pikku.config.json doesn't include the file with the createConfig method"
		}
		if errs != nil {
			errs.Set(msg, *m)
		}
	case total > 1:
		if errs != nil {
			errs.Set("More than one "+typ+" found", *m)
		}
	default:
		keys := m.Keys()
		if len(keys) == 0 {
			return nil, nil
		}
		file := keys[0]
		entries := m.At(file)
		if len(entries) == 0 {
			// TS destructures `[{...}]` from an empty array and throws.
			return nil, fmt.Errorf("Cannot destructure an empty entry list for %s in %s", typ, file)
		}
		e := entries[0]
		if e.Type == nil || e.TypePath == nil {
			return nil, fmt.Errorf("Unknown state due to metaType calculation: entryType or typePath is null for %s in %s", typ, file)
		}
		return ToRaw(Obj("file", file, "type", *e.Type, "variable", e.Variable, "typePath", *e.TypePath)), nil
	}
	return nil, nil
}

// GetFilesAndMethods ports getFilesAndMethods and stores the result and
// errors on state (state.filesAndMethods / filesAndMethodsErrors).
func GetFilesAndMethods(st *state.State, types json.RawMessage) error {
	var opts TypesOptions
	if len(types) > 0 {
		if err := json.Unmarshal(types, &opts); err != nil {
			return fmt.Errorf("types: %w", err)
		}
	}
	errs := state.Map[state.PathToNameAndType]{}
	result := state.Record[state.Raw]{}
	for _, f := range []struct {
		key, typ, desired string
		m                 *state.PathToNameAndType
		noErrors          bool
	}{
		{"userSessionType", "CoreUserSession", opts.UserSessionType, &st.UserSessionTypeImportMap, false},
		{"singletonServicesType", "CoreSingletonServices", "", &st.SingletonServicesTypeImportMap, false},
		{"wireServicesType", "CoreServices", "", &st.WireServicesTypeImportMap, false},
		{"pikkuConfigType", "CoreConfig", "", &st.ConfigTypeImportMap, false},
		{"pikkuConfigFactory", "CoreConfig", opts.ConfigFileType, &st.ConfigFactories, false},
		{"singletonServicesFactory", "CreateSingletonServices", opts.SingletonServicesFactoryType, &st.SingletonServicesFactories, false},
		{"wireServicesFactory", "CreateWireServices", opts.WireServicesFactoryType, &st.WireServicesFactories, false},
		{"serverLifecycleFactory", "ServerLifecycle", "", &st.ServerLifecycleFactories, true},
	} {
		e := &errs
		if f.noErrors {
			e = nil
		}
		meta, err := getMetaTypes(f.typ, f.m, f.desired, e)
		if err != nil {
			return err
		}
		if meta != nil {
			result.Set(f.key, meta)
		}
	}
	st.FilesAndMethods = result
	st.FilesAndMethodsErrors = errs
	return nil
}
