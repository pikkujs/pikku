//! Port of Go `visit/group_addon_bans.go` (add/add-addon-bans.ts).

use tsrs_ast::Node;
use tsrs_core::P;

use super::group_wire_addon::{is_call, is_identifier, is_property_assignment, is_string_literal};
use super::order;
use super::{Context, Phase, Registry, Visitor};
use crate::diag::codes;

pub fn register(r: &mut Registry) {
    r.register(Visitor { name: "checkAddonBans", phase: Phase::Routes, order: order::CHECK_ADDON_BANS, visit: check_addon_bans });
}

const BANNED_ADDON_WIRINGS: [&str; 13] = [
    "wireAddon", "wireRemoteAddon", "wireChannel", "wireCLI", "wireGateway", "wireHTTP", "wireHTTPRoutes",
    "wireMCPPrompt", "wireMCPResource", "wireQueueWorker", "wireScheduler", "wireTrigger", "wireTriggerSource",
];

const ADDON_CONTRACT_DEFINERS: [&str; 3] = ["defineHTTPRoutes", "defineChannelRoutes", "defineCLICommands"];

fn has_handler_property(n: P<Node>) -> bool {
    fn visit(c: P<Node>, found: &mut bool) -> bool {
        if *found {
            return true;
        }
        if is_property_assignment(c)
            && let Some(name) = c.name()
            && (is_identifier(name) || is_string_literal(name))
            && (name.text() == "middleware" || name.text() == "permissions")
        {
            *found = true;
            return true;
        }
        c.for_each_child(&mut |child| visit(child, found));
        *found
    }
    let mut found = false;
    visit(n, &mut found);
    found
}

fn check_addon_bans(ctx: &mut Context<'_>, node: P<Node>) {
    if !ctx.options.is_addon || !is_call(node) {
        return;
    }
    let Some(callee) = node.expression().filter(|e| is_identifier(*e)) else { return };
    let name = callee.text();
    if BANNED_ADDON_WIRINGS.contains(&name) {
        ctx.log.critical(
            codes::ADDON_WIRING_NOT_ALLOWED,
            format!("Addons must not call '{name}'. Declare contracts with define* and export functions; the consuming app wires them via refHTTP / refChannel / refCLI."),
        );
        return;
    }
    if ADDON_CONTRACT_DEFINERS.contains(&name)
        && let Some(first) = node.arguments().first()
        && has_handler_property(*first)
    {
        ctx.log.critical(
            codes::ADDON_CONTRACT_HANDLERS_NOT_ALLOWED,
            format!("Addon contract '{name}' must not declare middleware or permissions — these are applied by the consuming app, not the addon."),
        );
    }
}

