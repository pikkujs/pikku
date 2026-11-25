//! Port of Go `visit/group_provider.go`: `export const x = defineProvider(...)`,
//! the variants it has, the keys each factory destructures from `services`
//! (needs) and the keys of each factory's return type (provides).

use tsrs_ast::{self as ast, Node};
use tsrs_ast::SymbolFlags;
use tsrs_checker::{LiteralValue, ObjectFlags, Type, TypeFlags};
use tsrs_core::P;

use super::addon_json::{OJson, ojson_of_raw};
use super::group_wire_addon::parse_string_array;
use super::util_shared::literal_key_name;
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::state::Raw;
use crate::tsutil::{self, file_name_of, node_text};

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "addProvider",
        phase: Phase::Setup,
        order: order::ADD_PROVIDER,
        visit: |c, n| c.add_provider(n),
    });
}

const PROVIDER_VARIANTS: [&str; 7] =
    ["dev", "deploy", "deploy:standalone", "deploy:cloudflare-worker", "deploy:cloudflare-container", "deploy:server", "common"];

const PROVIDER_VARIANT_LIST: &str =
    "dev, deploy, deploy:standalone, deploy:cloudflare-worker, deploy:cloudflare-container, deploy:server, common";

const PROVIDER_DEFINERS: [&str; 2] = ["defineProvider", "defineWireProvider"];

struct VariantRef {
    module: String,
    export: String,
}

fn is_function_literal(n: P<Node>) -> bool {
    ast::is_arrow_function(n) || ast::is_function_expression(n)
}

/// One variant factory of a provider, before it is read.
struct VariantSource {
    key: String,
    fnode: P<Node>,
    vref: Option<VariantRef>,
}

struct VariantRead {
    needs: Vec<String>,
    provides: Vec<String>,
    deferred: bool,
}

/// The sorted, de-duplicated strings of `name: ['a', 'b']`.
fn string_literal_array(prop: P<Node>) -> Option<Vec<String>> {
    if !ast::is_property_assignment(prop) {
        return None;
    }
    let names = parse_string_array(tsutil::unwrap_as(prop.initializer().unwrap()))?;
    let mut names = tsutil::dedupe(&names);
    names.sort();
    Some(names)
}

impl Context<'_> {
    /// `export const name = defineProvider(...)` and `defineWireProvider(...)`.
    /// The exported name is the name a wireAddon({ providers }) opts in by.
    pub fn add_provider(&mut self, node: P<Node>) {
        if ast::is_call_expression(node) {
            for definer in PROVIDER_DEFINERS {
                if !self.calls_imported_definer(node.expression().unwrap(), definer) {
                    continue;
                }
                let ok = node.parent().is_some_and(|p| ast::is_variable_declaration(p) && p.initializer() == Some(node));
                if !ok {
                    self.log.critical(
                        codes::PROVIDER_NOT_STATIC,
                        format!("{definer} must be assigned to an exported const so a host can import it, got: {}", node_text(node)),
                    );
                }
                return;
            }
            return;
        }
        let mut found = None;
        for d in PROVIDER_DEFINERS {
            if let Some(hit) = self.definer_declaration(node, d) {
                found = Some((hit, d));
                break;
            }
        }
        let Some(((call, name_node), definer)) = found else { return };
        let wire = definer == "defineWireProvider";
        let local = name_node.text().to_string();
        let module = file_name_of(node).to_string();

        let Some(export) = self.module_exported_name(node, name_node) else {
            self.provider_not_static(&local, &format!("'{local}' is not exported by {module}, so a host cannot import it"));
            return;
        };

        let args = call.arguments();
        if args.len() != 1 {
            self.provider_not_static(&local, &format!("{definer} takes one argument, a factory function or an object with a variant"));
            return;
        }
        let arg = tsutil::unwrap_as(args[0]);

        let mut sources: Vec<VariantSource> = Vec::new();
        let mut valid = true;
        let mut has_start = false;
        let mut optional: Vec<String> = Vec::new();
        let mut replaces: Vec<String> = Vec::new();
        let mut add_to: Option<P<Node>> = None;
        let mut ref_modules: Vec<(String, String)> = Vec::new();

        if is_function_literal(arg) {
            sources.push(VariantSource { key: "common".to_string(), fnode: arg, vref: None });
        } else if ast::is_object_literal_expression(arg) {
            for p in arg.properties() {
                let p = *p;
                let key = if ast::is_property_assignment(p) || ast::is_method_declaration(p) { literal_key_name(p.name()) } else { None };
                let Some(key) = key else {
                    self.provider_not_static(
                        &local,
                        &format!("{definer} takes only variants, optional, replaces, addTo and onServerStart as plain entries, got: {}", node_text(p)),
                    );
                    valid = false;
                    continue;
                };
                match key.as_str() {
                    "onServerStart" => {
                        if wire {
                            self.provider_not_static(&local, "defineWireProvider takes no onServerStart");
                            valid = false;
                            continue;
                        }
                        has_start = true;
                        continue;
                    }
                    "optional" => {
                        match string_literal_array(p) {
                            Some(names) => optional = names,
                            None => {
                                self.log.critical(
                                    codes::PROVIDER_OPTIONAL_INVALID,
                                    format!("Provider '{local}': optional must be an array of string literals, got: {}", node_text(p)),
                                );
                                valid = false;
                            }
                        }
                        continue;
                    }
                    "replaces" => {
                        match string_literal_array(p) {
                            Some(names) => replaces = names,
                            None => {
                                self.log.critical(
                                    codes::PROVIDER_REPLACES_INVALID,
                                    format!("Provider '{local}': replaces must be an array of string literals, got: {}", node_text(p)),
                                );
                                valid = false;
                            }
                        }
                        continue;
                    }
                    "addTo" => {
                        if wire {
                            self.log.critical(
                                codes::WIRE_PROVIDER_ADDS_TO_COLLECTION,
                                format!("Wire provider '{local}' cannot addTo a collection: collections are built once, per process."),
                            );
                            valid = false;
                            continue;
                        }
                        if ast::is_property_assignment(p) {
                            add_to = Some(tsutil::unwrap_as(p.initializer().unwrap()));
                        } else {
                            self.log.critical(
                                codes::PROVIDER_COLLECTION_INVALID,
                                format!("Provider '{local}': addTo must be a collection declared with defineProviderCollection, got: {}", node_text(p)),
                            );
                            valid = false;
                        }
                        continue;
                    }
                    _ => {}
                }
                if !PROVIDER_VARIANTS.contains(&key.as_str()) {
                    if key.starts_with("deploy:") {
                        self.log.critical(
                            codes::PROVIDER_PROFILE_UNKNOWN,
                            format!("Provider '{local}': '{key}' is not a variant. Variants: {PROVIDER_VARIANT_LIST}."),
                        );
                    } else {
                        self.provider_not_static(
                            &local,
                            &format!("{definer} takes only dev, deploy, deploy:<profile>, common, optional, replaces, addTo and onServerStart, got: {key}"),
                        );
                    }
                    valid = false;
                    continue;
                }
                let fnode = if ast::is_property_assignment(p) { tsutil::unwrap_as(p.initializer().unwrap()) } else { p };
                if ast::is_identifier(fnode) {
                    let (vref, decl) = match self.resolve_provider_variant(fnode) {
                        Ok(v) => v,
                        Err(problem) => {
                            self.provider_not_static(&local, &format!("{key} {problem}"));
                            valid = false;
                            continue;
                        }
                    };
                    let init = decl.initializer().filter(|i| is_function_literal(*i));
                    let Some(init) = init else {
                        self.provider_not_static(&local, &format!("{key} '{}' must be a const initialized with a function written inline", fnode.text()));
                        valid = false;
                        continue;
                    };
                    if let Some((_, other)) = ref_modules.iter().find(|(m, _)| *m == vref.module) {
                        self.log.critical(
                            codes::PROVIDER_VARIANTS_SHARE_MODULE,
                            format!(
                                "Provider '{local}': {other} and {key} are both exported from {}. Each variant lives in its own module, so a build imports only the variant it runs.",
                                vref.module
                            ),
                        );
                        valid = false;
                        continue;
                    }
                    ref_modules.push((vref.module.clone(), key.clone()));
                    sources.push(VariantSource { key, fnode: init, vref: Some(vref) });
                    continue;
                }
                if !is_function_literal(fnode) && !ast::is_method_declaration(fnode) {
                    self.provider_not_static(
                        &local,
                        &format!("{key} must be a function written inline or a reference to an exported const, got: {}", node_text(fnode)),
                    );
                    valid = false;
                    continue;
                }
                sources.push(VariantSource { key, fnode, vref: None });
            }
            if valid && sources.is_empty() {
                self.provider_not_static(&local, "an object declares no variant");
                valid = false;
            }
        } else {
            self.provider_not_static(
                &local,
                &format!("{definer} takes a factory function or an object with a variant, got: {}", node_text(arg)),
            );
            return;
        }

        let mut collection = String::new();
        if let Some(expr) = add_to {
            match self.collection_name_of(expr) {
                Ok(name) => collection = name,
                Err(shown) => {
                    self.log.critical(
                        codes::PROVIDER_COLLECTION_INVALID,
                        format!("Provider '{local}': addTo must be a collection declared with defineProviderCollection, got: {shown}"),
                    );
                    valid = false;
                }
            }
        }
        if !valid {
            return;
        }

        let mut variants = OJson::new_object();
        let mut reads: Vec<(String, VariantRead)> = Vec::new();
        for src in &sources {
            let Some((mut meta, read)) = self.read_provider_variant(&local, &src.key, src.fnode, !collection.is_empty(), &optional) else {
                valid = false;
                continue;
            };
            if let Some(vref) = &src.vref {
                meta.set("module", OJson::string(&vref.module));
                meta.set("export", OJson::string(&vref.export));
            }
            variants.set(&src.key, meta);
            reads.push((src.key.clone(), read));
        }
        if !valid {
            return;
        }

        let mut used: Vec<&str> = Vec::new();
        let mut provided: Vec<&str> = Vec::new();
        let mut any_deferred = false;
        for (key, r) in &reads {
            any_deferred |= r.deferred;
            used.extend(r.needs.iter().map(String::as_str));
            provided.extend(r.provides.iter().map(String::as_str));
            if collection.is_empty() && r.provides.is_empty() && !r.deferred {
                self.log.critical(
                    codes::PROVIDER_PROVIDES_NOTHING,
                    format!(
                        "Provider '{local}' {key} provides no key and adds to no collection, so nothing could ever select it. Return an object of the keys it provides, or give it addTo."
                    ),
                );
                valid = false;
            }
        }
        for k in &optional {
            if !used.contains(&k.as_str()) {
                self.log.critical(
                    codes::PROVIDER_OPTIONAL_INVALID,
                    format!("Provider '{local}': optional lists '{k}', which no variant destructures"),
                );
                valid = false;
            }
        }
        for k in &replaces {
            if !provided.contains(&k.as_str()) && !any_deferred {
                self.log.critical(
                    codes::PROVIDER_REPLACES_INVALID,
                    format!("Provider '{local}': replaces lists '{k}', which no variant provides"),
                );
                valid = false;
            }
        }
        if !valid {
            return;
        }

        let mut meta = OJson::new_object();
        meta.set("kind", OJson::string(if wire { "wire" } else { "singleton" }));
        meta.set("module", OJson::string(&module));
        meta.set("export", OJson::string(&export));
        meta.set("variants", variants);
        if !collection.is_empty() {
            meta.set("addTo", OJson::string(&collection));
        }
        if !replaces.is_empty() {
            meta.set("replaces", OJson::strings(replaces));
        }
        if has_start {
            meta.set("onServerStart", OJson::Bool(true));
        }

        let mut manifest = OJson::new_object();
        if let Some(existing) = ojson_of_raw(&self.state.providers)
            && existing.is_object()
        {
            manifest = existing;
        }
        if manifest.has(&export) {
            self.log.critical(
                codes::PROVIDER_NAME_DUPLICATED,
                format!("Provider '{export}' is declared twice. A provider name belongs to one export."),
            );
            return;
        }
        self.log.debug(format!("\u{2022} Found {definer}: {export}"));
        manifest.set(&export, meta);
        self.state.providers = manifest.raw();
    }

    /// The name in the type of an addTo value, `ProviderCollection<'name',
    /// Item>`, so a collection declared in a .d.ts reads the same as one
    /// declared in source. The error is the type's text.
    fn collection_name_of(&mut self, expr: P<Node>) -> Result<String, String> {
        let t = self.checker.get_type_at_location(expr);
        if t.flags().intersects(TypeFlags::Object) && t.object_flags().intersects(ObjectFlags::Reference) {
            if t.symbol().is_some_and(|s| s.name() == "ProviderCollection") {
                let args = self.checker.get_type_arguments_exported(t);
                if let Some(first) = args.first()
                    && first.flags().intersects(TypeFlags::StringLiteral)
                    && let Some(LiteralValue::String(v)) = first.as_literal_type().value()
                {
                    return Ok(v.to_string());
                }
            }
        }
        Err(self.type_to_string(t))
    }

    fn provider_not_static(&mut self, local: &str, msg: &str) {
        self.log.critical(codes::PROVIDER_NOT_STATIC, format!("Provider '{local}': {msg}"));
    }

    /// The module and export a host imports a variant by, with the const
    /// declaration that holds its factory, or the reason it has none.
    fn resolve_provider_variant(&mut self, value: P<Node>) -> Result<(VariantRef, P<Node>), String> {
        let s = self.symbol_at(value);
        let sym = self.resolve_alias(s);
        let decl = sym.and_then(|s| s.value_declaration().or_else(|| tsutil::first_decl(Some(s))));
        let Some(decl) = decl.filter(|d| ast::is_variable_declaration(*d) && ast::is_identifier(d.name().unwrap())) else {
            return Err(format!("'{}' does not resolve to a const declaration", value.text()));
        };
        let file = file_name_of(decl).to_string();
        let Some(exported) = self.module_exported_name(decl, decl.name().unwrap()) else {
            return Err(format!("'{}' is not exported by {file}, so a host cannot import it", value.text()));
        };
        Ok((VariantRef { module: file, export: exported }, decl))
    }

    /// One factory: needs from the destructured `services` parameter, provides
    /// from the return type. A collection item has no provides: its return
    /// value is the item.
    fn read_provider_variant(
        &mut self,
        provider: &str,
        variant: &str,
        fnode: P<Node>,
        item: bool,
        optional: &[String],
    ) -> Option<(OJson, VariantRead)> {
        let wh = format!("Provider '{provider}' {variant} ");
        let mut needs: Vec<String> = Vec::new();
        if let Some(param) = tsutil::param_at(fnode, 0) {
            let pattern = param.name().unwrap();
            if ast::is_identifier(pattern) && self.parameter_unused(fnode, pattern) {
            } else if !ast::is_object_binding_pattern(pattern) {
                self.log.critical(
                    codes::PROVIDER_NEEDS_NOT_STATIC,
                    format!("{wh}must destructure its services parameter, so the build can read what it depends on, got: {}", node_text(pattern)),
                );
                return None;
            } else {
                for e in pattern.elements() {
                    let e = *e;
                    if e.as_binding_element().dot_dot_dot_token().is_some() {
                        self.log.critical(
                            codes::PROVIDER_NEEDS_NOT_STATIC,
                            format!("{wh}cannot collect services with a rest element, got: {}", node_text(e)),
                        );
                        return None;
                    }
                    let key = e.property_name().or_else(|| e.name());
                    let Some(name) = literal_key_name(key) else {
                        self.log.critical(
                            codes::PROVIDER_NEEDS_NOT_STATIC,
                            format!("{wh}can only destructure services by plain name, got: {}", node_text(e)),
                        );
                        return None;
                    };
                    if !needs.contains(&name) {
                        needs.push(name);
                    }
                }
            }
        }

        let mut provides: Vec<String> = Vec::new();
        let mut optional_provides: Vec<String> = Vec::new();
        let mut deferred = false;
        if !item {
            let sig = self.checker.get_signature_from_declaration_exported(fnode);
            let ret = self.checker.get_return_type_of_signature_exported(sig);
            let ret = self.unwrap_promise(ret);
            match self.returned_keys(ret) {
                Some((keys, optional_keys)) => {
                    provides = keys;
                    optional_provides = optional_keys;
                }
                None if self.options.defer_provider_provides => deferred = true,
                None => {
                    let shown = self.type_to_string(ret);
                    self.log.critical(
                        codes::PROVIDER_PROVIDES_NOT_STATIC,
                        format!("{wh}must return an object type with known keys (or a union of them), so the build can read what it provides, got: {shown}"),
                    );
                    return None;
                }
            }
        }

        let mut needs_optional: Vec<String> = needs.iter().filter(|n| optional.contains(n)).cloned().collect();
        needs_optional.sort();

        let mut meta = OJson::new_object();
        meta.set("needs", OJson::strings(needs.clone()));
        meta.set("optional", OJson::strings(needs_optional));
        meta.set("provides", OJson::strings(provides.clone()));
        meta.set("optionalProvides", OJson::strings(optional_provides));
        Some((meta, VariantRead { needs, provides, deferred }))
    }

    /// The keys of a factory's return type: an object with known keys, or a
    /// union whose members all are. A key is optional when it is declared `?:`
    /// or missing from a member. `None` when the type is anything else.
    pub(crate) fn returned_keys(&mut self, ret: P<Type>) -> Option<(Vec<String>, Vec<String>)> {
        if tsutil::is_void_like_type(ret) {
            return Some((vec![], vec![]));
        }
        let members: Vec<P<Type>> = if ret.flags().intersects(TypeFlags::Union) { ret.types().to_vec() } else { vec![ret] };
        for m in &members {
            let fl = m.flags();
            if fl.intersects(TypeFlags::Any | TypeFlags::Unknown | TypeFlags::Never)
                || !fl.intersects(TypeFlags::Object | TypeFlags::Intersection)
                || !self.checker.get_index_infos_of_type_exported(*m).is_empty()
            {
                return None;
            }
        }
        let mut seen: Vec<(String, usize, bool)> = Vec::new();
        for m in &members {
            for p in self.checker.get_properties_of_type_exported(*m) {
                let is_optional = p.flags().intersects(SymbolFlags::Optional);
                match seen.iter_mut().find(|(n, _, _)| n == p.name()) {
                    Some(entry) => {
                        entry.1 += 1;
                        entry.2 |= is_optional;
                    }
                    None => seen.push((p.name().to_string(), 1, is_optional)),
                }
            }
        }
        // Sorted because typescript-go lists inherited members before own
        // ones, TS the reverse.
        let mut provides: Vec<String> = seen.iter().map(|(n, _, _)| n.clone()).collect();
        let mut optional: Vec<String> = seen.iter().filter(|(_, c, o)| *o || *c < members.len()).map(|(n, _, _)| n.clone()).collect();
        provides.sort();
        optional.sort();
        Some((provides, optional))
    }

    /// `{ keys, optional }` of a factory's return type, or empty when the type
    /// has no readable keys.
    pub(crate) fn factory_provided(&mut self, fnode: P<Node>) -> Raw {
        let sig = self.checker.get_signature_from_declaration_exported(fnode);
        let ret = self.checker.get_return_type_of_signature_exported(sig);
        let ret = self.unwrap_promise(ret);
        let Some((keys, optional)) = self.returned_keys(ret) else { return Raw::default() };
        let mut out = OJson::new_object();
        out.set("keys", OJson::strings(keys));
        out.set("optional", OJson::strings(optional));
        out.raw()
    }

    /// Whether nothing in the factory's body refers to the parameter `name`.
    fn parameter_unused(&mut self, fnode: P<Node>, name: P<Node>) -> bool {
        let Some(body) = fnode.body() else { return true };
        let sym = self.symbol_at(name);
        let mut hits: Vec<P<Node>> = Vec::new();
        tsutil::walk_self(body, &mut |n| {
            if ast::is_identifier(n) && n.text() == name.text() {
                hits.push(n);
            }
        });
        for n in hits {
            let got = match n.parent() {
                Some(parent) if ast::is_shorthand_property_assignment(parent) && parent.name() == Some(n) => {
                    self.checker.get_shorthand_assignment_value_symbol(Some(parent))
                }
                _ => self.symbol_at(n),
            };
            if got == sym {
                return false;
            }
        }
        true
    }
}
