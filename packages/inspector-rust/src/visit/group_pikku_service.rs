//! Port of Go `visit/group_pikku_service.go`: `export const x = pikkuService(...)`,
//! the variants it has, the keys each factory destructures from `services`
//! (needs) and the keys of each factory's return type (provides).

use tsrs_ast::{self as ast, Node};
use tsrs_checker::TypeFlags;
use tsrs_core::P;

use super::addon_json::{OJson, ojson_of_raw};
use super::util_shared::literal_key_name;
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::codes;
use crate::tsutil::{self, file_name_of, node_text};

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "addPikkuService",
        phase: Phase::Setup,
        order: order::ADD_PIKKU_SERVICE,
        visit: |c, n| c.add_pikku_service(n),
    });
}

const PIKKU_SERVICE_VARIANTS: [&str; 3] = ["dev", "deploy", "common"];

struct VariantRef {
    module: String,
    export: String,
}

fn is_function_literal(n: P<Node>) -> bool {
    ast::is_arrow_function(n) || ast::is_function_expression(n)
}

impl Context<'_> {
    /// `export const name = pikkuService(...)`. The exported name is the name a
    /// wireAddon({ services }) opts in by.
    pub fn add_pikku_service(&mut self, node: P<Node>) {
        if ast::is_call_expression(node) && self.calls_imported_definer(node.expression().unwrap(), "pikkuService") {
            let ok = node.parent().is_some_and(|p| ast::is_variable_declaration(p) && p.initializer() == Some(node));
            if !ok {
                self.log.critical(
                    codes::PIKKU_SERVICE_NOT_STATIC,
                    format!("pikkuService must be assigned to an exported const so a host can import it, got: {}", node_text(node)),
                );
            }
            return;
        }
        let Some((call, name_node)) = self.definer_declaration(node, "pikkuService") else { return };
        let local = name_node.text().to_string();
        let module = file_name_of(node).to_string();

        let Some(export) = self.module_exported_name(node, name_node) else {
            self.service_not_static(&local, &format!("'{local}' is not exported by {module}, so a host cannot import it"));
            return;
        };

        let args = call.arguments();
        if args.len() != 1 {
            self.service_not_static(&local, "pikkuService takes one argument, a factory function or an object with dev, deploy or common");
            return;
        }
        let arg = args[0];

        let mut variants = OJson::new_object();
        let mut valid = true;
        let mut has_start = false;
        let mut ref_modules: Vec<(String, String)> = Vec::new();

        if is_function_literal(arg) {
            match self.read_pikku_service_variant(&local, "common", arg) {
                Some(meta) => variants.set("common", meta),
                None => valid = false,
            }
        } else if ast::is_object_literal_expression(arg) {
            for p in arg.properties() {
                let p = *p;
                let key = if ast::is_property_assignment(p) || ast::is_method_declaration(p) { literal_key_name(p.name()) } else { None };
                let Some(key) = key else {
                    self.service_not_static(
                        &local,
                        &format!("pikkuService takes only dev, deploy, common and onServerStart as plain entries, got: {}", node_text(p)),
                    );
                    valid = false;
                    continue;
                };
                if key == "onServerStart" {
                    has_start = true;
                    continue;
                }
                if !PIKKU_SERVICE_VARIANTS.contains(&key.as_str()) {
                    self.service_not_static(&local, &format!("pikkuService takes only dev, deploy, common and onServerStart, got: {key}"));
                    valid = false;
                    continue;
                }
                let fnode = if ast::is_property_assignment(p) { p.initializer().unwrap() } else { p };
                if ast::is_identifier(fnode) {
                    let (vref, decl) = match self.resolve_service_variant(fnode) {
                        Ok(v) => v,
                        Err(problem) => {
                            self.service_not_static(&local, &format!("{key} {problem}"));
                            valid = false;
                            continue;
                        }
                    };
                    let init = decl.initializer().filter(|i| is_function_literal(*i));
                    let Some(init) = init else {
                        self.service_not_static(&local, &format!("{key} '{}' must be a const initialized with a function written inline", fnode.text()));
                        valid = false;
                        continue;
                    };
                    if let Some((_, other)) = ref_modules.iter().find(|(m, _)| *m == vref.module) {
                        self.log.critical(
                            codes::SERVICE_VARIANTS_SHARE_MODULE,
                            format!(
                                "Service '{local}': {other} and {key} are both exported from {}. Each variant lives in its own module, so a build imports only the variant it runs.",
                                vref.module
                            ),
                        );
                        valid = false;
                        continue;
                    }
                    ref_modules.push((vref.module.clone(), key.clone()));
                    match self.read_pikku_service_variant(&local, &key, init) {
                        Some(mut meta) => {
                            meta.set("module", OJson::string(&vref.module));
                            meta.set("export", OJson::string(&vref.export));
                            variants.set(&key, meta);
                        }
                        None => valid = false,
                    }
                    continue;
                }
                if !is_function_literal(fnode) && !ast::is_method_declaration(fnode) {
                    self.service_not_static(
                        &local,
                        &format!("{key} must be a function written inline or a reference to an exported const, got: {}", node_text(fnode)),
                    );
                    valid = false;
                    continue;
                }
                match self.read_pikku_service_variant(&local, &key, fnode) {
                    Some(meta) => variants.set(&key, meta),
                    None => valid = false,
                }
            }
            if valid && !variants.has("dev") && !variants.has("deploy") && !variants.has("common") {
                self.service_not_static(&local, "an object declares none of dev, deploy or common");
                valid = false;
            }
        } else {
            self.service_not_static(
                &local,
                &format!("pikkuService takes a factory function or an object with dev, deploy or common, got: {}", node_text(arg)),
            );
            return;
        }
        if !valid {
            return;
        }

        let mut meta = OJson::new_object();
        meta.set("module", OJson::string(&module));
        meta.set("export", OJson::string(&export));
        meta.set("variants", variants);
        if has_start {
            meta.set("onServerStart", OJson::Bool(true));
        }

        let mut manifest = OJson::new_object();
        if let Some(existing) = ojson_of_raw(&self.state.pikku_services)
            && existing.is_object()
        {
            manifest = existing;
        }
        if manifest.has(&export) {
            self.log.critical(
                codes::PIKKU_SERVICE_NAME_DUPLICATED,
                format!("Service '{export}' is declared twice. A service name belongs to one pikkuService export."),
            );
            return;
        }
        self.log.debug(format!("\u{2022} Found pikkuService: {export}"));
        manifest.set(&export, meta);
        self.state.pikku_services = manifest.raw();
    }

    fn service_not_static(&mut self, local: &str, msg: &str) {
        self.log.critical(codes::PIKKU_SERVICE_NOT_STATIC, format!("Service '{local}': {msg}"));
    }

    /// The module and export a host imports a variant by, with the const
    /// declaration that holds its factory, or the reason it has none.
    fn resolve_service_variant(&mut self, value: P<Node>) -> Result<(VariantRef, P<Node>), String> {
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
    /// from the return type.
    fn read_pikku_service_variant(&mut self, service: &str, variant: &str, fnode: P<Node>) -> Option<OJson> {
        let wh = format!("Service '{service}' {variant} ");
        let mut needs: Vec<String> = Vec::new();
        if let Some(param) = tsutil::param_at(fnode, 0) {
            let pattern = param.name().unwrap();
            if !ast::is_object_binding_pattern(pattern) {
                self.log.critical(
                    codes::PIKKU_SERVICE_NEEDS_NOT_STATIC,
                    format!("{wh}must destructure its services parameter, so the build can read what it depends on, got: {}", node_text(pattern)),
                );
                return None;
            }
            for e in pattern.elements() {
                let e = *e;
                if e.as_binding_element().dot_dot_dot_token().is_some() {
                    self.log.critical(
                        codes::PIKKU_SERVICE_NEEDS_NOT_STATIC,
                        format!("{wh}cannot collect services with a rest element, got: {}", node_text(e)),
                    );
                    return None;
                }
                let key = e.property_name().or_else(|| e.name());
                let Some(name) = literal_key_name(key) else {
                    self.log.critical(
                        codes::PIKKU_SERVICE_NEEDS_NOT_STATIC,
                        format!("{wh}can only destructure services by plain name, got: {}", node_text(e)),
                    );
                    return None;
                };
                if !needs.contains(&name) {
                    needs.push(name);
                }
            }
        }

        let sig = self.checker.get_signature_from_declaration_exported(fnode);
        let ret = self.checker.get_return_type_of_signature_exported(sig);
        let ret = self.unwrap_promise(ret);
        let mut provides: Vec<String> = Vec::new();
        let fl = ret.flags();
        if tsutil::is_void_like_type(ret) {
        } else if fl.intersects(TypeFlags::Any | TypeFlags::Unknown | TypeFlags::Never)
            || fl.intersects(TypeFlags::Union)
            || !fl.intersects(TypeFlags::Object | TypeFlags::Intersection)
            || !self.checker.get_index_infos_of_type_exported(ret).is_empty()
        {
            if self.options.defer_service_provides {
                // PKU372 waits for the pass that has the merged type.
            } else {
                let shown = self.type_to_string(ret);
                self.log.critical(
                    codes::PIKKU_SERVICE_PROVIDES_NOT_STATIC,
                    format!("{wh}must return an object type with known keys, so the build can read what it provides, got: {shown}"),
                );
                return None;
            }
        } else {
            for p in self.checker.get_properties_of_type_exported(ret) {
                provides.push(p.name().to_string());
            }
            // Sorted because typescript-go lists inherited members before own
            // ones, TS the reverse.
            provides.sort();
        }

        let mut meta = OJson::new_object();
        meta.set("needs", OJson::strings(needs));
        meta.set("provides", OJson::strings(provides));
        Some(meta)
    }
}

