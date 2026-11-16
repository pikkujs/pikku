//! Port of Go `visit/group_subscribe.go`: `pikkuSubscribeFunc`, the only way to
//! subscribe a stream to an event hub topic. The helper's second type argument
//! is the topic shape; it becomes the function's `topicPattern`, the string the
//! runtime checks every publish against.

use std::path::Path;

use tsrs_ast::{self as ast, Kind, Node};
use tsrs_core::P;

use super::group_wire_addon::{file_name_of, is_call, is_string_literal_like};
use super::order;
use super::{Context, Phase, Registry, Visitor};
use crate::diag::codes;
use crate::tsutil;

pub fn register(r: &mut Registry) {
    r.register(Visitor {
        name: "checkEventHubImports",
        phase: Phase::Routes,
        order: order::CHECK_EVENT_HUB_IMPORTS,
        visit: check_event_hub_imports,
    });
}

const EVENT_HUB_INTERNAL_PATH: &str = "@pikku/core/internal/event-hub";

const SUBSCRIBE_WIRING_HINT: &str = "A subscribe function is wired only as an `sse: true` HTTP route or a channel `onMessageWiring` action, because only those streams can be subscribed to a topic.";

/// Refuses an import of the full hub. The distributor is held by the runtime
/// alone; functions get the publisher (`services.eventHub`).
fn check_event_hub_imports(ctx: &mut Context<'_>, node: P<Node>) {
    let spec = if ast::is_import_declaration(node) || ast::is_export_declaration(node) {
        node.module_specifier()
    } else if is_call(node) && node.expression().is_some_and(|e| e.kind() == Kind::ImportKeyword) {
        node.arguments().first().copied()
    } else {
        None
    };
    let Some(spec) = spec.filter(|s| is_string_literal_like(*s)) else { return };
    if !spec.text().starts_with(EVENT_HUB_INTERNAL_PATH) {
        return;
    }
    if in_framework_package(file_name_of(node)) {
        return;
    }
    let file = Path::new(file_name_of(node)).file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
    ctx.log.critical(
        codes::EVENT_HUB_INTERNAL_ACCESS,
        format!(
            "'{file}' imports '{}', the event hub's internal path. Functions get only the publisher (services.eventHub); subscribing is a pikkuSubscribeFunc.",
            spec.text()
        ),
    );
}

/// Whether the file belongs to a `@pikku/*` package (nearest package.json up the
/// tree). Framework host code, such as the CLI's dev and serve commands, owns
/// the process and may install the distributor; a user app's package is never
/// named `@pikku/*`, so its functions stay refused.
fn in_framework_package(file: &str) -> bool {
    let mut dir = Path::new(file).parent();
    while let Some(d) = dir {
        if let Ok(raw) = std::fs::read(d.join("package.json")) {
            return serde_json::from_slice::<serde_json::Value>(&raw)
                .ok()
                .and_then(|v| v.get("name").and_then(|n| n.as_str()).map(|n| n.starts_with("@pikku/")))
                .unwrap_or(false);
        }
        dir = d.parent();
    }
    false
}

impl Context<'_> {
    /// Refuses a subscribe function wired where nothing can subscribe a stream
    /// (a plain route, a cron, a queue, a CLI command, ...).
    pub fn check_subscribe_wiring(&mut self, func_id: &str, description: &str) -> bool {
        let Some(m) = self.resolve_function_meta(func_id) else { return true };
        if m.subscribe.is_none() {
            return true;
        }
        self.log.critical(
            codes::SUBSCRIBE_WIRING_NOT_STREAMING,
            format!("Subscribe function '{func_id}' is wired as {description}. {SUBSCRIBE_WIRING_HINT}"),
        );
        false
    }

    /// Reads the topic shape out of `pikkuSubscribeFunc<Input, Topic>`. Only a
    /// string literal or a template literal of `${string}` / `${number}` holes
    /// names a shape; anything wider (string, a union, no type argument) is refused.
    pub fn subscribe_topic_pattern(&mut self, call: P<Node>, func_id: &str) -> Option<String> {
        let args = call.type_arguments();
        let type_node = args.get(1).copied();
        let shown = type_node.map(|t| tsutil::node_text(t).trim().to_string()).unwrap_or_else(|| "(inferred)".to_string());
        if let Some(p) = self.topic_shape_of(type_node, 0) {
            return Some(p);
        }
        self.log.critical(
            codes::SUBSCRIBE_TOPIC_NOT_DECLARED,
            format!(
                "Subscribe function '{func_id}' declares the topic type '{shown}', which names no shape. Declare a string literal or a template literal such as `order:${{string}}` as its second type argument, so publish can refuse topics no subscribe function returns."
            ),
        );
        None
    }

    fn topic_shape_of(&mut self, n: Option<P<Node>>, depth: usize) -> Option<String> {
        let n = n?;
        if depth > 8 {
            return None;
        }
        match n.kind() {
            Kind::ParenthesizedType => self.topic_shape_of(n.type_node(), depth + 1),
            Kind::TypeReference => {
                if !n.type_arguments().is_empty() {
                    return None;
                }
                let name = n.as_type_reference_node().type_name();
                let sym = self.symbol_at(name);
                let sym = self.resolve_alias(sym)?;
                for d in sym.declarations().to_vec() {
                    if d.kind() == Kind::TypeAliasDeclaration {
                        return self.topic_shape_of(d.type_node(), depth + 1);
                    }
                }
                None
            }
            _ => parse_topic_shape(tsutil::node_text(n).trim()),
        }
    }
}

/// Accepts `'literal'`, `"literal"` and `` `text${string}text${number}` ``.
fn parse_topic_shape(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    if bytes.len() < 2 {
        return None;
    }
    let q = bytes[0];
    if q != bytes[bytes.len() - 1] || !matches!(q, b'\'' | b'"' | b'`') {
        return None;
    }
    let body = &text[1..text.len() - 1];
    if body.contains('\\') {
        return None;
    }
    if q != b'`' {
        if body.is_empty() || body.contains(q as char) {
            return None;
        }
        return Some(body.to_string());
    }
    let mut rest = body;
    while let Some(i) = rest.find("${") {
        let j = rest[i..].find('}')?;
        let hole = &rest[i + 2..i + j];
        if hole != "string" && hole != "number" {
            return None;
        }
        rest = &rest[i + j + 1..];
    }
    if body.is_empty() || (rest.contains('$') && rest.contains('{')) {
        return None;
    }
    Some(body.to_string())
}
