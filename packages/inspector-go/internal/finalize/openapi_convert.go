package finalize

import (
	"errors"
	"fmt"
	"net/url"
	"slices"
	"strings"
)

// Port of the JSON Schema → OpenAPI conversion serialize-openapi-json.ts runs
// on every component schema:
//
//	convertSchema(schema, { convertUnreferencedDefinitions: false,
//	                        dereference: { circular: 'ignore' } })
//
// from @openapi-contrib/json-schema-to-openapi-schema 4.3.4, which loads the
// schema through json-schema-walker 3.3.2 (clone, handleRootReference, then
// @apidevtools/json-schema-ref-parser 15.5.2 dereference) and walks it with
// convertSchema over the DRAFT_07 vocabulary.
//
// The walker hands ref-parser `dereferenceOptions || {}` — the `dereference`
// option above only switches dereferencing on — so ref-parser runs with its
// defaults, `circular: true`: a recursive schema dereferences into a JS cycle
// and fails to serialize, which this port reports as an error.
//
// Only document-local references (`#…`) are resolved, and schemas are
// assumed to carry no `$id`, which is what the schema generators emit.

// ConvertSchemaToOpenAPI converts one JSON schema value (as Parse returns it;
// it is mutated and may be shared in the result).
func ConvertSchemaToOpenAPI(schema any) (any, error) {
	root := handleRootReference(schema)
	d := &derefCtx{root: root, cache: map[string]*derefResult{}, processed: map[any]bool{}, parents: map[any]bool{}}
	res, err := d.crawl(root, "", "#", 0)
	if err != nil {
		return nil, err
	}
	w := &schemaWalker{visited: map[any]bool{}}
	if id, ok := identity(res.value); ok {
		w.visited[id] = true
	}
	if err := w.convert(res.value); err != nil {
		return nil, err
	}
	if err := w.subschemaWalk(res.value); err != nil {
		return nil, err
	}
	return res.value, nil
}

// identity is a JS object's reference identity: the *Object pointer, or an
// array's backing store (an empty array has nothing to crawl).
func identity(v any) (any, bool) {
	switch v := v.(type) {
	case *Object:
		return v, v != nil
	case []any:
		if len(v) > 0 {
			return &v[0], true
		}
	}
	return nil, false
}

func isJSObject(v any) bool {
	switch v := v.(type) {
	case *Object:
		return v != nil
	case []any:
		return true
	}
	return false
}

func jsKeys(v any) []string {
	switch v := v.(type) {
	case *Object:
		return v.Keys()
	case []any:
		keys := make([]string, len(v))
		for i := range v {
			keys[i] = fmt.Sprint(i)
		}
		return keys
	}
	return nil
}

func jsGet(v any, key string) any {
	switch v := v.(type) {
	case *Object:
		return v.Get(key)
	case []any:
		if n, ok := isArrayIndex(key); ok && int(n) < len(v) {
			return v[n]
		}
	}
	return Undefined
}

func jsSet(v any, key string, x any) {
	switch v := v.(type) {
	case *Object:
		v.Set(key, x)
	case []any:
		if n, ok := isArrayIndex(key); ok && int(n) < len(v) {
			v[n] = x
		}
	}
}

// jsSame is `a === b` for the values the dereferencer compares.
func jsSame(a, b any) bool {
	ia, oka := identity(a)
	ib, okb := identity(b)
	if oka || okb {
		return oka && okb && ia == ib
	}
	if jsIsArray(a) || jsIsArray(b) {
		return false
	}
	return a == b
}

// ---- json-schema-walker handleRootReference ----

func handleRootReference(input any) any {
	o := AsObject(input)
	if o == nil || IsUndefined(o.Get("$ref")) || IsUndefined(o.Get("definitions")) {
		return input
	}
	const link = "#/definitions/"
	ref := TemplateString(o.Get("$ref"))
	if !strings.HasPrefix(ref, link) {
		return input
	}
	def := jsGet(o.Get("definitions"), ref[len(link):])
	if IsUndefined(def) {
		return input
	}
	out := NewObject()
	if d := AsObject(def); d != nil {
		for _, k := range d.Keys() {
			out.Set(k, d.Get(k))
		}
	} else if s, ok := def.(string); ok {
		// Spreading a string copies its characters as index keys.
		for i, r := range []rune(s) {
			out.Set(fmt.Sprint(i), string(r))
		}
	}
	out.Set("definitions", o.Get("definitions"))
	return out
}

// ---- @apidevtools/json-schema-ref-parser dereference ----

type derefResult struct {
	circular bool
	value    any
}

type derefCtx struct {
	root      any
	cache     map[string]*derefResult
	processed map[any]bool
	parents   map[any]bool
}

func isRef(v any) bool {
	o := AsObject(v)
	if o == nil {
		return false
	}
	s, ok := o.Get("$ref").(string)
	return ok && s != ""
}

func isAllowedRef(v any) bool {
	if !isRef(v) {
		return false
	}
	s := AsObject(v).Get("$ref").(string)
	return strings.HasPrefix(s, "#/") || s == "#"
}

func isExtendedRef(v any) bool { return isRef(v) && AsObject(v).Len() > 1 }

// pointerJoin is Pointer.join.
func pointerJoin(base string, tokens ...string) string {
	if !strings.Contains(base, "#") {
		base += "#"
	}
	for _, t := range tokens {
		base += "/" + strings.ReplaceAll(strings.ReplaceAll(t, "~", "~0"), "/", "~1")
	}
	return base
}

// pointerParse is Pointer.parse.
func pointerParse(path string) ([]string, error) {
	hash := "#"
	if i := strings.Index(path, "#"); i >= 0 {
		hash = path[i:]
	}
	p := hash[1:]
	if p == "" {
		return nil, nil
	}
	split := strings.Split(p, "/")
	for i := range split {
		split[i] = strings.ReplaceAll(strings.ReplaceAll(split[i], "~1", "/"), "~0", "~")
	}
	if split[0] != "" {
		return nil, fmt.Errorf("Invalid $ref pointer %q. Pointers must begin with \"#/\"", p)
	}
	return split[1:], nil
}

// resolveURL is util/url resolve for a same-document target: the base's
// document plus the target's decoded fragment.
func resolveURL(from, to string) string {
	base := from
	if i := strings.Index(base, "#"); i >= 0 {
		base = base[:i]
	}
	hash := to
	if i := strings.Index(to, "#"); i >= 0 {
		hash = to[i+1:]
	} else {
		return base + to
	}
	if dec, err := url.PathUnescape(strings.ReplaceAll(hash, "+", "%2B")); err == nil {
		hash = dec
	}
	return base + "#" + hash
}

type pointer struct {
	path          string
	value         any
	circular      bool
	chainCircular bool
}

var errMissingPointer = errors.New("missing pointer")

func (d *derefCtx) resolvePointer(path, pathFromRoot string, visited map[string]bool, resolveFinal bool) (*pointer, error) {
	p := &pointer{path: path}
	tokens, err := pointerParse(path)
	if err != nil {
		return nil, err
	}
	p.value = d.root
	for i := 0; i < len(tokens); i++ {
		wasCirc, wasChain := p.circular, p.chainCircular
		isExt := isExtendedRef(p.value)
		changed, err := d.resolveIfRef(p, pathFromRoot, visited)
		if err != nil {
			return nil, err
		}
		if changed {
			p.path = pointerJoin(p.path, tokens[i:]...)
		} else if isExt {
			p.circular, p.chainCircular = wasCirc, wasChain
		}
		token := tokens[i]
		if !isJSObject(p.value) {
			return nil, fmt.Errorf("%w: Missing $ref pointer %q. Token %q does not exist.", errMissingPointer, path, token)
		}
		next := jsGet(p.value, token)
		if IsUndefined(next) || (next == nil && i == len(tokens)-1) {
			found := false
			for j := len(tokens) - 1; j > i; j-- {
				joined := strings.Join(tokens[i:j+1], "/")
				if v := jsGet(p.value, joined); !IsUndefined(v) {
					p.value = v
					i = j
					found = true
					break
				}
			}
			if found {
				p.chainCircular = wasChain
				continue
			}
			if next == nil && !IsUndefined(next) {
				p.value = nil
				p.chainCircular = wasChain
				continue
			}
			return nil, fmt.Errorf("%w: Missing $ref pointer %q. Token %q does not exist.", errMissingPointer, path, token)
		}
		p.value = next
		p.chainCircular = wasChain
	}
	if resolveFinal {
		finalRefPath := ""
		hasFinal := false
		if o := AsObject(p.value); o != nil && Truthy(o.Get("$ref")) {
			finalRefPath = resolveURL(p.path, TemplateString(o.Get("$ref")))
			hasFinal = true
		}
		canonical := resolveURL("", pathFromRoot)
		if isAllowedRef(p.value) && hasFinal && finalRefPath == canonical && finalRefPath != p.path {
			p.chainCircular = true
		} else if !Truthy(p.value) || hasFinal {
			if _, err := d.resolveIfRef(p, pathFromRoot, visited); err != nil {
				return nil, err
			}
		}
	}
	return p, nil
}

func isRootPath(path string) bool {
	t, err := pointerParse(path)
	return err == nil && len(t) == 0
}

func (d *derefCtx) resolveIfRef(p *pointer, pathFromRoot string, visited map[string]bool) (bool, error) {
	changed := false
	current := pathFromRoot
	var added []string
	defer func() {
		for _, a := range added {
			delete(visited, a)
		}
	}()
	for isAllowedRef(p.value) {
		extended := isExtendedRef(p.value)
		source := p.value
		parentPath := p.path
		refPath := resolveURL(p.path, AsObject(p.value).Get("$ref").(string))
		if refPath == p.path && !isRootPath(current) {
			p.circular, p.chainCircular = true, true
			return changed, nil
		}
		if refPath == resolveURL("", current) && refPath != p.path {
			p.chainCircular = true
			return changed, nil
		}
		if visited[refPath] {
			p.chainCircular = true
			return changed, nil
		}
		if len(visited) >= 500 {
			return changed, fmt.Errorf("Maximum dereference depth (500) exceeded at %s.", p.path)
		}
		visited[refPath] = true
		added = append(added, refPath)
		resolved, err := d.resolvePointer(refPath, parentPath, visited, extended)
		if err != nil {
			return changed, err
		}
		p.chainCircular = p.chainCircular || resolved.circular || resolved.chainCircular
		if extended {
			if p.chainCircular {
				return changed, nil
			}
			p.value = derefMerge(source, resolved.value)
			return changed, nil
		}
		p.path = resolved.path
		p.value = resolved.value
		current = parentPath
		changed = true
	}
	return changed, nil
}

// derefMerge is $Ref.dereference.
func derefMerge(ref any, resolved any) any {
	r := AsObject(ref)
	if !isJSObject(resolved) || !isExtendedRef(ref) {
		return resolved
	}
	merged := NewObject()
	for _, k := range r.Keys() {
		if k != "$ref" {
			merged.Set(k, r.Get(k))
		}
	}
	for _, k := range jsKeys(resolved) {
		rv := jsGet(resolved, k)
		if !merged.Has(k) {
			merged.Set(k, rv)
		} else if mv := merged.Get(k); isJSObject(mv) && isJSObject(rv) {
			merged.Set(k, deepMerge(rv, mv))
		}
	}
	return merged
}

func cloneEnumerable(v any) any {
	switch v := v.(type) {
	case []any:
		return slices.Clone(v)
	case *Object:
		return v.Clone()
	}
	return v
}

func deepMerge(target, source any) any {
	if !isJSObject(target) || !isJSObject(source) {
		return source
	}
	if _, ok := source.([]any); ok {
		return cloneEnumerable(source)
	}
	out := cloneEnumerable(target)
	for _, k := range jsKeys(source) {
		sv := jsGet(source, k)
		var mv any
		switch {
		case jsIsArray(sv):
			mv = cloneEnumerable(sv)
		case isJSObject(sv):
			tv := any(Undefined)
			if o := AsObject(target); o != nil && o.Has(k) {
				tv = o.Get(k)
			} else if a, ok := target.([]any); ok {
				tv = jsGet(a, k)
			}
			mv = deepMerge(tv, sv)
		default:
			mv = sv
		}
		if o := AsObject(out); o != nil {
			o.Set(k, mv)
		} else {
			jsSet(out, k, mv)
		}
	}
	return out
}

func jsIsArray(v any) bool { _, ok := v.([]any); return ok }

func (d *derefCtx) crawl(obj any, path, pathFromRoot string, depth int) (*derefResult, error) {
	result := &derefResult{value: obj}
	if depth > 500 {
		return nil, fmt.Errorf("Maximum dereference depth (500) exceeded at %s.", pathFromRoot)
	}
	id, hasID := identity(obj)
	if hasID && d.processed[id] {
		return result, nil
	}
	if !isJSObject(obj) {
		return result, nil
	}
	if hasID {
		d.parents[id] = true
		d.processed[id] = true
	}
	if isAllowedRef(obj) {
		r, err := d.derefRef(obj, path, pathFromRoot, depth)
		if err != nil {
			return nil, err
		}
		result = r
	} else {
		for _, key := range jsKeys(obj) {
			keyPath := pointerJoin(path, key)
			keyPathFromRoot := pointerJoin(pathFromRoot, key)
			value := jsGet(obj, key)
			var circular bool
			if isAllowedRef(value) {
				r, err := d.derefRef(value, keyPath, keyPathFromRoot, depth)
				if err != nil {
					return nil, err
				}
				circular = r.circular
				if !jsSame(jsGet(obj, key), r.value) {
					jsSet(obj, key, r.value)
				}
			} else if vid, ok := identity(value); !ok || !d.parents[vid] {
				r, err := d.crawl(value, keyPath, keyPathFromRoot, depth+1)
				if err != nil {
					return nil, err
				}
				circular = r.circular
				if !jsSame(jsGet(obj, key), r.value) {
					jsSet(obj, key, r.value)
				}
			} else {
				circular = true
			}
			result.circular = result.circular || circular
		}
	}
	if hasID {
		delete(d.parents, id)
	}
	return result, nil
}

func (d *derefCtx) derefRef(ref any, path, pathFromRoot string, depth int) (*derefResult, error) {
	refObj := AsObject(ref)
	refStr := refObj.Get("$ref").(string)
	refPath := resolveURL(path, refStr)
	if cache, ok := d.cache[refPath]; ok {
		if !cache.circular {
			if !isExtendedRef(ref) {
				return cache, nil
			}
		} else {
			if co := AsObject(cache.value); co != nil && co.Has("$ref") {
				if jsSame(co.Get("$ref"), refStr) {
					return cache, nil
				}
			} else {
				return cache, nil
			}
		}
	}
	p, err := d.resolvePointer(refPath, path, map[string]bool{}, true)
	if err != nil {
		return nil, err
	}
	direct := p.circular
	circular := direct || p.chainCircular
	if id, ok := identity(p.value); ok && d.parents[id] {
		circular = true
	}
	value := derefMerge(ref, p.value)
	if !circular {
		r, err := d.crawl(value, p.path, pathFromRoot, depth+1)
		if err != nil {
			return nil, err
		}
		circular = r.circular
		value = r.value
	}
	if direct && !jsSame(value, ref) {
		if o := AsObject(value); o != nil {
			o.Set("$ref", pathFromRoot)
		}
	}
	res := &derefResult{circular: circular, value: value}
	if refObj.Len() == 1 {
		d.cache[refPath] = res
	}
	return res, nil
}

// ---- json-schema-walker over DRAFT_07 ----

type schemaWalker struct {
	visited map[any]bool
}

var objectOfSchemas = map[string]bool{"properties": true, "patternProperties": true, "definitions": true, "dependencies": true}
var singleSchema = map[string]bool{"additionalProperties": true, "additionalItems": true, "not": true, "if": true, "then": true, "else": true, "propertyNames": true, "contains": true}
var arrayOfSchemas = map[string]bool{"allOf": true, "anyOf": true, "oneOf": true}

func isValidSubSchema(v any) bool {
	if _, ok := v.(bool); ok {
		return true
	}
	return AsObject(v) != nil
}

func (w *schemaWalker) subschemaWalk(schema any) error {
	o := AsObject(schema)
	if o == nil {
		return nil
	}
	for _, kw := range o.Keys() {
		v := o.Get(kw)
		if !Truthy(v) || !isJSObject(v) {
			continue
		}
		var err error
		switch {
		case objectOfSchemas[kw]:
			for _, prop := range jsKeys(v) {
				if isValidSubSchema(jsGet(v, prop)) {
					if err = w.apply(v, prop); err != nil {
						return err
					}
				}
			}
		case singleSchema[kw]:
			err = w.apply(o, kw)
		case arrayOfSchemas[kw]:
			err = w.applyArray(v)
		case kw == "items":
			if isValidSubSchema(v) {
				err = w.apply(o, kw)
			} else {
				err = w.applyArray(v)
			}
		}
		if err != nil {
			return err
		}
	}
	return nil
}

func (w *schemaWalker) applyArray(v any) error {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	for i := range arr {
		if err := w.apply(arr, fmt.Sprint(i)); err != nil {
			return err
		}
	}
	return nil
}

func (w *schemaWalker) apply(parent any, key string) error {
	el := jsGet(parent, key)
	if el == nil {
		return errors.New("Invalid value used in weak set")
	}
	if !isJSObject(el) {
		return nil
	}
	id, ok := identity(el)
	if ok {
		if w.visited[id] {
			return nil
		}
		w.visited[id] = true
	}
	if err := w.convert(el); err != nil {
		return err
	}
	return w.subschemaWalk(el)
}

// ---- json-schema-to-openapi-schema convertSchema ----

var allowedKeywords = map[string]bool{
	"$ref": true, "definitions": true, "title": true, "multipleOf": true, "maximum": true,
	"exclusiveMaximum": true, "minimum": true, "exclusiveMinimum": true, "maxLength": true,
	"minLength": true, "pattern": true, "maxItems": true, "minItems": true, "uniqueItems": true,
	"maxProperties": true, "minProperties": true, "required": true, "enum": true, "type": true,
	"not": true, "allOf": true, "oneOf": true, "anyOf": true, "items": true, "properties": true,
	"additionalProperties": true, "description": true, "format": true, "default": true,
	"nullable": true, "discriminator": true, "readOnly": true, "writeOnly": true, "example": true,
	"externalDocs": true, "deprecated": true, "xml": true,
}

var validTypes = map[string]bool{"null": true, "boolean": true, "object": true, "array": true, "number": true, "string": true, "integer": true}

func (w *schemaWalker) convert(v any) error {
	s := AsObject(v)
	if s == nil {
		return nil
	}
	s.Delete("$schema")
	s.Delete("$id")
	s.Delete("id")
	if err := convertTypes(s); err != nil {
		return err
	}
	if s.Has("const") {
		s.Set("enum", []any{s.Get("const")})
		s.Delete("const")
	}
	convertDependencies(s)
	convertNullable(s)
	if s.Has("if") && Truthy(s.Get("if")) && Truthy(s.Get("then")) {
		ifS, thenS, elseS := s.Get("if"), s.Get("then"), s.Get("else")
		s.Set("oneOf", []any{
			Obj("allOf", filterTruthy(ifS, thenS)),
			Obj("allOf", filterTruthy(Obj("not", ifS), elseS)),
		})
		s.Delete("if")
		s.Delete("then")
		s.Delete("else")
	}
	if f, ok := s.Get("exclusiveMaximum").(float64); ok {
		s.Set("maximum", f)
		s.Set("exclusiveMaximum", true)
	}
	if f, ok := s.Get("exclusiveMinimum").(float64); ok {
		s.Set("minimum", f)
		s.Set("exclusiveMinimum", true)
	}
	if ex, ok := s.Get("examples").([]any); ok {
		if len(ex) > 0 {
			s.Set("example", ex[0])
		} else {
			s.Set("example", Undefined)
		}
		s.Delete("examples")
	}
	if pp := s.Get("patternProperties"); pp == nil || isJSObject(pp) {
		if s.Has("patternProperties") {
			s.Set("x-patternProperties", pp)
			s.Delete("patternProperties")
			if Nullish(s.Get("additionalProperties")) {
				s.Set("additionalProperties", true)
			}
		}
	}
	if s.Get("type") == "array" && IsUndefined(s.Get("items")) {
		s.Set("items", NewObject())
	}
	for _, k := range s.Keys() {
		if strings.HasPrefix(k, "x-") || allowedKeywords[k] {
			continue
		}
		s.Set("x-"+k, s.Get(k))
		s.Delete(k)
	}
	return nil
}

func filterTruthy(vs ...any) []any {
	out := []any{}
	for _, v := range vs {
		if Truthy(v) {
			out = append(out, v)
		}
	}
	return out
}

func invalidType(t any) error {
	return fmt.Errorf("InvalidTypeError: Type \"%s\" is not a valid type", TemplateString(t))
}

func convertTypes(s *Object) error {
	t := s.Get("type")
	if IsUndefined(t) {
		return nil
	}
	if o := AsObject(t); o != nil && (Truthy(o.Get("$ref")) || Truthy(o.Get("properties"))) {
		// validateType accepts it.
	} else {
		types := []any{t}
		if arr, ok := t.([]any); ok {
			types = arr
		}
		for _, x := range types {
			if !Truthy(x) {
				continue
			}
			if str, ok := x.(string); !ok || !validTypes[str] {
				return invalidType(x)
			}
		}
	}
	if arr, ok := t.([]any); ok {
		without := []any{}
		hasNull := false
		for _, x := range arr {
			if x == "null" {
				hasNull = true
			} else {
				without = append(without, x)
			}
		}
		if hasNull {
			s.Set("nullable", true)
		}
		switch len(without) {
		case 0:
			s.Delete("type")
		case 1:
			s.Set("type", without[0])
		default:
			s.Delete("type")
			anyOf := make([]any, len(without))
			for i, x := range without {
				anyOf[i] = Obj("type", x)
			}
			s.Set("anyOf", anyOf)
		}
	} else if t == "null" {
		s.Delete("type")
		s.Set("nullable", true)
	}
	return nil
}

func convertDependencies(s *Object) {
	deps := s.Get("dependencies")
	if !(deps == nil || isJSObject(deps)) || !s.Has("dependencies") {
		return
	}
	s.Delete("dependencies")
	allOf, ok := s.Get("allOf").([]any)
	if !ok {
		allOf = []any{}
	}
	for _, key := range jsKeys(deps) {
		dep := jsGet(deps, key)
		required := []any{key}
		if arr, ok := dep.([]any); ok {
			required = append(required, arr...)
		} else {
			required = append(required, dep)
		}
		allOf = append(allOf, Obj("oneOf", []any{
			Obj("not", Obj("required", []any{key})),
			Obj("required", required),
		}))
	}
	s.Set("allOf", allOf)
}

func convertNullable(s *Object) {
	for _, key := range []string{"oneOf", "anyOf"} {
		v := s.Get(key)
		if !Truthy(v) {
			continue
		}
		arr, ok := v.([]any)
		if !ok {
			return
		}
		isNull := func(item any) bool { return jsGet(item, "type") == "null" }
		if !slices.ContainsFunc(arr, isNull) {
			return
		}
		filtered := []any{}
		for _, item := range arr {
			if !isNull(item) {
				filtered = append(filtered, item)
			}
		}
		for _, item := range filtered {
			if o := AsObject(item); o != nil {
				o.Set("nullable", true)
			}
		}
		s.Set(key, filtered)
	}
}
