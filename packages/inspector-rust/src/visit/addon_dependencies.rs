//! Port of Go `visit/addon_dependencies.go`: AddonDependencies, the
//! `pikku.uses` value of an addon's package.json.

use super::addon_json::{OJson, ojson_of_raw, parse_ojson};
use super::addon_load::{AddonDecl, Loader};
use super::addon_resolve::{find_installed_package_dir, join};
use crate::diag::codes;
use crate::remotesdk;

/// An alias an addon calls, and the package and range it was written against.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct AddonDependency {
    pub alias: String,
    pub pkg: String,
    pub rng: String,
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum DependencyForm {
    None,
    List,
    Map,
}

#[derive(Clone, Debug)]
pub(crate) struct AddonDependencies {
    pub form: DependencyForm,
    pub names: Vec<String>,
    pub dependencies: Vec<AddonDependency>,
    pub invalid: Vec<String>,
}

impl AddonDependencies {
    fn none() -> AddonDependencies {
        AddonDependencies { form: DependencyForm::None, names: vec![], dependencies: vec![], invalid: vec![] }
    }

    /// `declaredAddonNames`.
    pub(crate) fn declared_names(&self) -> Vec<String> {
        match self.form {
            DependencyForm::List => self.names.clone(),
            DependencyForm::Map => self.dependencies.iter().map(|d| d.alias.clone()).collect(),
            DependencyForm::None => vec![],
        }
    }
}

/// `^[A-Za-z][A-Za-z0-9_-]*$`.
fn is_addon_alias(s: &str) -> bool {
    let mut chars = s.chars();
    chars.next().is_some_and(|c| c.is_ascii_alphabetic())
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// `parseAddonDependencies`: the `pikku.uses` value of an addon's package.json.
pub(crate) fn parse_addon_dependencies(uses: Option<&OJson>) -> AddonDependencies {
    let Some(uses) = uses.filter(|u| u.is_js_object() || !matches!(u, OJson::Null)) else {
        return AddonDependencies::none();
    };
    if let OJson::Arr(_) = uses {
        return AddonDependencies {
            form: DependencyForm::List,
            names: uses.string_members(),
            dependencies: vec![],
            invalid: vec![],
        };
    }
    let OJson::Obj(rec) = uses else {
        return AddonDependencies {
            form: DependencyForm::Map,
            names: vec![],
            dependencies: vec![],
            invalid: vec![format!(
                "pikku.uses must be an object of {{ \"<alias>\": \"<package>@<range>\" }}, got {}.",
                uses.stringify()
            )],
        };
    };
    let mut out = AddonDependencies { form: DependencyForm::Map, names: vec![], dependencies: vec![], invalid: vec![] };
    for (alias, spec) in rec.iter() {
        if !is_addon_alias(alias) {
            out.invalid.push(format!("pikku.uses names '{alias}', which is not a valid alias. An alias starts with a letter and holds only letters, digits, '-' and '_'."));
            continue;
        }
        let Some(s) = spec.str() else {
            out.invalid.push(format!("pikku.uses.{alias} must be a string '<package>@<range>', got {}.", spec.stringify()));
            continue;
        };
        match remotesdk::parse_package(s) {
            Err(e) => out.invalid.push(format!("pikku.uses.{alias}: {e}")),
            Ok((name, rng)) if rng.is_empty() => out.invalid.push(format!("pikku.uses.{alias} is '{s}', which has no version range. Write '{name}@^1.0.0': the app that wires this addon is checked against it.")),
            Ok((pkg, rng)) => out.dependencies.push(AddonDependency { alias: alias.to_string(), pkg, rng }),
        }
    }
    out
}

/// `readAddonDependencies`.
pub(crate) fn read_addon_dependencies(package_dir: &str) -> AddonDependencies {
    let Ok(raw) = std::fs::read(join(&[package_dir, "package.json"])) else { return AddonDependencies::none() };
    let Ok(pj) = parse_ojson(&raw) else { return AddonDependencies::none() };
    parse_addon_dependencies(pj.get("pikku").and_then(|p| p.get("uses")))
}

impl Loader<'_> {
    /// `recordDeclaredUses`: the addons a wired package says it calls, written
    /// onto its declaration, and PKU348 for each one this wiring leaves
    /// unmapped.
    pub(crate) fn record_declared_uses(&mut self, ns: &str, decl: &AddonDecl, dirs: &[String]) {
        let package_dir = find_installed_package_dir(dirs, &decl.pkg);
        if package_dir.is_empty() {
            return;
        }
        let declared = read_addon_dependencies(&package_dir);
        if declared.form == DependencyForm::None {
            return;
        }
        let Some(mut o) = self.state.rpc.wire_addon_declarations.get(ns).and_then(ojson_of_raw) else { return };
        if !o.is_object() {
            return;
        }
        let mut by_alias: Vec<&AddonDependency> = Vec::new();
        if declared.form == DependencyForm::Map {
            for message in &declared.invalid {
                self.log.critical(
                    codes::ADDON_DEPENDENCY_INVALID,
                    format!("{} (wired as '{ns}'): {message}", decl.pkg),
                );
            }
            let mut deps = Vec::new();
            for d in &declared.dependencies {
                by_alias.retain(|x| x.alias != d.alias);
                by_alias.push(d);
                let mut entry = OJson::new_object();
                entry.set("alias", OJson::string(&d.alias));
                entry.set("package", OJson::string(&d.pkg));
                entry.set("range", OJson::string(&d.rng));
                deps.push(entry);
            }
            o.set("dependencies", OJson::Arr(deps));
        }
        let names = declared.declared_names();
        o.set("declaredUses", OJson::strings(names.iter().cloned()));
        self.state.rpc.wire_addon_declarations.set(ns, o.raw());

        for needed in &names {
            if decl.uses.as_ref().and_then(|u| u.get(needed)).is_some_and(|v| !v.is_empty()) {
                continue;
            }
            if let Some(d) = by_alias.iter().find(|d| &d.alias == needed) {
                self.log.critical(
                    codes::ADDON_NEEDS_NOT_MAPPED,
                    format!(
                        "{} calls {}@{} as '{needed}', but wireAddon('{ns}') does not map it. Wire {} and add uses: {{ '{needed}': '<name>' }} to this wireAddon.",
                        decl.pkg, d.pkg, d.rng, d.pkg
                    ),
                );
                continue;
            }
            self.log.critical(
                codes::ADDON_NEEDS_NOT_MAPPED,
                format!(
                    "{} needs {needed}, but wireAddon('{ns}') does not map it. Wire {needed} and add uses: {{ '{needed}': '<name>' }} to this wireAddon.",
                    decl.pkg
                ),
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_three_forms() {
        let none = parse_addon_dependencies(None);
        assert_eq!(none.form, DependencyForm::None);
        let list = parse_addon_dependencies(Some(&parse_ojson(br#"["a","b"]"#).unwrap()));
        assert_eq!((list.declared_names(), list.form), ( vec!["a".to_string(), "b".into()], DependencyForm::List));
        let map = parse_addon_dependencies(Some(
            &parse_ojson(br#"{"mail":"@s/mail@^1.0.0","bad alias":"x@1","nover":"x","num":3}"#).unwrap(),
        ));
        assert_eq!(map.dependencies, vec![AddonDependency { alias: "mail".into(), pkg: "@s/mail".into(), rng: "^1.0.0".into() }]);
        assert_eq!(map.invalid.len(), 3);
        assert!(map.invalid[0].starts_with("pikku.uses names 'bad alias'"));
        assert!(map.invalid[1].contains("which has no version range. Write 'x@^1.0.0'"));
        assert_eq!(map.invalid[2], "pikku.uses.num must be a string '<package>@<range>', got 3.");
        let scalar = parse_addon_dependencies(Some(&OJson::Num(3.0)));
        assert_eq!(scalar.invalid, vec!["pikku.uses must be an object of { \"<alias>\": \"<package>@<range>\" }, got 3.".to_string()]);
    }
}
