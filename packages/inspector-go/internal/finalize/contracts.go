package finalize

import (
	"fmt"
	"math"
	"strconv"

	"github.com/pikkujs/pikku/packages/inspector-go/internal/diag"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/state"
	"github.com/pikkujs/pikku/packages/inspector-go/internal/typesmap"
)

// Port of utils/contract-hashes.ts.

// ContractEntry is one function's contract.
type ContractEntry struct {
	FunctionKey  string
	Version      int
	ContractHash string
	InputHash    string
	OutputHash   string
}

// Contracts is the TS `Map<funcId, ContractEntry>`, in insertion order.
type Contracts struct {
	ids     []string
	entries map[string]*ContractEntry
}

func (c *Contracts) set(id string, e *ContractEntry) {
	if c.entries == nil {
		c.entries = map[string]*ContractEntry{}
	}
	if _, ok := c.entries[id]; !ok {
		c.ids = append(c.ids, id)
	}
	c.entries[id] = e
}

// Len is the number of contracts.
func (c *Contracts) Len() int { return len(c.ids) }

// Get returns the contract for a function id.
func (c *Contracts) Get(id string) *ContractEntry { return c.entries[id] }

// IDs returns the function ids in insertion order.
func (c *Contracts) IDs() []string { return append([]string(nil), c.ids...) }

// parseVersionedId is @pikku/core parseVersionedId; version -1 is null.
func parseVersionedId(id string) (string, int) {
	idx := lastIndex(id, "@v")
	if idx < 0 {
		return id, -1
	}
	vs := id[idx+2:]
	f, ok := jsNumber(vs)
	if !ok || f < 1 || f != math.Trunc(f) || math.IsInf(f, 0) {
		return id, -1
	}
	return id[:idx], int(f)
}

func isVersionedId(id string) bool {
	_, v := parseVersionedId(id)
	return v >= 0
}

func formatVersionedId(base string, version int) string {
	return base + "@v" + strconv.Itoa(version)
}

func lastIndex(s, sub string) int {
	for i := len(s) - len(sub); i >= 0; i-- {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

// jsNumber is Number(str) for a string: whitespace-trimmed decimal, hex,
// octal or binary literal, "" is 0, Infinity allowed.
func jsNumber(s string) (float64, bool) {
	t := trimJSSpace(s)
	if t == "" {
		return 0, true
	}
	switch t {
	case "Infinity", "+Infinity":
		return math.Inf(1), true
	case "-Infinity":
		return math.Inf(-1), true
	}
	if len(t) > 2 && t[0] == '0' {
		base := 0
		switch t[1] {
		case 'x', 'X':
			base = 16
		case 'o', 'O':
			base = 8
		case 'b', 'B':
			base = 2
		}
		if base != 0 {
			n, err := strconv.ParseUint(t[2:], base, 64)
			if err != nil {
				return math.NaN(), false
			}
			return float64(n), true
		}
	}
	for _, c := range t {
		if !(c >= '0' && c <= '9' || c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') {
			return math.NaN(), false
		}
	}
	f, err := strconv.ParseFloat(t, 64)
	if err != nil {
		return math.NaN(), false
	}
	return f, true
}

func trimJSSpace(s string) string {
	isSpace := func(c byte) bool { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\v' || c == '\f' }
	for len(s) > 0 && isSpace(s[0]) {
		s = s[1:]
	}
	for len(s) > 0 && isSpace(s[len(s)-1]) {
		s = s[:len(s)-1]
	}
	return s
}

func uniqueName(tm *typesmap.TypesMap, name string) string {
	if tm == nil {
		return name
	}
	if u, err := tm.GetUniqueName(name); err == nil {
		return u
	}
	return name
}

// schemaCache parses state.schemas entries on demand.
type schemaCache struct {
	schemas *state.Record[state.Raw]
	parsed  map[string]any
}

func (c *schemaCache) get(key string) any {
	if v, ok := c.parsed[key]; ok {
		return v
	}
	raw, ok := c.schemas.Get(key)
	var v any = Undefined
	if ok {
		if p, err := ParseRaw(raw); err == nil {
			v = p
		}
	}
	if c.parsed == nil {
		c.parsed = map[string]any{}
	}
	c.parsed[key] = v
	return v
}

func resolveSchema(typeNames []string, schemas *schemaCache, tm *typesmap.TypesMap) any {
	if typeNames == nil {
		return nil
	}
	var parts []any
	n := 0
	for _, name := range typeNames {
		if name == "void" {
			continue
		}
		n++
		if s := schemas.get(uniqueName(tm, name)); Truthy(s) {
			parts = append(parts, s)
		}
	}
	if n == 0 || len(parts) == 0 {
		return nil
	}
	if len(parts) == 1 {
		return parts[0]
	}
	return parts
}

func contractVersion(id string, meta *state.FunctionMeta) (string, int) {
	base, v := parseVersionedId(id)
	if v < 0 {
		if meta.Version != nil {
			v = *meta.Version
		} else {
			v = 1
		}
	}
	return base, v
}

func boolPtrTrue(b *bool) bool { return b != nil && *b }

// BuildCurrentContracts ports buildCurrentContracts.
func BuildCurrentContracts(st *state.State) *Contracts {
	result := &Contracts{}
	cache := &schemaCache{schemas: &st.Schemas}
	tm := st.Functions.TypesMap
	st.Functions.Meta.Each(func(id string, meta *state.FunctionMeta) {
		if meta == nil || boolPtrTrue(meta.Remote) || boolPtrTrue(meta.WebhookReceive) {
			return
		}
		key, version := contractVersion(id, meta)
		in := resolveSchema(meta.Inputs, cache, tm)
		out := resolveSchema(meta.Outputs, cache, tm)
		result.set(id, &ContractEntry{
			FunctionKey:  key,
			Version:      version,
			ContractHash: HashString(CanonicalJSON(Obj("functionKey", key, "inputSchema", in, "outputSchema", out)), 16),
			InputHash:    HashString(CanonicalJSON(Obj("functionKey", key, "inputSchema", in)), 8),
			OutputHash:   HashString(CanonicalJSON(Obj("functionKey", key, "outputSchema", out)), 8),
		})
	})
	return result
}

// ComputeContractHashes ports computeContractHashes: it stamps contractHash,
// inputHash and outputHash on every function's meta.
func ComputeContractHashes(st *state.State) *Contracts {
	contracts := BuildCurrentContracts(st)
	for _, id := range contracts.ids {
		e := contracts.entries[id]
		if meta := st.Functions.Meta.At(id); meta != nil {
			meta.ContractHash = e.ContractHash
			meta.InputHash = e.InputHash
			meta.OutputHash = e.OutputHash
		}
	}
	return contracts
}

// ExtractContractsFromMeta ports extractContractsFromMeta.
func ExtractContractsFromMeta(st *state.State) *Contracts {
	result := &Contracts{}
	st.Functions.Meta.Each(func(id string, meta *state.FunctionMeta) {
		if meta == nil || boolPtrTrue(meta.Remote) || boolPtrTrue(meta.WebhookReceive) || meta.ContractHash == "" {
			return
		}
		key, version := contractVersion(id, meta)
		result.set(id, &ContractEntry{
			FunctionKey:  key,
			Version:      version,
			ContractHash: meta.ContractHash,
			InputHash:    meta.InputHash,
			OutputHash:   meta.OutputHash,
		})
	})
	return result
}

// CreateEmptyManifest ports createEmptyManifest.
func CreateEmptyManifest() *Object {
	return Obj("manifestVersion", float64(1), "contracts", NewObject())
}

type contractGroup struct {
	key     string
	entries []*ContractEntry
}

func groupByFunctionKey(c *Contracts) []*contractGroup {
	var groups []*contractGroup
	index := map[string]*contractGroup{}
	for _, id := range c.ids {
		e := c.entries[id]
		g, ok := index[e.FunctionKey]
		if !ok {
			g = &contractGroup{key: e.FunctionKey}
			index[e.FunctionKey] = g
			groups = append(groups, g)
		}
		g.entries = append(g.entries, e)
	}
	return groups
}

// hashEntry reads a manifest version entry: an object `{inputHash,
// outputHash}` or a legacy contract-hash string.
func isHashEntry(v any) bool {
	_, ok := v.(*Object)
	return ok
}

func strField(v any, key string) any {
	if o := AsObject(v); o != nil {
		return o.Get(key)
	}
	return Undefined
}

func entryChanged(existing any, current *ContractEntry) bool {
	if isHashEntry(existing) {
		return !jsStrictEq(strField(existing, "inputHash"), current.InputHash) ||
			!jsStrictEq(strField(existing, "outputHash"), current.OutputHash)
	}
	return !jsStrictEq(existing, current.ContractHash)
}

func jsStrictEq(v any, s string) bool {
	x, ok := v.(string)
	return ok && x == s
}

func numberOf(v any) float64 {
	switch v := v.(type) {
	case float64:
		return v
	case int:
		return float64(v)
	case string:
		f, _ := jsNumber(v)
		return f
	case bool:
		if v {
			return 1
		}
		return 0
	case nil:
		return 0
	}
	return math.NaN()
}

func manifestContracts(manifest *Object) *Object {
	if c := AsObject(manifest.Get("contracts")); c != nil {
		return c
	}
	return NewObject()
}

// ValidateContracts ports validateContracts, returning the errors as the
// VersionValidateError objects TS builds.
func ValidateContracts(manifest *Object, current *Contracts) []*Object {
	var errs []*Object
	grouped := groupByFunctionKey(current)
	reported := map[string]bool{}
	contracts := manifestContracts(manifest)

	for _, g := range grouped {
		entry := AsObject(contracts.Get(g.key))
		if entry == nil {
			continue
		}
		latestV := entry.Get("latest")
		latest := numberOf(latestV)
		versions := AsObject(entry.Get("versions"))
		for _, cur := range g.entries {
			existing := versions.Get(strconv.Itoa(cur.Version))
			if !IsUndefined(existing) {
				if entryChanged(existing, cur) {
					reported[fmt.Sprintf("%s@%d", g.key, cur.Version)] = true
					var recorded string
					var prevIn, prevOut any
					if isHashEntry(existing) {
						recorded = TemplateString(strField(existing, "inputHash")) + "/" + TemplateString(strField(existing, "outputHash"))
						prevIn, prevOut = strField(existing, "inputHash"), strField(existing, "outputHash")
					} else {
						recorded = TemplateString(existing)
						prevIn, prevOut = existing, existing
					}
					errs = append(errs, Obj(
						"code", string(diag.FunctionVersionModified),
						"message", fmt.Sprintf("Contract for %s@v%d has changed (recorded: %s, current: %s). Existing versions are immutable.", g.key, cur.Version, recorded, cur.ContractHash),
						"functionKey", g.key,
						"version", float64(cur.Version),
						"previousHash", prevIn,
						"currentHash", cur.ContractHash,
						"previousInputHash", prevIn,
						"currentInputHash", cur.InputHash,
						"previousOutputHash", prevOut,
						"currentOutputHash", cur.OutputHash,
					))
				}
			} else {
				v := float64(cur.Version)
				if v <= latest {
					errs = append(errs, Obj(
						"code", string(diag.VersionRegressionOrConflict),
						"message", fmt.Sprintf("Version %d for %s is <= latest (%s) but not recorded. Possible merge conflict.", cur.Version, g.key, TemplateString(latestV)),
						"functionKey", g.key,
						"version", v,
						"latestVersion", latestV,
					))
				} else if v > latest+1 {
					errs = append(errs, Obj(
						"code", string(diag.VersionGapNotAllowed),
						"message", fmt.Sprintf("Version %d for %s skips versions. Latest is %s, next must be %s.", cur.Version, g.key, TemplateString(latestV), NumberString(latest+1)),
						"functionKey", g.key,
						"version", v,
						"latestVersion", latestV,
						"expectedNextVersion", latest+1,
					))
				}
			}
		}
	}

	groupIndex := map[string]*contractGroup{}
	for _, g := range grouped {
		groupIndex[g.key] = g
	}

	for _, key := range contracts.Keys() {
		entry := AsObject(contracts.Get(key))
		latestV := entry.Get("latest")
		latest := numberOf(latestV)
		_ = latest
		latestEntry := AsObject(entry.Get("versions")).Get(TemplateString(latestV))
		g := groupIndex[key]
		if g == nil {
			continue
		}
		var currentLatest *ContractEntry
		for _, e := range g.entries {
			if jsNumberEq(latestV, float64(e.Version)) {
				currentLatest = e
				break
			}
		}
		if currentLatest != nil && entryChanged(latestEntry, currentLatest) &&
			!reported[fmt.Sprintf("%s@%s", key, TemplateString(latestV))] {
			var prevIn, prevOut any = Undefined, Undefined
			if isHashEntry(latestEntry) {
				prevIn, prevOut = strField(latestEntry, "inputHash"), strField(latestEntry, "outputHash")
			}
			errs = append(errs, Obj(
				"code", string(diag.ContractChangedRequiresBump),
				"message", fmt.Sprintf("Contract for %s changed. Set `version: %s` on the function or run 'pikku versions update'.", key, NumberString(latest+1)),
				"functionKey", key,
				"previousInputHash", prevIn,
				"currentInputHash", currentLatest.InputHash,
				"previousOutputHash", prevOut,
				"currentOutputHash", currentLatest.OutputHash,
				"nextVersion", latest+1,
			))
		}
	}

	for _, key := range contracts.Keys() {
		entry := AsObject(contracts.Get(key))
		versions := AsObject(entry.Get("versions"))
		vkeys := versions.Keys()
		if len(vkeys) == 0 {
			continue
		}
		maxVersion := math.Inf(-1)
		for _, vk := range vkeys {
			f, ok := jsNumber(vk)
			if !ok || math.IsNaN(f) {
				maxVersion = math.NaN()
				break
			}
			maxVersion = math.Max(maxVersion, f)
		}
		latestV := entry.Get("latest")
		if !jsNumberEq(latestV, maxVersion) {
			errs = append(errs, Obj(
				"code", string(diag.ManifestIntegrityError),
				"message", fmt.Sprintf("Manifest integrity error for %s: latest field (%s) inconsistent with version keys (max: %s).", key, TemplateString(latestV), NumberString(maxVersion)),
				"functionKey", key,
				"latestVersion", latestV,
				"expectedNextVersion", maxVersion,
			))
		}
	}
	return errs
}

func jsNumberEq(v any, f float64) bool {
	x, ok := v.(float64)
	return ok && x == f
}

// UpdateManifest ports updateManifest.
func UpdateManifest(existing *Object, current *Contracts) *Object {
	contracts := DeepClone(manifestContracts(existing)).(*Object)
	manifest := Obj("manifestVersion", existing.Get("manifestVersion"), "contracts", contracts)
	for _, g := range groupByFunctionKey(current) {
		entry := AsObject(contracts.Get(g.key))
		if !Truthy(contracts.Get(g.key)) {
			entry = Obj("latest", float64(0), "versions", NewObject())
			contracts.Set(g.key, entry)
		}
		versions := AsObject(entry.Get("versions"))
		if versions == nil {
			versions = NewObject()
			entry.Set("versions", versions)
		}
		for _, e := range g.entries {
			versions.Set(strconv.Itoa(e.Version), Obj("inputHash", e.InputHash, "outputHash", e.OutputHash))
			entry.Set("latest", math.Max(numberOf(entry.Get("latest")), float64(e.Version)))
		}
	}
	return manifest
}

// ApplyManifest is finalize.ts's manifest block: the initial manifest from
// options (raw versions.pikku.json, or nil), the updated one, and the
// validation errors.
func ApplyManifest(st *state.State, initial []byte) error {
	var base *Object
	st.Manifest.Initial = state.Raw("null")
	if len(initial) > 0 && string(initial) != "null" {
		v, err := Parse(initial)
		if err != nil {
			return fmt.Errorf("manifest: %w", err)
		}
		st.Manifest.Initial = ToRaw(v)
		base = AsObject(v)
	}
	if base == nil {
		base = CreateEmptyManifest()
	}
	contracts := ExtractContractsFromMeta(st)
	st.Manifest.Current = ToRaw(UpdateManifest(base, contracts))
	errs := ValidateContracts(base, contracts)
	st.Manifest.Errors = make(state.List[state.Raw], 0, len(errs))
	for _, e := range errs {
		st.Manifest.Errors = append(st.Manifest.Errors, ToRaw(e))
	}
	return nil
}
