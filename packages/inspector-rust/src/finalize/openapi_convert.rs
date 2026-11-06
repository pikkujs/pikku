//! Port of Go `finalize/openapi_convert.go`: the JSON Schema -> OpenAPI
//! conversion serialize-openapi-json.ts runs on every component schema:
//!
//! ```text
//! convertSchema(schema, { convertUnreferencedDefinitions: false,
//!                         dereference: { circular: 'ignore' } })
//! ```
//!
//! from @openapi-contrib/json-schema-to-openapi-schema 4.3.4, which loads the
//! schema through json-schema-walker 3.3.2 (clone, handleRootReference, then
//! @apidevtools/json-schema-ref-parser 15.5.2 dereference) and walks it with
//! convertSchema over the DRAFT_07 vocabulary.
//!
//! The walker hands ref-parser `dereferenceOptions || {}`, so ref-parser runs
//! with its defaults, `circular: true`: a recursive schema dereferences into a
//! JS cycle and fails to serialize, which this port reports as an error. Only
//! document-local references (`#...`) are resolved, and schemas are assumed to
//! carry no `$id`.

use std::collections::{HashMap, HashSet};

use super::jsval::V;

type R<T> = Result<T, String>;

/// Converts one JSON schema value (it is mutated and may be shared in the
/// result).
pub fn convert_schema_to_openapi(schema: &V) -> R<V> {
    let root = handle_root_reference(schema);
    let mut d = DerefCtx { root: root.clone(), cache: HashMap::new(), processed: HashSet::new(), parents: HashSet::new() };
    let res = d.crawl(&root, "", "#", 0)?;
    let mut w = Walker { visited: HashSet::new() };
    if let Some(id) = res.value.identity() {
        w.visited.insert(id);
    }
    w.convert(&res.value)?;
    w.subschema_walk(&res.value)?;
    Ok(res.value)
}

fn is_js_object(v: &V) -> bool {
    matches!(v, V::Obj(_) | V::Arr(_))
}

fn js_keys(v: &V) -> Vec<String> {
    v.keys()
}

/// `a === b` for the values the dereferencer compares.
fn js_same(a: &V, b: &V) -> bool {
    let (ia, ib) = (a.identity(), b.identity());
    if ia.is_some() || ib.is_some() {
        return ia.is_some() && ib.is_some() && ia == ib;
    }
    if a.is_arr() || b.is_arr() {
        return false;
    }
    match (a, b) {
        (V::Undef, V::Undef) | (V::Null, V::Null) => true,
        (V::Bool(x), V::Bool(y)) => x == y,
        (V::Num(x), V::Num(y)) => x == y,
        (V::Str(x), V::Str(y)) => x == y,
        _ => false,
    }
}

/// Go `%q` for a string.
fn go_quote(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\t' => out.push_str("\\t"),
            '\r' => out.push_str("\\r"),
            c if (c as u32) < 0x20 || c as u32 == 0x7f => out.push_str(&format!("\\x{:02x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

// ---- json-schema-walker handleRootReference ----

fn handle_root_reference(input: &V) -> V {
    if !input.is_obj() || input.get("$ref").is_undef() || input.get("definitions").is_undef() {
        return input.clone();
    }
    const LINK: &str = "#/definitions/";
    let r = input.get("$ref").template_string();
    if !r.starts_with(LINK) {
        return input.clone();
    }
    let def = input.get("definitions").js_get(&r[LINK.len()..]);
    if def.is_undef() {
        return input.clone();
    }
    let out = V::obj();
    if def.is_obj() {
        for k in def.keys() {
            out.set(&k, def.get(&k));
        }
    } else if let Some(s) = def.as_str() {
        for (i, c) in s.chars().enumerate() {
            out.set(&i.to_string(), V::str(c.to_string()));
        }
    }
    out.set("definitions", input.get("definitions"));
    out
}

// ---- @apidevtools/json-schema-ref-parser dereference ----

#[derive(Clone)]
struct DerefResult {
    circular: bool,
    value: V,
}

struct DerefCtx {
    root: V,
    cache: HashMap<String, DerefResult>,
    processed: HashSet<usize>,
    parents: HashSet<usize>,
}

fn is_ref(v: &V) -> bool {
    v.is_obj() && v.get("$ref").as_str().is_some_and(|s| !s.is_empty())
}

fn is_allowed_ref(v: &V) -> bool {
    is_ref(v) && {
        let s = v.get("$ref");
        let s = s.as_str().unwrap();
        s.starts_with("#/") || s == "#"
    }
}

fn is_extended_ref(v: &V) -> bool {
    is_ref(v) && v.len() > 1
}

/// Pointer.join.
fn pointer_join(base: &str, tokens: &[String]) -> String {
    let mut base = base.to_string();
    if !base.contains('#') {
        base.push('#');
    }
    for t in tokens {
        base.push('/');
        base.push_str(&t.replace('~', "~0").replace('/', "~1"));
    }
    base
}

/// Pointer.parse.
fn pointer_parse(path: &str) -> R<Vec<String>> {
    let hash = match path.find('#') {
        Some(i) => &path[i..],
        None => "#",
    };
    let p = &hash[1..];
    if p.is_empty() {
        return Ok(vec![]);
    }
    let split: Vec<String> = p.split('/').map(|s| s.replace("~1", "/").replace("~0", "~")).collect();
    if !split[0].is_empty() {
        return Err(format!("Invalid $ref pointer {}. Pointers must begin with \"#/\"", go_quote(p)));
    }
    Ok(split[1..].to_vec())
}

/// url.PathUnescape (with '+' kept literal as the Go port does).
fn path_unescape(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            if i + 2 >= b.len() {
                return None;
            }
            let h = std::str::from_utf8(&b[i + 1..i + 3]).ok()?;
            out.push(u8::from_str_radix(h, 16).ok()?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// util/url resolve for a same-document target: the base's document plus the
/// target's decoded fragment.
fn resolve_url(from: &str, to: &str) -> String {
    let base = match from.find('#') {
        Some(i) => &from[..i],
        None => from,
    };
    let hash = match to.find('#') {
        Some(i) => &to[i + 1..],
        None => return format!("{base}{to}"),
    };
    let hash = path_unescape(&hash.replace('+', "%2B")).unwrap_or_else(|| hash.to_string());
    format!("{base}#{hash}")
}

struct Pointer {
    path: String,
    value: V,
    circular: bool,
    chain_circular: bool,
}

fn missing(path: &str, token: &str) -> String {
    format!("missing pointer: Missing $ref pointer {}. Token {} does not exist.", go_quote(path), go_quote(token))
}

fn is_root_path(path: &str) -> bool {
    pointer_parse(path).map(|t| t.is_empty()).unwrap_or(false)
}

impl DerefCtx {
    fn resolve_pointer(&mut self, path: &str, path_from_root: &str, visited: &mut HashSet<String>, resolve_final: bool) -> R<Pointer> {
        let mut p = Pointer { path: path.to_string(), value: V::Undef, circular: false, chain_circular: false };
        let tokens = pointer_parse(path)?;
        p.value = self.root.clone();
        let mut i = 0;
        while i < tokens.len() {
            let (was_circ, was_chain) = (p.circular, p.chain_circular);
            let is_ext = is_extended_ref(&p.value);
            let changed = self.resolve_if_ref(&mut p, path_from_root, visited)?;
            if changed {
                p.path = pointer_join(&p.path, &tokens[i..]);
            } else if is_ext {
                p.circular = was_circ;
                p.chain_circular = was_chain;
            }
            let token = &tokens[i];
            if !is_js_object(&p.value) {
                return Err(missing(path, token));
            }
            let next = p.value.js_get(token);
            if next.is_undef() || (next.is_null() && i == tokens.len() - 1) {
                let mut found = false;
                let mut j = tokens.len() as isize - 1;
                while j > i as isize {
                    let joined = tokens[i..=j as usize].join("/");
                    let v = p.value.js_get(&joined);
                    if !v.is_undef() {
                        p.value = v;
                        i = j as usize;
                        found = true;
                        break;
                    }
                    j -= 1;
                }
                if found {
                    p.chain_circular = was_chain;
                    i += 1;
                    continue;
                }
                if next.is_null() {
                    p.value = V::Null;
                    p.chain_circular = was_chain;
                    i += 1;
                    continue;
                }
                return Err(missing(path, token));
            }
            p.value = next;
            p.chain_circular = was_chain;
            i += 1;
        }
        if resolve_final {
            let mut final_ref_path = String::new();
            let mut has_final = false;
            if p.value.is_obj() && p.value.get("$ref").truthy() {
                final_ref_path = resolve_url(&p.path, &p.value.get("$ref").template_string());
                has_final = true;
            }
            let canonical = resolve_url("", path_from_root);
            if is_allowed_ref(&p.value) && has_final && final_ref_path == canonical && final_ref_path != p.path {
                p.chain_circular = true;
            } else if !p.value.truthy() || has_final {
                self.resolve_if_ref(&mut p, path_from_root, visited)?;
            }
        }
        Ok(p)
    }

    fn resolve_if_ref(&mut self, p: &mut Pointer, path_from_root: &str, visited: &mut HashSet<String>) -> R<bool> {
        let mut added: Vec<String> = Vec::new();
        let r = self.resolve_if_ref_inner(p, path_from_root, visited, &mut added);
        for a in added {
            visited.remove(&a);
        }
        r
    }

    fn resolve_if_ref_inner(&mut self, p: &mut Pointer, path_from_root: &str, visited: &mut HashSet<String>, added: &mut Vec<String>) -> R<bool> {
        let mut changed = false;
        let mut current = path_from_root.to_string();
        while is_allowed_ref(&p.value) {
            let extended = is_extended_ref(&p.value);
            let source = p.value.clone();
            let parent_path = p.path.clone();
            let ref_path = resolve_url(&p.path, p.value.get("$ref").as_str().unwrap());
            if ref_path == p.path && !is_root_path(&current) {
                p.circular = true;
                p.chain_circular = true;
                return Ok(changed);
            }
            if ref_path == resolve_url("", &current) && ref_path != p.path {
                p.chain_circular = true;
                return Ok(changed);
            }
            if visited.contains(&ref_path) {
                p.chain_circular = true;
                return Ok(changed);
            }
            if visited.len() >= 500 {
                return Err(format!("Maximum dereference depth (500) exceeded at {}.", p.path));
            }
            visited.insert(ref_path.clone());
            added.push(ref_path.clone());
            let resolved = self.resolve_pointer(&ref_path, &parent_path, visited, extended)?;
            p.chain_circular = p.chain_circular || resolved.circular || resolved.chain_circular;
            if extended {
                if p.chain_circular {
                    return Ok(changed);
                }
                p.value = deref_merge(&source, &resolved.value);
                return Ok(changed);
            }
            p.path = resolved.path;
            p.value = resolved.value;
            current = parent_path;
            changed = true;
        }
        Ok(changed)
    }

    fn crawl(&mut self, obj: &V, path: &str, path_from_root: &str, depth: usize) -> R<DerefResult> {
        let mut result = DerefResult { circular: false, value: obj.clone() };
        if depth > 500 {
            return Err(format!("Maximum dereference depth (500) exceeded at {path_from_root}."));
        }
        let id = obj.identity();
        if let Some(id) = id {
            if self.processed.contains(&id) {
                return Ok(result);
            }
        }
        if !is_js_object(obj) {
            return Ok(result);
        }
        if let Some(id) = id {
            self.parents.insert(id);
            self.processed.insert(id);
        }
        if is_allowed_ref(obj) {
            result = self.deref_ref(obj, path, path_from_root, depth)?;
        } else {
            for key in js_keys(obj) {
                let key_path = pointer_join(path, std::slice::from_ref(&key));
                let key_path_from_root = pointer_join(path_from_root, std::slice::from_ref(&key));
                let value = obj.js_get(&key);
                let circular;
                if is_allowed_ref(&value) {
                    let r = self.deref_ref(&value, &key_path, &key_path_from_root, depth)?;
                    circular = r.circular;
                    if !js_same(&obj.js_get(&key), &r.value) {
                        obj.js_set(&key, r.value);
                    }
                } else if !value.identity().is_some_and(|vid| self.parents.contains(&vid)) {
                    let r = self.crawl(&value, &key_path, &key_path_from_root, depth + 1)?;
                    circular = r.circular;
                    if !js_same(&obj.js_get(&key), &r.value) {
                        obj.js_set(&key, r.value);
                    }
                } else {
                    circular = true;
                }
                result.circular = result.circular || circular;
            }
        }
        if let Some(id) = id {
            self.parents.remove(&id);
        }
        Ok(result)
    }

    fn deref_ref(&mut self, r: &V, path: &str, path_from_root: &str, depth: usize) -> R<DerefResult> {
        let ref_str = r.get("$ref");
        let ref_str = ref_str.as_str().unwrap().to_string();
        let ref_path = resolve_url(path, &ref_str);
        if let Some(cache) = self.cache.get(&ref_path) {
            if !cache.circular {
                if !is_extended_ref(r) {
                    return Ok(cache.clone());
                }
            } else if cache.value.is_obj() && cache.value.has("$ref") {
                if matches!(cache.value.get("$ref"), V::Str(ref s) if **s == *ref_str) {
                    return Ok(cache.clone());
                }
            } else {
                return Ok(cache.clone());
            }
        }
        let p = self.resolve_pointer(&ref_path, path, &mut HashSet::new(), true)?;
        let direct = p.circular;
        let mut circular = direct || p.chain_circular;
        if p.value.identity().is_some_and(|id| self.parents.contains(&id)) {
            circular = true;
        }
        let mut value = deref_merge(r, &p.value);
        if !circular {
            let res = self.crawl(&value, &p.path, path_from_root, depth + 1)?;
            circular = res.circular;
            value = res.value;
        }
        if direct && !js_same(&value, r) && value.is_obj() {
            value.set("$ref", V::str(path_from_root));
        }
        let res = DerefResult { circular, value };
        if r.len() == 1 {
            self.cache.insert(ref_path, res.clone());
        }
        Ok(res)
    }
}

/// $Ref.dereference.
fn deref_merge(r: &V, resolved: &V) -> V {
    if !is_js_object(resolved) || !is_extended_ref(r) {
        return resolved.clone();
    }
    let merged = V::obj();
    for k in r.keys() {
        if k != "$ref" {
            merged.set(&k, r.get(&k));
        }
    }
    for k in js_keys(resolved) {
        let rv = resolved.js_get(&k);
        if !merged.has(&k) {
            merged.set(&k, rv);
        } else {
            let mv = merged.get(&k);
            if is_js_object(&mv) && is_js_object(&rv) {
                merged.set(&k, deep_merge(&rv, &mv));
            }
        }
    }
    merged
}

fn clone_enumerable(v: &V) -> V {
    v.shallow_clone()
}

fn deep_merge(target: &V, source: &V) -> V {
    if !is_js_object(target) || !is_js_object(source) {
        return source.clone();
    }
    if source.is_arr() {
        return clone_enumerable(source);
    }
    let out = clone_enumerable(target);
    for k in js_keys(source) {
        let sv = source.js_get(&k);
        let mv = if sv.is_arr() {
            clone_enumerable(&sv)
        } else if is_js_object(&sv) {
            let tv = if target.is_obj() && target.has(&k) {
                target.get(&k)
            } else if target.is_arr() {
                target.js_get(&k)
            } else {
                V::Undef
            };
            deep_merge(&tv, &sv)
        } else {
            sv
        };
        out.js_set(&k, mv);
    }
    out
}

// ---- json-schema-walker over DRAFT_07 ----

struct Walker {
    visited: HashSet<usize>,
}

fn object_of_schemas(k: &str) -> bool {
    matches!(k, "properties" | "patternProperties" | "definitions" | "dependencies")
}

fn single_schema(k: &str) -> bool {
    matches!(k, "additionalProperties" | "additionalItems" | "not" | "if" | "then" | "else" | "propertyNames" | "contains")
}

fn array_of_schemas(k: &str) -> bool {
    matches!(k, "allOf" | "anyOf" | "oneOf")
}

fn is_valid_sub_schema(v: &V) -> bool {
    matches!(v, V::Bool(_) | V::Obj(_))
}

impl Walker {
    fn subschema_walk(&mut self, schema: &V) -> R<()> {
        if !schema.is_obj() {
            return Ok(());
        }
        for kw in schema.keys() {
            let v = schema.get(&kw);
            if !v.truthy() || !is_js_object(&v) {
                continue;
            }
            if object_of_schemas(&kw) {
                for prop in js_keys(&v) {
                    if is_valid_sub_schema(&v.js_get(&prop)) {
                        self.apply(&v, &prop)?;
                    }
                }
            } else if single_schema(&kw) {
                self.apply(schema, &kw)?;
            } else if array_of_schemas(&kw) {
                self.apply_array(&v)?;
            } else if kw == "items" {
                if is_valid_sub_schema(&v) {
                    self.apply(schema, &kw)?;
                } else {
                    self.apply_array(&v)?;
                }
            }
        }
        Ok(())
    }

    fn apply_array(&mut self, v: &V) -> R<()> {
        if !v.is_arr() {
            return Ok(());
        }
        for i in 0..v.len() {
            self.apply(v, &i.to_string())?;
        }
        Ok(())
    }

    fn apply(&mut self, parent: &V, key: &str) -> R<()> {
        let el = parent.js_get(key);
        if el.is_null() {
            return Err("Invalid value used in weak set".to_string());
        }
        if !is_js_object(&el) {
            return Ok(());
        }
        if let Some(id) = el.identity() {
            if self.visited.contains(&id) {
                return Ok(());
            }
            self.visited.insert(id);
        }
        self.convert(&el)?;
        self.subschema_walk(&el)
    }
}

// ---- json-schema-to-openapi-schema convertSchema ----

fn allowed_keyword(k: &str) -> bool {
    matches!(
        k,
        "$ref" | "definitions" | "title" | "multipleOf" | "maximum" | "exclusiveMaximum" | "minimum" | "exclusiveMinimum" | "maxLength" | "minLength"
            | "pattern" | "maxItems" | "minItems" | "uniqueItems" | "maxProperties" | "minProperties" | "required" | "enum" | "type" | "not" | "allOf"
            | "oneOf" | "anyOf" | "items" | "properties" | "additionalProperties" | "description" | "format" | "default" | "nullable" | "discriminator"
            | "readOnly" | "writeOnly" | "example" | "externalDocs" | "deprecated" | "xml"
    )
}

fn valid_type(t: &str) -> bool {
    matches!(t, "null" | "boolean" | "object" | "array" | "number" | "string" | "integer")
}

impl Walker {
    fn convert(&mut self, s: &V) -> R<()> {
        if !s.is_obj() {
            return Ok(());
        }
        s.delete("$schema");
        s.delete("$id");
        s.delete("id");
        convert_types(s)?;
        if s.has("const") {
            s.set("enum", V::arr(vec![s.get("const")]));
            s.delete("const");
        }
        convert_dependencies(s);
        convert_nullable(s);
        if s.has("if") && s.get("if").truthy() && s.get("then").truthy() {
            let (if_s, then_s, else_s) = (s.get("if"), s.get("then"), s.get("else"));
            s.set(
                "oneOf",
                V::arr(vec![
                    V::of(vec![("allOf", filter_truthy(&[if_s.clone(), then_s]))]),
                    V::of(vec![("allOf", filter_truthy(&[V::of(vec![("not", if_s)]), else_s]))]),
                ]),
            );
            s.delete("if");
            s.delete("then");
            s.delete("else");
        }
        if let V::Num(f) = s.get("exclusiveMaximum") {
            s.set("maximum", V::Num(f));
            s.set("exclusiveMaximum", V::Bool(true));
        }
        if let V::Num(f) = s.get("exclusiveMinimum") {
            s.set("minimum", V::Num(f));
            s.set("exclusiveMinimum", V::Bool(true));
        }
        if let V::Arr(ex) = s.get("examples") {
            let first = ex.borrow().first().cloned();
            s.set("example", first.unwrap_or(V::Undef));
            s.delete("examples");
        }
        let pp = s.get("patternProperties");
        if pp.is_null() || is_js_object(&pp) {
            if s.has("patternProperties") {
                s.set("x-patternProperties", pp);
                s.delete("patternProperties");
                if s.get("additionalProperties").nullish() {
                    s.set("additionalProperties", V::Bool(true));
                }
            }
        }
        if s.get("type").is_str("array") && s.get("items").is_undef() {
            s.set("items", V::obj());
        }
        for k in s.keys() {
            if k.starts_with("x-") || allowed_keyword(&k) {
                continue;
            }
            s.set(&format!("x-{k}"), s.get(&k));
            s.delete(&k);
        }
        Ok(())
    }
}

fn filter_truthy(vs: &[V]) -> V {
    V::arr(vs.iter().filter(|v| v.truthy()).cloned().collect())
}

fn invalid_type(t: &V) -> String {
    format!("InvalidTypeError: Type \"{}\" is not a valid type", t.template_string())
}

fn convert_types(s: &V) -> R<()> {
    let t = s.get("type");
    if t.is_undef() {
        return Ok(());
    }
    let accepted = t.is_obj() && (t.get("$ref").truthy() || t.get("properties").truthy());
    if !accepted {
        let types: Vec<V> = if t.is_arr() { t.items() } else { vec![t.clone()] };
        for x in types {
            if !x.truthy() {
                continue;
            }
            if !x.as_str().is_some_and(valid_type) {
                return Err(invalid_type(&x));
            }
        }
    }
    if t.is_arr() {
        let mut without = Vec::new();
        let mut has_null = false;
        for x in t.items() {
            if x.is_str("null") {
                has_null = true;
            } else {
                without.push(x);
            }
        }
        if has_null {
            s.set("nullable", V::Bool(true));
        }
        match without.len() {
            0 => s.delete("type"),
            1 => {
                s.set("type", without[0].clone());
            }
            _ => {
                s.delete("type");
                s.set("anyOf", V::arr(without.into_iter().map(|x| V::of(vec![("type", x)])).collect()));
            }
        }
    } else if t.is_str("null") {
        s.delete("type");
        s.set("nullable", V::Bool(true));
    }
    Ok(())
}

fn convert_dependencies(s: &V) {
    let deps = s.get("dependencies");
    if !(deps.is_null() || is_js_object(&deps)) || !s.has("dependencies") {
        return;
    }
    s.delete("dependencies");
    let mut all_of: Vec<V> = match s.get("allOf") {
        V::Arr(a) => a.borrow().clone(),
        _ => vec![],
    };
    for key in js_keys(&deps) {
        let dep = deps.js_get(&key);
        let mut required = vec![V::str(&key)];
        if dep.is_arr() {
            required.extend(dep.items());
        } else {
            required.push(dep);
        }
        all_of.push(V::of(vec![(
            "oneOf",
            V::arr(vec![
                V::of(vec![("not", V::of(vec![("required", V::arr(vec![V::str(&key)]))]))]),
                V::of(vec![("required", V::arr(required))]),
            ]),
        )]));
    }
    s.set("allOf", V::arr(all_of));
}

fn convert_nullable(s: &V) {
    for key in ["oneOf", "anyOf"] {
        let v = s.get(key);
        if !v.truthy() {
            continue;
        }
        let V::Arr(arr) = &v else { return };
        let is_null = |item: &V| item.js_get("type").is_str("null");
        let items = arr.borrow().clone();
        if !items.iter().any(is_null) {
            return;
        }
        let filtered: Vec<V> = items.into_iter().filter(|i| !is_null(i)).collect();
        for item in &filtered {
            if item.is_obj() {
                item.set("nullable", V::Bool(true));
            }
        }
        s.set(key, V::arr(filtered));
    }
}
