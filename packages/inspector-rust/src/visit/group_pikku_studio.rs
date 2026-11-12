//! Port of Go `visit/group_pikku_studio.go`: add/add-pikku-studio.ts and its
//! post-sweep `validatePikkuStudio`.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use regex::Regex;
use serde_json::{Map, Value};
use tsrs_ast::{self as ast, Kind, Node};
use tsrs_core::P;

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

/// A slot of an arranged screen or a thing's parts; `own` is set once every
/// widget the addon declares is known.
struct StudioSlot {
    widget: String,
    from: String,
    span: String,
    compact: String,
    copy: Option<Map<String, Value>>,
}

impl StudioSlot {
    fn value(&self, own: &HashSet<String>) -> Value {
        let mut o = Map::new();
        o.insert("widget".into(), Value::from(self.widget.as_str()));
        o.insert("from".into(), Value::from(self.from.as_str()));
        if !self.span.is_empty() {
            o.insert("span".into(), Value::from(self.span.as_str()));
        }
        if !self.compact.is_empty() {
            o.insert("compact".into(), Value::from(self.compact.as_str()));
        }
        if let Some(c) = &self.copy {
            o.insert("copy".into(), Value::Object(c.clone()));
        }
        o.insert("own".into(), Value::Bool(own.contains(&self.widget)));
        Value::Object(o)
    }
}

/// One widget, thing or arranged screen: its fields in output order, with its
/// slots kept apart until `own` can be decided.
#[derive(Default)]
struct StudioEntry {
    head: Map<String, Value>,
    slots_key: &'static str,
    slots: Vec<StudioSlot>,
    tail: Map<String, Value>,
    path: String,
}

impl StudioEntry {
    fn value(&self, own: &HashSet<String>) -> Value {
        let mut o = self.head.clone();
        if !self.slots_key.is_empty() {
            o.insert(self.slots_key.into(), Value::Array(self.slots.iter().map(|sl| sl.value(own)).collect()));
        }
        for (k, v) in &self.tail {
            o.insert(k.clone(), v.clone());
        }
        Value::Object(o)
    }
}

const STUDIO_WIDGET_STATES: [&str; 3] = ["full", "tile", "chip"];
const STUDIO_WIDGET_ACTIONS: [&str; 7] = ["open", "run", "scope", "submit", "link", "input", "event"];
const STUDIO_SKINS: [&str; 2] = ["desk", "headset"];
const STUDIO_SPANS: [&str; 3] = ["full", "wide", "half"];
const STUDIO_COMPACTS: [&str; 3] = ["full", "tile", "hide"];
const STUDIO_MEASURES: [&str; 3] = ["narrow", "normal", "fill"];

/// The object literal passed to definePlugin, seen through `as const`,
/// `satisfies` and parentheses.
fn plugin_manifest(node: P<Node>) -> Option<P<Node>> {
    if !ast::is_call_expression(node) {
        return None;
    }
    let e = node.expression()?;
    if !ast::is_identifier(e) || e.text() != "definePlugin" {
        return None;
    }
    let args = node.arguments();
    if args.is_empty() {
        return None;
    }
    let mut arg = args[0];
    while arg.kind() == Kind::AsExpression || arg.kind() == Kind::SatisfiesExpression || ast::is_parenthesized_expression(arg) {
        arg = arg.expression()?;
    }
    if !ast::is_object_literal_expression(arg) {
        return None;
    }
    Some(arg)
}

/// An array literal of string literals, each one of `values`.
fn studio_one_of_array(n: P<Node>, values: &[&str]) -> Option<Vec<String>> {
    let list = parse_string_array(n)?;
    if list.iter().all(|v| values.contains(&v.as_str())) { Some(list) } else { None }
}

/// An object literal whose values are string literals, in declaration order.
fn read_studio_string_record(n: P<Node>) -> Option<Map<String, Value>> {
    if !ast::is_object_literal_expression(n) {
        return None;
    }
    let mut o = Map::new();
    for f in n.properties() {
        let f = *f;
        let key = prop_key(f).filter(|k| !k.is_empty())?;
        let v = f.initializer()?;
        if !ast::is_string_literal(v) {
            return None;
        }
        o.insert(key, Value::from(v.text()));
    }
    Some(o)
}

/// `{ [variant]: <entry> }`, each entry read by `entry`.
fn read_studio_copy(n: P<Node>, entry: fn(P<Node>) -> Option<Map<String, Value>>) -> Option<Map<String, Value>> {
    if !ast::is_object_literal_expression(n) {
        return None;
    }
    let mut o = Map::new();
    for f in n.properties() {
        let f = *f;
        let key = prop_key(f).filter(|k| !k.is_empty())?;
        let v = entry(f.initializer()?)?;
        o.insert(key, Value::Object(v));
    }
    Some(o)
}

/// One variant of a thing's copy: name, lead, compact and primary
/// { label, draft }, all string literals.
fn read_studio_thing_copy_entry(n: P<Node>) -> Option<Map<String, Value>> {
    if !ast::is_object_literal_expression(n) {
        return None;
    }
    let (mut name, mut lead, mut compact) = (String::new(), String::new(), String::new());
    let mut primary: Option<Map<String, Value>> = None;
    for f in n.properties() {
        let f = *f;
        let key = prop_key(f).filter(|k| !k.is_empty())?;
        let v = f.initializer()?;
        match key.as_str() {
            "name" | "lead" | "compact" => {
                if !ast::is_string_literal(v) {
                    return None;
                }
                let text = v.text().to_string();
                match key.as_str() {
                    "name" => name = text,
                    "lead" => lead = text,
                    _ => compact = text,
                }
            }
            "primary" => {
                let rec = read_studio_string_record(v)?;
                let label = rec.get("label")?.clone();
                let mut p = Map::new();
                p.insert("label".into(), label);
                if let Some(draft) = rec.get("draft") {
                    p.insert("draft".into(), draft.clone());
                }
                primary = Some(p);
            }
            _ => {}
        }
    }
    if name.is_empty() || compact.is_empty() {
        return None;
    }
    let mut o = Map::new();
    o.insert("name".into(), Value::from(name));
    if !lead.is_empty() {
        o.insert("lead".into(), Value::from(lead));
    }
    o.insert("compact".into(), Value::from(compact));
    if let Some(p) = primary {
        o.insert("primary".into(), Value::Object(p));
    }
    Some(o)
}

fn read_studio_slot(n: P<Node>, fails: &mut Vec<String>) -> Option<StudioSlot> {
    if !ast::is_object_literal_expression(n) {
        fails.push(format!("A definePlugin slot must be an object literal, got: {}", node_text(n)));
        return None;
    }
    let mut sl = StudioSlot { widget: String::new(), from: String::new(), span: String::new(), compact: String::new(), copy: None };
    let mut ok = true;
    for f in n.properties() {
        let f = *f;
        let key = match prop_key(f) {
            Some(k) if !k.is_empty() => k,
            _ => {
                fails.push(format!("A slot's field must be a literal, got: {}", node_text(f)));
                ok = false;
                continue;
            }
        };
        let v = f.initializer().unwrap();
        let (read, expected) = match key.as_str() {
            "widget" => {
                let r = ast::is_string_literal(v);
                if r {
                    sl.widget = v.text().to_string();
                }
                (r, "a literal".to_string())
            }
            "from" => {
                let r = ast::is_string_literal(v);
                if r {
                    sl.from = v.text().to_string();
                }
                (r, "a literal".to_string())
            }
            "span" => {
                sl.span = studio_one_of(v, &STUDIO_SPANS).unwrap_or_default();
                (!sl.span.is_empty(), format!("one of {}", quoted_list(&STUDIO_SPANS)))
            }
            "compact" => {
                sl.compact = studio_one_of(v, &STUDIO_COMPACTS).unwrap_or_default();
                (!sl.compact.is_empty(), format!("one of {}", quoted_list(&STUDIO_COMPACTS)))
            }
            "copy" => {
                sl.copy = read_studio_copy(v, read_studio_string_record);
                (sl.copy.is_some(), "an object literal of variants, each mapping texts to message keys".to_string())
            }
            _ => continue,
        };
        if !read {
            fails.push(format!("A slot's {key} must be {expected}, got: {}", node_text(v)));
            ok = false;
        }
    }
    if !ok {
        return None;
    }
    if sl.widget.is_empty() || sl.from.is_empty() {
        fails.push(format!("A definePlugin slot needs a literal widget and from: {}", node_text(n)));
        return None;
    }
    Some(sl)
}

/// The slots of an arranged screen or a thing's parts; `None` when any slot
/// failed (each failure is already in `fails`).
fn read_studio_slots(n: P<Node>, field: &str, fails: &mut Vec<String>) -> Option<Vec<StudioSlot>> {
    if !ast::is_array_literal_expression(n) {
        fails.push(format!("A definePlugin {field} must be an array literal, got: {}", node_text(n)));
        return None;
    }
    let mut slots = Vec::new();
    let mut ok = true;
    for el in n.elements() {
        match read_studio_slot(*el, fails) {
            Some(sl) => slots.push(sl),
            None => ok = false,
        }
    }
    if ok { Some(slots) } else { None }
}

const STUDIO_FUNCTION_REF_EXPECTED: &str = "a function of the addon or a project RPC '<namespace>:<function>'";

/// A string literal naming a function of the addon or, with a colon, a project
/// RPC of the shape `<namespace>:<function>`.
fn studio_function_ref(n: P<Node>) -> Option<String> {
    if !ast::is_string_literal(n) {
        return None;
    }
    let text = n.text();
    let rpc = Regex::new(r"^[a-z][a-zA-Z0-9-]*:[A-Za-z_$][A-Za-z0-9_$]*$").unwrap();
    if text.is_empty() || (text.contains(':') && !rpc.is_match(text)) {
        return None;
    }
    Some(text.to_string())
}

/// A positive whole number literal of milliseconds.
fn studio_whole_ms(n: P<Node>) -> Option<f64> {
    studio_number(n).filter(|num| *num > 0.0 && *num == num.trunc())
}

/// A number of milliseconds or `{ fast, slow }`.
fn read_studio_poll(n: P<Node>) -> Option<Value> {
    if let Some(ms) = studio_whole_ms(n) {
        return Some(num_value(ms));
    }
    if !ast::is_object_literal_expression(n) {
        return None;
    }
    let (mut fast, mut slow): (Option<f64>, Option<f64>) = (None, None);
    for f in n.properties() {
        let f = *f;
        let key = prop_key(f)?;
        match key.as_str() {
            "fast" => fast = Some(studio_whole_ms(f.initializer()?)?),
            "slow" => slow = Some(studio_whole_ms(f.initializer()?)?),
            _ => return None,
        }
    }
    let mut o = Map::new();
    o.insert("fast".into(), num_value(fast?));
    o.insert("slow".into(), num_value(slow?));
    Some(Value::Object(o))
}

/// `{ [id]: { run, label, confirm?, destructive? } }`, as an array of actions
/// with their id first; `None` when any action failed.
fn read_studio_actions(n: P<Node>, fails: &mut Vec<String>) -> Option<Vec<Value>> {
    if !ast::is_object_literal_expression(n) {
        fails.push(format!("A definePlugin actions must be an object literal, got: {}", node_text(n)));
        return None;
    }
    let mut out = Vec::new();
    let mut ok = true;
    for p in n.properties() {
        let p = *p;
        let id = prop_key(p).filter(|k| !k.is_empty());
        let v = p.initializer();
        let (Some(id), Some(v)) = (id, v.filter(|v| ast::is_object_literal_expression(*v))) else {
            fails.push(format!("An action must be an object literal keyed by a literal, got: {}", node_text(p)));
            ok = false;
            continue;
        };
        let (mut run, mut label, mut confirm) = (String::new(), String::new(), String::new());
        let mut destructive: Option<bool> = None;
        let mut action_ok = true;
        for f in v.properties() {
            let f = *f;
            let key = match prop_key(f) {
                Some(k) if !k.is_empty() => k,
                _ => {
                    fails.push(format!("An action's field must be a literal, got: {}", node_text(f)));
                    action_ok = false;
                    continue;
                }
            };
            let fv = f.initializer().unwrap();
            let (read, expected) = match key.as_str() {
                "run" => {
                    run = studio_function_ref(fv).unwrap_or_default();
                    (!run.is_empty(), STUDIO_FUNCTION_REF_EXPECTED)
                }
                "label" => {
                    let r = ast::is_string_literal(fv);
                    if r {
                        label = fv.text().to_string();
                    }
                    (r, "a literal")
                }
                "confirm" => {
                    let r = ast::is_string_literal(fv);
                    if r {
                        confirm = fv.text().to_string();
                    }
                    (r, "a literal")
                }
                "destructive" => {
                    destructive = studio_bool(fv);
                    (destructive.is_some(), "a literal")
                }
                _ => continue,
            };
            if !read {
                fails.push(format!("An action's {key} must be {expected}, got: {}", node_text(fv)));
                action_ok = false;
            }
        }
        if action_ok && (run.is_empty() || label.is_empty()) {
            fails.push(format!("Action '{id}' needs a literal run and label"));
            action_ok = false;
        }
        if action_ok && destructive == Some(true) && confirm.is_empty() {
            fails.push(format!("Action '{id}' is destructive, so it needs a confirm message key"));
            action_ok = false;
        }
        if !action_ok {
            ok = false;
            continue;
        }
        let mut o = Map::new();
        o.insert("id".into(), Value::from(id));
        o.insert("run".into(), Value::from(run));
        o.insert("label".into(), Value::from(label));
        if !confirm.is_empty() {
            o.insert("confirm".into(), Value::from(confirm));
        }
        if let Some(b) = destructive {
            o.insert("destructive".into(), Value::Bool(b));
        }
        out.push(Value::Object(o));
    }
    if ok { Some(out) } else { None }
}

fn read_studio_widget(n: P<Node>, fails: &mut Vec<String>) -> Option<StudioEntry> {
    if !ast::is_object_literal_expression(n) {
        fails.push(format!("A definePlugin widget must be an object literal, got: {}", node_text(n)));
        return None;
    }
    let (mut title, mut description, mut component) = (String::new(), String::new(), String::new());
    let (mut states, mut actions, mut skins): (Option<Vec<String>>, Option<Vec<String>>, Option<Vec<String>>) = (None, None, None);
    let mut ok = true;
    for f in n.properties() {
        let f = *f;
        let key = match prop_key(f) {
            Some(k) if !k.is_empty() => k,
            _ => {
                fails.push(format!("A widget's field must be a literal, got: {}", node_text(f)));
                ok = false;
                continue;
            }
        };
        let v = f.initializer().unwrap();
        let (read, expected) = match key.as_str() {
            "title" => {
                let r = ast::is_string_literal(v);
                if r {
                    title = v.text().to_string();
                }
                (r, "a literal".to_string())
            }
            "description" => {
                let r = ast::is_string_literal(v);
                if r {
                    description = v.text().to_string();
                }
                (r, "a literal".to_string())
            }
            "states" => {
                states = studio_one_of_array(v, &STUDIO_WIDGET_STATES);
                (states.is_some(), format!("an array of {}", quoted_list(&STUDIO_WIDGET_STATES)))
            }
            "actions" => {
                actions = studio_one_of_array(v, &STUDIO_WIDGET_ACTIONS);
                (actions.is_some(), format!("an array of {}", quoted_list(&STUDIO_WIDGET_ACTIONS)))
            }
            "skins" => {
                skins = studio_one_of_array(v, &STUDIO_SKINS);
                (skins.is_some(), format!("an array of {}", quoted_list(&STUDIO_SKINS)))
            }
            "component" => {
                component = lazy_import_specifier(v);
                (!component.is_empty(), "() => import('<literal>')".to_string())
            }
            _ => continue,
        };
        if !read {
            fails.push(format!("A widget's {key} must be {expected}, got: {}", node_text(v)));
            ok = false;
        }
    }
    if !ok {
        return None;
    }
    let (Some(states), Some(actions)) = (states, actions) else {
        fails.push(format!(
            "A definePlugin widget needs a literal title, description, states and actions, and a lazy component: {}",
            node_text(n)
        ));
        return None;
    };
    if title.is_empty() || description.is_empty() || component.is_empty() {
        fails.push(format!(
            "A definePlugin widget needs a literal title, description, states and actions, and a lazy component: {}",
            node_text(n)
        ));
        return None;
    }
    let mut e = StudioEntry::default();
    e.head.insert("title".into(), Value::from(title));
    e.head.insert("description".into(), Value::from(description));
    e.head.insert("states".into(), super::util_shared::strs_value(&states));
    e.head.insert("actions".into(), super::util_shared::strs_value(&actions));
    if let Some(s) = skins {
        e.head.insert("skins".into(), super::util_shared::strs_value(&s));
    }
    e.head.insert("component".into(), Value::from(component));
    Some(e)
}

fn read_studio_thing(n: P<Node>, fails: &mut Vec<String>) -> Option<StudioEntry> {
    if !ast::is_object_literal_expression(n) {
        fails.push(format!("A definePlugin thing must be an object literal, got: {}", node_text(n)));
        return None;
    }
    let (mut label, mut source, mut measure) = (String::new(), String::new(), String::new());
    let mut copy: Option<Map<String, Value>> = None;
    let mut parts: Option<Vec<StudioSlot>> = None;
    let mut related: Option<Vec<String>> = None;
    let mut actions: Option<Vec<Value>> = None;
    let mut has_actions = false;
    let mut always_full: Option<bool> = None;
    let mut has_parts = false;
    let mut ok = true;
    for f in n.properties() {
        let f = *f;
        let key = match prop_key(f) {
            Some(k) if !k.is_empty() => k,
            _ => {
                fails.push(format!("A thing's field must be a literal, got: {}", node_text(f)));
                ok = false;
                continue;
            }
        };
        let v = f.initializer().unwrap();
        let (read, expected) = match key.as_str() {
            "label" => {
                let r = ast::is_string_literal(v);
                if r {
                    label = v.text().to_string();
                }
                (r, "a literal".to_string())
            }
            "source" => {
                source = studio_function_ref(v).unwrap_or_default();
                (!source.is_empty(), STUDIO_FUNCTION_REF_EXPECTED.to_string())
            }
            "actions" => {
                actions = read_studio_actions(v, fails);
                has_actions = true;
                ok = ok && actions.is_some();
                continue;
            }
            "copy" => {
                copy = read_studio_copy(v, read_studio_thing_copy_entry);
                (copy.is_some(), "an object literal of variants, each with literal name and compact keys".to_string())
            }
            "parts" => {
                parts = read_studio_slots(v, "thing's parts", fails);
                has_parts = true;
                ok = ok && parts.is_some();
                continue;
            }
            "related" => {
                related = parse_string_array(v);
                (related.is_some(), "an array of string literals".to_string())
            }
            "alwaysFull" => {
                always_full = studio_bool(v);
                (always_full.is_some(), "a literal".to_string())
            }
            "measure" => {
                measure = studio_one_of(v, &STUDIO_MEASURES).unwrap_or_default();
                (!measure.is_empty(), format!("one of {}", quoted_list(&STUDIO_MEASURES)))
            }
            _ => continue,
        };
        if !read {
            fails.push(format!("A thing's {key} must be {expected}, got: {}", node_text(v)));
            ok = false;
        }
    }
    if !ok {
        return None;
    }
    let Some(copy) = copy.filter(|_| !label.is_empty() && !source.is_empty() && has_parts) else {
        fails.push(format!("A definePlugin thing needs a literal label, source, copy and parts: {}", node_text(n)));
        return None;
    };
    let mut e = StudioEntry::default();
    e.head.insert("label".into(), Value::from(label));
    e.head.insert("source".into(), Value::from(source));
    e.head.insert("copy".into(), Value::Object(copy));
    e.slots_key = "parts";
    e.slots = parts.unwrap_or_default();
    if let Some(r) = related {
        e.tail.insert("related".into(), super::util_shared::strs_value(&r));
    }
    if let Some(a) = actions.filter(|_| has_actions) {
        e.tail.insert("actions".into(), Value::Array(a));
    }
    if let Some(b) = always_full {
        e.tail.insert("alwaysFull".into(), Value::Bool(b));
    }
    if !measure.is_empty() {
        e.tail.insert("measure".into(), Value::from(measure));
    }
    Some(e)
}

/// A map of literal entries keyed by identifiers or string literals; the key
/// is written first, as `id_key`.
fn studio_read_map(
    init: P<Node>,
    field: &str,
    id_key: &str,
    fails: &mut Vec<String>,
    read: fn(P<Node>, &mut Vec<String>) -> Option<StudioEntry>,
) -> Vec<StudioEntry> {
    let mut out = Vec::new();
    if !ast::is_object_literal_expression(init) {
        fails.push(format!("definePlugin's {field} must be an object literal, got: {}", node_text(init)));
        return out;
    }
    for p in init.properties() {
        let p = *p;
        let key = match prop_key(p) {
            Some(k) if !k.is_empty() => k,
            _ => {
                fails.push(format!("A definePlugin {field} entry must be keyed by a literal, got: {}", node_text(p)));
                continue;
            }
        };
        let Some(mut e) = read(p.initializer().unwrap(), fails) else { continue };
        let mut head = Map::new();
        head.insert(id_key.into(), Value::from(key));
        for (k, v) in std::mem::take(&mut e.head) {
            head.insert(k, v);
        }
        e.head = head;
        out.push(e);
    }
    out
}

fn read_studio_arranged_screen(el: P<Node>, fails: &mut Vec<String>) -> Option<StudioEntry> {
    read_studio_screen(el, true, fails).map(|(e, _)| e)
}

/// A screen of `screens`, or with `arranged` an entry of `arrangedScreens`:
/// the same routing fields, with source and slots in place of a component or
/// an app.
fn read_studio_screen(el: P<Node>, arranged: bool, fails: &mut Vec<String>) -> Option<(StudioEntry, String)> {
    let what = if arranged { "A definePlugin arranged screen" } else { "A definePlugin screen" };
    if !ast::is_object_literal_expression(el) {
        fails.push(format!("{what} must be an object literal, got: {}", node_text(el)));
        return None;
    }
    let (mut path, mut title, mut scope, mut layout, mut component, mut app) =
        (String::new(), String::new(), String::new(), String::new(), String::new(), String::new());
    let (mut about, mut source, mut chat) = (String::new(), String::new(), String::new());
    let mut agent: Option<String> = None;
    let mut nav: Option<Map<String, Value>> = None;
    let (mut replaces, mut needs_app, mut default_chat, mut scoped): (Option<bool>, Option<bool>, Option<bool>, Option<bool>) =
        (None, None, None, None);
    let mut lanes: Option<f64> = None;
    let mut scopes: Option<Vec<String>> = None;
    let mut shows: Option<Vec<String>> = None;
    let mut slots: Option<Vec<StudioSlot>> = None;
    let mut has_slots = false;
    let mut actions: Option<Vec<Value>> = None;
    let mut redirect: Option<Map<String, Value>> = None;
    let mut poll: Option<Value> = None;
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
                if arranged {
                    fails.push(format!("An arranged screen has slots, not a component: {}", node_text(el)));
                    ok = false;
                    continue;
                }
                component = lazy_import_specifier(v);
                if component.is_empty() {
                    fails.push(format!("A screen's component must be () => import('<literal>'), got: {}", node_text(v)));
                    ok = false;
                }
                continue;
            }
            "app" => {
                if arranged {
                    fails.push(format!("An arranged screen has slots, not an app: {}", node_text(el)));
                    ok = false;
                    continue;
                }
                let r = ast::is_string_literal(v);
                if r {
                    app = v.text().to_string();
                }
                r
            }
            "about" if arranged => {
                let r = ast::is_string_literal(v);
                if r {
                    about = v.text().to_string();
                }
                r
            }
            "source" if arranged => {
                source = studio_function_ref(v).unwrap_or_default();
                !source.is_empty()
            }
            "actions" if arranged => {
                actions = read_studio_actions(v, fails);
                ok = ok && actions.is_some();
                continue;
            }
            "redirect" if arranged => {
                redirect = read_studio_string_record(v);
                redirect.is_some()
            }
            "poll" if arranged => {
                poll = read_studio_poll(v);
                poll.is_some()
            }
            "slots" if arranged => {
                slots = read_studio_slots(v, "arranged screen's slots", fails);
                has_slots = true;
                ok = ok && slots.is_some();
                continue;
            }
            "shows" if arranged => {
                shows = parse_string_array(v);
                shows.is_some()
            }
            "lanes" if arranged => match studio_number(v) {
                Some(num) => {
                    lanes = Some(num);
                    num == num.trunc() && (1.0..=6.0).contains(&num)
                }
                None => false,
            },
            "chat" if arranged => {
                chat = studio_one_of(v, &["collapse"]).unwrap_or_default();
                !chat.is_empty()
            }
            "scoped" if arranged => {
                scoped = studio_bool(v);
                scoped.is_some()
            }
            _ => continue,
        };
        if !read {
            let expected = match key.as_str() {
                "scope" => format!("one of {}", quoted_list(&STUDIO_SCOPES)),
                "layout" => "'bare'".to_string(),
                "shows" => "an array of string literals".to_string(),
                "lanes" => "a whole number from 1 to 6".to_string(),
                "chat" => "'collapse'".to_string(),
                "source" if arranged => STUDIO_FUNCTION_REF_EXPECTED.to_string(),
                "redirect" if arranged => "an object literal of variants, each naming an arranged screen or a path".to_string(),
                "poll" if arranged => "a positive whole number of milliseconds or { fast, slow }".to_string(),
                _ => "a literal".to_string(),
            };
            fails.push(format!("A screen's {key} must be {expected}, got: {}", node_text(v)));
            ok = false;
        }
    }
    if !ok {
        return None;
    }
    if arranged {
        if path.is_empty() || title.is_empty() || scope.is_empty() || source.is_empty() || !has_slots {
            fails.push(format!(
                "A definePlugin arranged screen needs a literal path, title, scope and source, and slots: {}",
                node_text(el)
            ));
            return None;
        }
    } else {
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
    }
    let mut e = StudioEntry::default();
    let o = &mut e.head;
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
    e.path = path.clone();
    if !arranged {
        if !component.is_empty() {
            o.insert("component".into(), Value::from(component));
        } else {
            o.insert("app".into(), Value::from(app));
        }
        return Some((e, path));
    }
    if !about.is_empty() {
        o.insert("about".into(), Value::from(about));
    }
    o.insert("source".into(), Value::from(source));
    e.slots_key = "slots";
    e.slots = slots.unwrap_or_default();
    if let Some(s) = shows {
        e.tail.insert("shows".into(), super::util_shared::strs_value(&s));
    }
    if let Some(n) = lanes {
        e.tail.insert("lanes".into(), num_value(n));
    }
    if !chat.is_empty() {
        e.tail.insert("chat".into(), Value::from(chat));
    }
    if let Some(b) = scoped {
        e.tail.insert("scoped".into(), Value::Bool(b));
    }
    if let Some(a) = actions {
        e.tail.insert("actions".into(), Value::Array(a));
    }
    if let Some(r) = redirect {
        e.tail.insert("redirect".into(), Value::Object(r));
    }
    if let Some(p) = poll {
        e.tail.insert("poll".into(), p);
    }
    Some((e, path))
}

impl Context<'_> {
    pub fn add_pikku_studio(&mut self, node: P<Node>) {
        let Some(obj) = plugin_manifest(node) else { return };
        let mut fails: Vec<String> = Vec::new();
        let mut title = String::new();
        let mut screens: Vec<Value> = Vec::new();
        let mut paths: Vec<String> = Vec::new();
        let (mut widgets, mut things, mut arranged): (Option<Vec<StudioEntry>>, Option<Vec<StudioEntry>>, Option<Vec<StudioEntry>>) =
            (None, None, None);
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
                        if let Some((sc, path)) = read_studio_screen(*el, false, &mut fails) {
                            screens.push(Value::Object(sc.head));
                            paths.push(path);
                        }
                    }
                }
                "widgets" => widgets = Some(studio_read_map(init, "widgets", "id", &mut fails, read_studio_widget)),
                "things" => things = Some(studio_read_map(init, "things", "kind", &mut fails, read_studio_thing)),
                "arrangedScreens" => {
                    let list = studio_read_map(init, "arrangedScreens", "id", &mut fails, read_studio_arranged_screen);
                    paths.extend(list.iter().map(|e| e.path.clone()));
                    arranged = Some(list);
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
        let own: HashSet<String> = widgets
            .iter()
            .flatten()
            .filter_map(|w| w.head.get("id").and_then(Value::as_str).map(str::to_string))
            .collect();
        self.log.debug(format!("\u{2022} Found definePlugin: {title} ({} screens)", screens.len()));
        let mut o = Map::new();
        o.insert("title".into(), Value::from(title));
        o.insert("file".into(), Value::from(file_name_of(node)));
        o.insert("screens".into(), Value::Array(screens));
        for (key, list) in [("widgets", widgets), ("things", things), ("arrangedScreens", arranged)] {
            if let Some(list) = list {
                o.insert(key.into(), Value::Array(list.iter().map(|e| e.value(&own)).collect()));
            }
        }
        self.state.studio = Raw::of(Value::Object(o));
    }
}

fn str_at<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}

/// The message keys of the actions, label then confirm.
fn studio_action_keys(actions: Option<&Value>, out: &mut Vec<String>) {
    for a in actions.and_then(Value::as_array).into_iter().flatten() {
        out.push(str_at(a, "label").unwrap_or("").to_string());
        if let Some(confirm) = str_at(a, "confirm").filter(|c| !c.is_empty()) {
            out.push(confirm.to_string());
        }
    }
}

/// The message keys of the slots' copy, in declaration order.
fn studio_slot_keys(slots: Option<&Value>, out: &mut Vec<String>) {
    for sl in slots.and_then(Value::as_array).into_iter().flatten() {
        for texts in sl.get("copy").and_then(Value::as_object).into_iter().flat_map(|c| c.values()) {
            for key in texts.as_object().into_iter().flat_map(|t| t.values()) {
                out.push(key.as_str().unwrap_or("").to_string());
            }
        }
    }
}

/// Every message key the declaration uses: the title, each screen's, then the
/// widgets', the things' and the arranged screens'.
fn studio_message_keys(studio: &Map<String, Value>) -> Vec<String> {
    let list = |key: &str| studio.get(key).and_then(Value::as_array).cloned().unwrap_or_default();
    let mut keys = vec![studio.get("title").and_then(Value::as_str).unwrap_or("").to_string()];
    for screen in list("screens") {
        keys.push(str_at(&screen, "title").unwrap_or("").to_string());
    }
    for w in list("widgets") {
        keys.push(str_at(&w, "title").unwrap_or("").to_string());
        keys.push(str_at(&w, "description").unwrap_or("").to_string());
    }
    for t in list("things") {
        keys.push(str_at(&t, "label").unwrap_or("").to_string());
        for c in t.get("copy").and_then(Value::as_object).into_iter().flat_map(|c| c.values()) {
            keys.push(str_at(c, "name").unwrap_or("").to_string());
            if let Some(lead) = str_at(c, "lead").filter(|l| !l.is_empty()) {
                keys.push(lead.to_string());
            }
            keys.push(str_at(c, "compact").unwrap_or("").to_string());
            if let Some(primary) = c.get("primary") {
                keys.push(str_at(primary, "label").unwrap_or("").to_string());
                if let Some(draft) = str_at(primary, "draft").filter(|d| !d.is_empty()) {
                    keys.push(draft.to_string());
                }
            }
        }
        studio_slot_keys(t.get("parts"), &mut keys);
        studio_action_keys(t.get("actions"), &mut keys);
    }
    for screen in list("arrangedScreens") {
        keys.push(str_at(&screen, "title").unwrap_or("").to_string());
        if let Some(about) = str_at(&screen, "about").filter(|a| !a.is_empty()) {
            keys.push(about.to_string());
        }
        studio_slot_keys(screen.get("slots"), &mut keys);
        studio_action_keys(screen.get("actions"), &mut keys);
    }
    keys
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
        let Some(Value::Object(mut studio)) = self.state.studio.value().cloned() else { return };
        let file = studio.get("file").and_then(Value::as_str).unwrap_or("").to_string();

        let mut keys: Vec<String> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();
        for key in studio_message_keys(&studio) {
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
        for field in ["screens", "arrangedScreens"] {
            let Some(Value::Array(screens)) = studio.get_mut(field) else { continue };
            for screen in screens.iter_mut() {
                let screen_path = screen.get("path").and_then(Value::as_str).unwrap_or("").to_string();
                let agent = screen.get("agent").and_then(Value::as_str).map(str::to_string);
                if let Some(agent) = agent {
                    let (extra, agent_keys, agent_valid) = Self::validate_studio_agent(self.log, &screen_path, &agent, root.as_deref(), &en);
                    for key in agent_keys {
                        if seen.insert(key.clone()) {
                            keys.push(key);
                        }
                    }
                    if !extra.is_empty() {
                        if let Value::Object(m) = screen {
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
                let badge = screen.get("nav").and_then(|n| n.get("badge")).and_then(Value::as_str).map(str::to_string);
                let Some(badge) = badge else { continue };
                if !self.state.functions.meta.has(&badge) {
                    self.log.critical(
                        codes::STUDIO_BADGE_FUNCTION_NOT_FOUND,
                        format!("Screen '{screen_path}' has the nav badge '{badge}', which names no function in this addon"),
                    );
                }
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
            self.state.studio = Raw::of(Value::Object(studio));
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

    /// Go: the golden of testdata/wirings-addons lists these keys in this order.
    #[test]
    fn message_keys_cover_widgets_things_and_arranged_screens() {
        let studio: Map<String, Value> = serde_json::from_str(
            r#"{
              "title": "t", "file": "f", "screens": [{"title": "s"}],
              "widgets": [{"id": "w", "title": "w_t", "description": "w_d"}],
              "things": [{"kind": "k", "label": "k_l",
                "copy": {"failed": {"name": "k_n", "lead": "k_lead", "compact": "k_c", "primary": {"label": "k_p", "draft": "k_dr"}}},
                "parts": [{"widget": "x", "from": "y", "copy": {"a": {"headline": "p_a"}}, "own": false}],
                "actions": [{"id": "f", "run": "admin:f", "label": "a_l", "confirm": "a_c", "destructive": true}]}],
              "arrangedScreens": [{"id": "h", "title": "h_t", "about": "h_a",
                "slots": [{"widget": "v", "from": "v", "copy": {"wrong": {"headline": "v_w"}, "fine": {"headline": "v_f"}}, "own": false}]}]
            }"#,
        )
        .unwrap();
        let keys = studio_message_keys(&studio);
        let want = ["t", "s", "w_t", "w_d", "k_l", "k_n", "k_lead", "k_c", "k_p", "k_dr", "p_a", "a_l", "a_c", "h_t", "h_a", "v_w", "v_f"];
        assert_eq!(keys, want);
    }
}
