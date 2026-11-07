//! Port of Go `visit/group_pikku_studio.go`: add/add-pikku-studio.ts and its
//! post-sweep `validatePikkuStudio`.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use regex::Regex;
use serde_json::{Map, Value};
use tsrs_ast::{self as ast, Kind, Node};
use tsrs_core::P;

use super::util_shared::wiring_call;
use super::util_wire_meta::num_value;
use super::{Context, Phase, Registry, Visitor, order};
use crate::diag::{Logger, codes};
use crate::state::Raw;
use crate::tsutil::{file_name_of, node_text};

pub fn register(r: &mut Registry) {
    r.register(Visitor { name: "addPikkuStudio", phase: Phase::Setup, order: order::ADD_PIKKU_STUDIO, visit: |c, n| c.add_pikku_studio(n) });
}

const STUDIO_SCOPES: [&str; 3] = ["studio", "team", "project"];
const STUDIO_NAV_AREAS: [&str; 4] = ["rail", "team", "project", "account"];

/// `propKey` (group_wire_addon.go): a property assignment keyed by an
/// identifier or string literal.
fn prop_key(p: P<Node>) -> Option<String> {
    if !ast::is_property_assignment(p) {
        return None;
    }
    let n = p.name()?;
    if ast::is_identifier(n) || ast::is_string_literal(n) { Some(n.text().to_string()) } else { None }
}

/// `parseStringArray` (group_wire_addon.go): an array of string literals.
fn parse_string_array(n: P<Node>) -> Option<Vec<String>> {
    if !ast::is_array_literal_expression(n) {
        return None;
    }
    let mut out = Vec::new();
    for e in n.elements() {
        if !ast::is_string_literal(*e) {
            return None;
        }
        out.push(e.text().to_string());
    }
    Some(out)
}

/// The specifier of `() => import('<literal>')`.
fn lazy_import_specifier(n: P<Node>) -> String {
    if !ast::is_arrow_function(n) {
        return String::new();
    }
    let Some(body) = n.body() else { return String::new() };
    if !ast::is_call_expression(body) || body.expression().unwrap().kind() != Kind::ImportKeyword {
        return String::new();
    }
    let args = body.arguments();
    if !args.is_empty() && ast::is_string_literal(args[0]) {
        return args[0].text().to_string();
    }
    String::new()
}

fn studio_one_of(n: P<Node>, values: &[&str]) -> Option<String> {
    if !ast::is_string_literal(n) {
        return None;
    }
    values.iter().find(|v| **v == n.text()).map(|v| v.to_string())
}

fn studio_bool(n: P<Node>) -> Option<bool> {
    match n.kind() {
        Kind::TrueKeyword => Some(true),
        Kind::FalseKeyword => Some(false),
        _ => None,
    }
}

fn studio_number(n: P<Node>) -> Option<f64> {
    let parse = |t: &str| t.parse::<f64>().ok();
    if ast::is_numeric_literal(n) {
        return parse(n.text());
    }
    if ast::is_prefix_unary_expression(n) {
        let pu = n.as_prefix_unary_expression();
        if pu.operator() == Kind::MinusToken && ast::is_numeric_literal(pu.operand()) {
            return parse(pu.operand().text()).map(|f| -f);
        }
    }
    None
}

fn quoted_list(values: &[&str]) -> String {
    values.iter().map(|v| format!("'{v}'")).collect::<Vec<_>>().join(", ")
}

/// The object sets `key` to a string literal (which may be empty).
fn has_string_literal_prop(obj: P<Node>, key: &str) -> bool {
    obj.properties().iter().any(|f| prop_key(*f).as_deref() == Some(key) && ast::is_string_literal(f.initializer().unwrap()))
}

fn read_studio_nav(n: P<Node>, fails: &mut Vec<String>) -> Option<Map<String, Value>> {
    if !ast::is_object_literal_expression(n) {
        fails.push(format!("A screen's nav must be an object literal, got: {}", node_text(n)));
        return None;
    }
    let (mut area, mut icon) = (String::new(), String::new());
    let mut badge: Option<String> = None;
    let mut order: Option<f64> = None;
    let mut ok = true;
    for f in n.properties() {
        let f = *f;
        let key = match prop_key(f) {
            Some(k) if !k.is_empty() => k,
            _ => {
                fails.push(format!("A screen's nav field must be a literal, got: {}", node_text(f)));
                ok = false;
                continue;
            }
        };
        let v = f.initializer().unwrap();
        let read = match key.as_str() {
            "area" => match studio_one_of(v, &STUDIO_NAV_AREAS) {
                Some(a) => {
                    area = a;
                    true
                }
                None => {
                    area = String::new();
                    false
                }
            },
            "icon" => {
                let r = ast::is_string_literal(v);
                if r {
                    icon = v.text().to_string();
                }
                r
            }
            "order" => match studio_number(v) {
                Some(num) => {
                    order = Some(num);
                    true
                }
                None => false,
            },
            "badge" => {
                let r = ast::is_string_literal(v);
                if r {
                    badge = Some(v.text().to_string());
                }
                r
            }
            _ => continue,
        };
        if !read {
            let expected = if key == "area" { format!("one of {}", quoted_list(&STUDIO_NAV_AREAS)) } else { "a literal".to_string() };
            fails.push(format!("A screen's nav {key} must be {expected}, got: {}", node_text(v)));
            ok = false;
        }
    }
    if !ok {
        return None;
    }
    if area.is_empty() || !has_string_literal_prop(n, "icon") || order.is_none() {
        fails.push(format!("A screen's nav needs a literal area, icon and order: {}", node_text(n)));
        return None;
    }
    let mut o = Map::new();
    o.insert("area".into(), Value::from(area));
    o.insert("icon".into(), Value::from(icon));
    o.insert("order".into(), num_value(order.unwrap()));
    if let Some(b) = badge {
        o.insert("badge".into(), Value::from(b));
    }
    Some(o)
}

fn read_studio_screen(el: P<Node>, fails: &mut Vec<String>) -> Option<(Map<String, Value>, String)> {
    if !ast::is_object_literal_expression(el) {
        fails.push(format!("A definePlugin screen must be an object literal, got: {}", node_text(el)));
        return None;
    }
    let (mut path, mut title, mut scope, mut layout, mut component, mut app) =
        (String::new(), String::new(), String::new(), String::new(), String::new(), String::new());
    let mut agent: Option<String> = None;
    let mut nav: Option<Map<String, Value>> = None;
    let (mut replaces, mut needs_app, mut default_chat): (Option<bool>, Option<bool>, Option<bool>) = (None, None, None);
    let mut scopes: Option<Vec<String>> = None;
    let mut ok = true;
    for f in el.properties() {
        let f = *f;
        let key = match prop_key(f) {
            Some(k) if !k.is_empty() => k,
            _ => {
                fails.push(format!("A screen's field must be a literal, got: {}", node_text(f)));
                ok = false;
                continue;
            }
        };
        let v = f.initializer().unwrap();
        let read = match key.as_str() {
            "path" => {
                let r = ast::is_string_literal(v);
                if r {
                    path = v.text().to_string();
                }
                r
            }
            "title" => {
                let r = ast::is_string_literal(v);
                if r {
                    title = v.text().to_string();
                }
                r
            }
            "scope" => {
                scope = studio_one_of(v, &STUDIO_SCOPES).unwrap_or_default();
                !scope.is_empty()
            }
            "nav" => {
                match read_studio_nav(v, fails) {
                    Some(n) => nav = Some(n),
                    None => ok = false,
                }
                continue;
            }
            "replaces" => {
                replaces = studio_bool(v);
                replaces.is_some()
            }
            "needsApp" => {
                needs_app = studio_bool(v);
                needs_app.is_some()
            }
            "defaultChat" => {
                default_chat = studio_bool(v);
                default_chat.is_some()
            }
            "agent" => {
                let r = ast::is_string_literal(v);
                if r {
                    agent = Some(v.text().to_string());
                }
                r
            }
            "layout" => {
                layout = studio_one_of(v, &["bare"]).unwrap_or_default();
                !layout.is_empty()
            }
            "scopes" => {
                scopes = parse_string_array(v);
                if scopes.is_none() {
                    fails.push(format!("A screen's scopes must be an array of string literals, got: {}", node_text(v)));
                    ok = false;
                }
                continue;
            }
            "component" => {
                component = lazy_import_specifier(v);
                if component.is_empty() {
                    fails.push(format!("A screen's component must be () => import('<literal>'), got: {}", node_text(v)));
                    ok = false;
                }
                continue;
            }
            "app" => {
                let r = ast::is_string_literal(v);
                if r {
                    app = v.text().to_string();
                }
                r
            }
            _ => continue,
        };
        if !read {
            let expected = match key.as_str() {
                "scope" => format!("one of {}", quoted_list(&STUDIO_SCOPES)),
                "layout" => "'bare'".to_string(),
                _ => "a literal".to_string(),
            };
            fails.push(format!("A screen's {key} must be {expected}, got: {}", node_text(v)));
            ok = false;
        }
    }
    if !ok {
        return None;
    }
    if path.is_empty() || title.is_empty() || scope.is_empty() || (component.is_empty() && app.is_empty()) {
        fails.push(format!(
            "A definePlugin screen needs a literal path, title and scope, and either a lazy component or an app: {}",
            node_text(el)
        ));
        return None;
    }
    if !component.is_empty() && !app.is_empty() {
        fails.push(format!("Screen '{path}' sets both component and app; a screen is one or the other"));
        return None;
    }
    let mut o = Map::new();
    o.insert("path".into(), Value::from(path.as_str()));
    o.insert("title".into(), Value::from(title));
    o.insert("scope".into(), Value::from(scope));
    if let Some(n) = nav {
        o.insert("nav".into(), Value::Object(n));
    }
    if let Some(b) = replaces {
        o.insert("replaces".into(), Value::Bool(b));
    }
    if let Some(b) = needs_app {
        o.insert("needsApp".into(), Value::Bool(b));
    }
    if !layout.is_empty() {
        o.insert("layout".into(), Value::from(layout));
    }
    if let Some(s) = scopes {
        o.insert("scopes".into(), super::util_shared::strs_value(&s));
    }
    if let Some(a) = agent {
        o.insert("agent".into(), Value::from(a));
    }
    if let Some(b) = default_chat {
        o.insert("defaultChat".into(), Value::Bool(b));
    }
    if !component.is_empty() {
        o.insert("component".into(), Value::from(component));
    } else {
        o.insert("app".into(), Value::from(app));
    }
    Some((o, path))
}

impl Context<'_> {
    pub fn add_pikku_studio(&mut self, node: P<Node>) {
        let Some(obj) = wiring_call(node, "definePlugin") else { return };
        let mut fails: Vec<String> = Vec::new();
        let mut title = String::new();
        let mut screens: Vec<Value> = Vec::new();
        let mut paths: Vec<String> = Vec::new();
        for p in obj.properties() {
            let p = *p;
            let key = match prop_key(p) {
                Some(k) if !k.is_empty() => k,
                _ => {
                    fails.push(format!("A definePlugin field must be a literal, got: {}", node_text(p)));
                    continue;
                }
            };
            let init = p.initializer().unwrap();
            match key.as_str() {
                "title" => {
                    if ast::is_string_literal(init) {
                        title = init.text().to_string();
                    } else {
                        fails.push(format!("definePlugin's title must be a literal, got: {}", node_text(init)));
                    }
                }
                "screens" => {
                    if !ast::is_array_literal_expression(init) {
                        fails.push(format!("definePlugin's screens must be an array literal, got: {}", node_text(init)));
                        continue;
                    }
                    for el in init.elements() {
                        if let Some((sc, path)) = read_studio_screen(*el, &mut fails) {
                            screens.push(Value::Object(sc));
                            paths.push(path);
                        }
                    }
                }
                _ => {}
            }
        }
        if title.is_empty() {
            fails.push("definePlugin needs a literal title".to_string());
        }
        for m in fails {
            self.log.critical(codes::ADDON_SCREENS_NOT_STATIC, m);
        }
        if title.is_empty() {
            return;
        }
        let mut seen: HashSet<&str> = HashSet::new();
        for path in &paths {
            if !seen.insert(path.as_str()) {
                self.log.critical(
                    codes::STUDIO_SCREEN_PATH_DUPLICATE,
                    format!("definePlugin declares two screens at '{path}'; each screen needs its own path"),
                );
            }
        }
        self.log.debug(format!("\u{2022} Found definePlugin: {title} ({} screens)", screens.len()));
        let mut o = Map::new();
        o.insert("title".into(), Value::from(title));
        o.insert("file".into(), Value::from(file_name_of(node)));
        o.insert("screens".into(), Value::Array(screens));
        self.state.studio = Raw::of(Value::Object(o));
    }
}

/// The directory of the nearest package.json above `file`.
fn studio_package_root(file: &str) -> Option<PathBuf> {
    let mut dir = Path::new(file).parent()?.to_path_buf();
    loop {
        if std::fs::metadata(dir.join("package.json")).is_ok() {
            return Some(dir);
        }
        match dir.parent() {
            Some(p) if p != dir => dir = p.to_path_buf(),
            _ => return None,
        }
    }
}

/// `json.Unmarshal` into a `map[string]json.RawMessage`: an object (or `null`,
/// which gives a nil map).
fn read_studio_catalog(file: &Path) -> Option<Map<String, Value>> {
    let b = std::fs::read(file).ok()?;
    match serde_json::from_slice::<Value>(&b).ok()? {
        Value::Object(m) => Some(m),
        Value::Null => Some(Map::new()),
        _ => None,
    }
}

/// The package's "files" list; `None` when it has none: what npm then publishes
/// depends on .npmignore or .gitignore, which are not read here.
fn studio_package_files(root: &Path) -> Option<Vec<String>> {
    let pkg = read_studio_catalog(&root.join("package.json"))?;
    let entries = pkg.get("files")?.as_array()?;
    Some(entries.iter().filter_map(|e| e.as_str().map(str::to_string)).collect())
}

fn studio_files_include(files: &[String], dir: &str) -> bool {
    files.iter().any(|e| e == dir || e.starts_with(&format!("{dir}/")))
}

/// Whether the package has a skills/<name>/SKILL.md.
fn studio_has_skills(root: &Path) -> bool {
    let dir = root.join("skills");
    let Ok(entries) = std::fs::read_dir(&dir) else { return false };
    for e in entries.flatten() {
        if !e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        if std::fs::metadata(dir.join(e.file_name()).join("SKILL.md")).is_ok() {
            return true;
        }
    }
    false
}

impl Context<'_> {
    /// Go `ValidatePikkuStudio` (validatePikkuStudio), run after the setup sweep.
    pub fn validate_pikku_studio(&mut self) {
        let Some(Value::Object(studio)) = self.state.studio.value().cloned() else { return };
        let title = studio.get("title").and_then(Value::as_str).unwrap_or("").to_string();
        let file = studio.get("file").and_then(Value::as_str).unwrap_or("").to_string();
        let mut screens: Vec<Value> = studio.get("screens").and_then(Value::as_array).cloned().unwrap_or_default();

        let mut keys: Vec<String> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();
        let screen_titles = screens.iter().map(|s| s.get("title").and_then(Value::as_str).unwrap_or("").to_string());
        for key in std::iter::once(title.clone()).chain(screen_titles) {
            if seen.insert(key.clone()) {
                keys.push(key);
            }
        }
        let root = studio_package_root(&file);
        let mut messages_dir: Option<PathBuf> = None;
        let mut files: Vec<String> = Vec::new();
        let mut has_files = false;
        if let Some(r) = &root {
            messages_dir = Some(r.join("messages"));
            if let Some(f) = studio_package_files(r) {
                files = f;
                has_files = true;
            }
        }
        let en: Map<String, Value> = messages_dir.as_ref().and_then(|d| read_studio_catalog(&d.join("en.json"))).unwrap_or_default();
        for key in &keys {
            if !en.contains_key(key) {
                self.log.critical(
                    codes::STUDIO_MESSAGE_KEY_MISSING,
                    format!("definePlugin uses the message key '{key}', which is missing from the addon's messages/en.json"),
                );
            }
        }
        let mut patched = false;
        for i in 0..screens.len() {
            let screen_path = screens[i].get("path").and_then(Value::as_str).unwrap_or("").to_string();
            let agent = screens[i].get("agent").and_then(Value::as_str).map(str::to_string);
            if let Some(agent) = agent {
                let (extra, agent_keys, agent_valid) = Self::validate_studio_agent(self.log, &screen_path, &agent, root.as_deref(), &en);
                for key in agent_keys {
                    if seen.insert(key.clone()) {
                        keys.push(key);
                    }
                }
                if !extra.is_empty() {
                    if let Value::Object(m) = &mut screens[i] {
                        for (k, v) in extra {
                            m.insert(k, Value::from(v));
                        }
                        patched = true;
                    }
                }
                if agent_valid && !agent.starts_with("studio:") && has_files && !studio_files_include(&files, "agents") {
                    self.log.critical(
                        codes::STUDIO_PACKAGE_FILES_MISSING,
                        format!(
                            "Screen '{screen_path}' has the agent '{agent}', but package.json \"files\" does not list agents/; add \"agents\" to it so the published addon ships the agent"
                        ),
                    );
                }
            }
            let badge = screens[i].get("nav").and_then(|n| n.get("badge")).and_then(Value::as_str).map(str::to_string);
            let Some(badge) = badge else { continue };
            if !self.state.functions.meta.has(&badge) {
                self.log.critical(
                    codes::STUDIO_BADGE_FUNCTION_NOT_FOUND,
                    format!("Screen '{screen_path}' has the nav badge '{badge}', which names no function in this addon"),
                );
            }
        }
        if let Some(r) = &root {
            if has_files && !studio_files_include(&files, "skills") && studio_has_skills(r) {
                self.log.critical(
                    codes::STUDIO_PACKAGE_FILES_MISSING,
                    "The addon ships skills/ but package.json \"files\" does not list it; add \"skills\" to it so the published addon ships its skills",
                );
            }
        }
        if let Some(dir) = &messages_dir {
            if let Ok(entries) = std::fs::read_dir(dir) {
                let mut names: Vec<String> = entries
                    .flatten()
                    .map(|e| e.file_name().to_string_lossy().into_owned())
                    .filter(|n| n.ends_with(".json") && n != "en.json")
                    .collect();
                names.sort();
                for name in names {
                    let catalog = read_studio_catalog(&dir.join(&name)).unwrap_or_default();
                    for key in &keys {
                        if !catalog.contains_key(key) {
                            self.log.warn(format!(
                                "definePlugin uses the message key '{key}', which is missing from the addon's messages/{name}"
                            ));
                        }
                    }
                }
            }
        }
        if patched {
            let mut o = Map::new();
            o.insert("title".into(), Value::from(title));
            o.insert("file".into(), Value::from(file));
            o.insert("screens".into(), Value::Array(screens));
            self.state.studio = Raw::of(Value::Object(o));
        }
    }

    /// The agent branch of validatePikkuStudio. Returns the `agentTitle` /
    /// `agentDescription` members to append to the screen (each one only when
    /// its key is in en.json), the frontmatter's message keys, for the
    /// other-locale check, and whether the agent drew no PKU365.
    fn validate_studio_agent(
        log: &mut Logger,
        screen_path: &str,
        agent: &str,
        root: Option<&Path>,
        en: &Map<String, Value>,
    ) -> (Vec<(String, String)>, Vec<String>, bool) {
        let agent_ref = Regex::new(r"^studio:[a-z][a-z0-9-]*$").unwrap();
        let agent_name = Regex::new(r"^[a-z][a-z0-9-]*$").unwrap();
        let frontmatter = Regex::new(r"(?s)^---\r?\n(.*?)\r?\n---(?:\r?\n|$)").unwrap();
        let frontmatter_line = Regex::new(r"^([A-Za-z][A-Za-z0-9_-]*):[\t\n\f\r ]*(.*?)[\t\n\f\r ]*$").unwrap();

        let invalid = |log: &mut Logger, reason: String| {
            log.critical(codes::STUDIO_SCREEN_AGENT_INVALID, format!("Screen '{screen_path}' has the agent '{agent}', {reason}"));
        };
        let bad_agent = "which is not a valid agent: use a name for an agent the addon ships (lowercase letters, digits and hyphens, starting with a letter) or 'studio:<name>' for one Studio ships";
        if agent.starts_with("studio:") {
            // An agent Studio ships: only the format can be checked.
            if !agent_ref.is_match(agent) {
                invalid(log, bad_agent.to_string());
                return (Vec::new(), Vec::new(), false);
            }
            return (Vec::new(), Vec::new(), true);
        }
        if !agent_name.is_match(agent) {
            invalid(log, bad_agent.to_string());
            return (Vec::new(), Vec::new(), false);
        }
        let mut text = String::new();
        if let Some(r) = root {
            if let Ok(b) = std::fs::read(r.join("agents").join(format!("{agent}.md"))) {
                text = String::from_utf8_lossy(&b).into_owned();
            }
        }
        if text.trim().is_empty() {
            invalid(log, format!("but the addon has no non-empty agents/{agent}.md"));
            return (Vec::new(), Vec::new(), false);
        }
        let Some(m) = frontmatter.captures(&text) else {
            invalid(log, format!("whose agents/{agent}.md has no frontmatter; it needs a title and a description"));
            return (Vec::new(), Vec::new(), false);
        };
        let mut fields: std::collections::HashMap<String, String> = Default::default();
        for line in m[1].split('\n') {
            if let Some(pair) = frontmatter_line.captures(line.trim_end_matches('\r')) {
                let mut v = pair[2].to_string();
                let b = v.as_bytes();
                if b.len() >= 2 && (b[0] == b'"' || b[0] == b'\'') && b[b.len() - 1] == b[0] {
                    v = v[1..v.len() - 1].to_string();
                }
                fields.insert(pair[1].to_string(), v);
            }
        }
        let mut out: Vec<(String, String)> = Vec::new();
        let mut keys: Vec<String> = Vec::new();
        let mut valid = true;
        for field in ["title", "description"] {
            let key = fields.get(field).cloned().unwrap_or_default();
            if key.is_empty() {
                invalid(log, format!("whose agents/{agent}.md frontmatter has no {field}; it must be a message key"));
                valid = false;
                continue;
            }
            keys.push(key.clone());
            if !en.contains_key(&key) {
                log.critical(
                    codes::STUDIO_MESSAGE_KEY_MISSING,
                    format!("definePlugin uses the message key '{key}', which is missing from the addon's messages/en.json"),
                );
                continue;
            }
            let name = if field == "description" { "agentDescription" } else { "agentTitle" };
            out.push((name.to_string(), key));
        }
        (out, keys, valid)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(root: &Path, rel: &str, text: &str) {
        let p = root.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, text).unwrap();
    }

    /// Go: TestValidateStudioAgentKeepsTheFieldWhoseKeyExists.
    #[test]
    fn agent_keeps_the_field_whose_key_exists() {
        let en: Map<String, Value> = serde_json::from_str(r#"{"agent_title":"Assistant","agent_description":"Helps"}"#).unwrap();
        let missing = "definePlugin uses the message key 'nope', which is missing from the addon's messages/en.json";
        let cases = [
            ("---\ntitle: agent_title\ndescription: nope\n---\nHi\n", ("agentTitle", "agent_title"), ["agent_title", "nope"]),
            ("---\ntitle: nope\ndescription: agent_description\n---\nHi\n", ("agentDescription", "agent_description"), ["nope", "agent_description"]),
        ];
        for (n, (frontmatter, want, want_keys)) in cases.into_iter().enumerate() {
            let root = std::env::temp_dir().join(format!("studio-agent-{}-{n}", std::process::id()));
            write(&root, "agents/helper.md", frontmatter);
            let mut log = Logger::default();
            let (got, keys, valid) = Context::validate_studio_agent(&mut log, "/assist", "helper", Some(&root), &en);
            assert_eq!(got, vec![(want.0.to_string(), want.1.to_string())]);
            assert_eq!(keys, want_keys);
            assert!(valid, "a missing key is PKU358, which leaves the agent valid");
            let entries = log.entries();
            assert_eq!(entries.len(), 1);
            assert_eq!(entries[0].code.as_deref(), Some(codes::STUDIO_MESSAGE_KEY_MISSING));
            assert_eq!(entries[0].message, missing);
            std::fs::remove_dir_all(root).ok();
        }
    }
}
