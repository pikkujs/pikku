//! Port of Go `visit/service_types.go`: utils/resolve-service-types.ts (with
//! resolve-core-type.ts and secret-alias-services.ts): the SingletonServices /
//! Services names finalize reads from `state.serviceTypes`.

use std::collections::HashSet;

use tsrs_ast::Node;
use tsrs_checker::{SignatureKind, Type, TypeFlags};
use tsrs_core::P;

use super::Context;
use crate::state::{PathToNameAndType, ServiceTypes};

const SECRET_SERVICE_METHODS: [&str; 5] = ["getSecret", "hasSecret", "setSecret", "deleteSecret", "getSecrets"];

impl Context<'_> {
    /// `resolveCoreType` is resolve-core-type.ts: the declared type of the first
    /// import-map entry whose type a core-type visitor recorded.
    fn resolve_core_type(&mut self, import_map: &PathToNameAndType) -> Option<P<Type>> {
        for (_, entries) in import_map.iter() {
            for e in entries {
                let Some(ty) = &e.ty else { continue };
                if let Some(ct) = self.core_types.iter().find(|ct| &ct.name == ty) {
                    let sym = ct.sym;
                    return Some(self.checker.get_declared_type_of_symbol_exported(sym));
                }
            }
        }
        None
    }

    /// `tsPropertyNames` is `type.getProperties().map((s) => s.getName())` in the
    /// order TypeScript gives: an interface's own members first, then each
    /// base's (recursively) that it does not redeclare. typescript-go lists
    /// inherited members first, so the order is rebuilt from the base types.
    fn ts_property_names(&mut self, t: P<Type>) -> Vec<String> {
        let props = self.checker.get_properties_of_type_exported(t);
        let mut names: Vec<String> = Vec::new();
        if let Some(sym) = t.symbol() {
            let decls: &[P<Node>] = sym.declarations();
            for p in props {
                let owned = p.declarations().iter().any(|d| d.parent().is_some_and(|dp| decls.contains(&dp)));
                if owned {
                    names.push(p.name().to_string());
                }
            }
        }
        let mut seen: HashSet<String> = names.iter().cloned().collect();
        if t.flags().intersects(TypeFlags::Object) {
            for base in self.checker.get_base_types_exported(t) {
                for n in self.ts_property_names(*base) {
                    if seen.insert(n.clone()) {
                        names.push(n);
                    }
                }
            }
        }
        for p in props {
            if seen.insert(p.name().to_string()) {
                names.push(p.name().to_string());
            }
        }
        names
    }

    /// `isSecretServiceType` is secret-alias-services.ts isSecretServiceType.
    fn is_secret_service_type(&mut self, t: P<Type>) -> bool {
        let non_nullable = self.checker.get_non_nullable_type(t);
        for method in SECRET_SERVICE_METHODS {
            let Some(prop) = self.checker.get_property_of_type_exported(non_nullable, method) else { return false };
            let Some(decl) = prop.value_declaration().or_else(|| prop.declarations().first().copied()) else { return false };
            let Some(pt) = self.checker.get_type_of_symbol_at_location(prop, Some(decl)) else { return false };
            if self.checker.get_signatures_of_type_exported(pt, SignatureKind::Call).is_empty() {
                return false;
            }
        }
        true
    }

    /// `findSecretAliasServices` is secret-alias-services.ts findSecretAliasServices.
    fn find_secret_alias_services(&mut self, t: P<Type>) -> Vec<String> {
        let mut aliases = Vec::new();
        for p in self.checker.get_properties_of_type_exported(t) {
            if p.name() == "secrets" {
                continue;
            }
            let Some(decl) = p.value_declaration().or_else(|| p.declarations().first().copied()) else { continue };
            let Some(pt) = self.checker.get_type_of_symbol_at_location(*p, Some(decl)) else { continue };
            if self.is_secret_service_type(pt) {
                aliases.push(p.name().to_string());
            }
        }
        aliases.sort();
        aliases
    }

    /// `FinishServiceTypes` is `state.serviceTypes = resolveServiceTypes(state,
    /// checker)`, run at the end of analysis like the TS analyzeProgram.
    pub fn finish_service_types(&mut self) {
        let singleton_map = self.state.singleton_services_type_import_map.clone();
        let services_map = self.state.wire_services_type_import_map.clone();
        let singleton = self.resolve_core_type(&singleton_map);
        let services = self.resolve_core_type(&services_map);
        let mut out = ServiceTypes { singleton_services: None, services: None, secret_aliases: vec![] };
        if let Some(s) = singleton {
            let mut names = self.ts_property_names(s);
            names.sort();
            out.singleton_services = Some(names);
            out.secret_aliases = self.find_secret_alias_services(s);
        }
        if let Some(s) = services {
            out.services = Some(self.ts_property_names(s));
        }
        self.state.service_types = Some(out);
    }
}
