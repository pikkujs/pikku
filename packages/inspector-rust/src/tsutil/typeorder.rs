//! Port of Go `internal/tsutil/typeorder.go`: printed types
//! in Strada's (old TypeScript's) order.
//!
//! Strada keeps a union's constituents sorted by type id (creation order) and
//! lays a mapped type's properties out in the order it iterates its key union;
//! typescript-go (and tsrs) sort unions by value. Printed types become schemas,
//! so the difference reaches `enum` and `required`. Literal and keyword types
//! are interned and ids are still allocated in creation order, so sorting a
//! printed union's members by the id of the type each came from gives Strada's
//! order back. See `packages/inspector-go/knowledge/decisions/
//! union-and-property-order-follow-type-ids.md`.
//!
//! Entry points: [`reorder_type_node`], [`union_types_in_id_order`]; the printing
//! entry points (`type_to_string`, `type_to_string_at`, `type_to_type_node`) are in
//! [`super::unionorder`], as in Go.
//!
//! tsrs differences (also in PORTING.md): `Checker::get_string_literal_type`,
//! `get_number_literal_type`, `format_union_types`,
//! `get_modifiers_type_from_mapped_type` and `is_mapped_type_with_keyof_...` are
//! `pub(crate)`. Literal types are obtained through
//! `get_type_from_type_node_exported` on the synthesized literal node (which
//! interns the same type), `format_union_types` is re-implemented from public
//! pieces, and a homomorphic mapped type keeps its own (declaration) order
//! rather than being sorted by its modifiers type's order.

use tsrs_ast::{Kind, Node, NodeFlags, SymbolFlags};
use tsrs_checker::{Checker, ObjectFlags, Type, TypeFlags};
use tsrs_core::P;

use super::unionorder::{
    is_nullish, note_literal, reorder_union_type_nodes, sort_nodes_by_key, string_literal_type,
    type_of_literal_or_keyword_node,
};

/// Bounds the type/node walk; printed types are trees, but a pathological one
/// should not be walked forever.
const MAX_REORDER_DEPTH: usize = 64;

/// Puts the unions and mapped-type members under `node`, which the node builder
/// printed from `t`, into Strada's order. It walks `t` and `node` together so
/// every union member and property signature is matched to the type it was
/// printed from; where the two cannot be matched up (a union printed from its
/// origin, a construct the walk does not follow), it falls back to
/// [`reorder_union_type_nodes`] for that subtree.
pub fn reorder_type_node(c: &mut Checker, t: Option<P<Type>>, node: P<Node>) {
    reorder_typed(c, t, Some(node), 0);
}

fn reorder_typed(c: &mut Checker, t: Option<P<Type>>, n: Option<P<Node>>, depth: usize) {
    let Some(n) = n else { return };
    let Some(t) = t.filter(|_| depth <= MAX_REORDER_DEPTH && n.flags().intersects(NodeFlags::Synthesized)) else {
        reorder_union_type_nodes(c, n);
        return;
    };
    let depth = depth + 1;
    note_literal(t);
    match n.kind() {
        Kind::ParenthesizedType => reorder_typed(c, Some(t), Some(n.type_node().unwrap()), depth),
        Kind::TypeOperator => reorder_typed(c, Some(t), Some(n.type_node().unwrap()), depth),
        Kind::ArrayType => {
            let mut elem = None;
            if c.is_array_type_exported(t) {
                elem = c.get_type_arguments_exported(t).first().copied();
            }
            reorder_typed(c, elem, Some(n.as_array_type_node().element_type()), depth);
        }
        Kind::TypeReference => {
            let nodes: &[P<Node>] = n.as_type_reference_node().type_arguments().map_or(&[], |l| l.nodes());
            let mut args: &[P<Type>] = &[];
            if let Some(alias) = t.alias().filter(|a| a.type_arguments().len() == nodes.len()) {
                args = alias.type_arguments();
            } else if t.flags().intersects(TypeFlags::Object) && t.object_flags().intersects(ObjectFlags::Reference) {
                args = c.get_type_arguments_exported(t);
            }
            for (i, arg) in nodes.iter().enumerate() {
                reorder_typed(c, args.get(i).copied(), Some(*arg), depth);
            }
        }
        Kind::IntersectionType => {
            let nodes = n.as_intersection_type_node().types().nodes();
            let mut types: Option<&[P<Type>]> = None;
            if t.flags().intersects(TypeFlags::Intersection) && t.types().len() == nodes.len() {
                types = Some(t.types());
            }
            for (i, m) in nodes.iter().enumerate() {
                reorder_typed(c, types.map(|ts| ts[i]), Some(*m), depth);
            }
        }
        Kind::UnionType => reorder_typed_union(c, t, n, depth),
        Kind::TypeLiteral => reorder_type_literal(c, t, n, depth),
        _ => reorder_union_type_nodes(c, n),
    }
}

/// Pairs a union node's members with the constituents the node builder printed
/// them from (formatUnionTypes of t's types) and sorts them by those
/// constituents' ids. Null and undefined stay at the end.
fn reorder_typed_union(c: &mut Checker, t: P<Type>, n: P<Node>, depth: usize) {
    let nodes = n.as_union_type_node().types().nodes();
    let types: Vec<P<Type>> = if t.flags().intersects(TypeFlags::Union) {
        format_union_types(c, t.types(), false)
    } else {
        Vec::new()
    };
    types.iter().for_each(|t| note_literal(*t));
    let mut end = nodes.len();
    while end > 0 && is_nullish(nodes[end - 1]) {
        end -= 1;
    }
    let mut type_end = types.len();
    while type_end > 0 && types[type_end - 1].flags().intersects(TypeFlags::Nullable) {
        type_end -= 1;
    }
    if end != type_end || !union_members_match(c, &nodes[..end], &types[..type_end]) {
        // Printed from the union's origin, or otherwise not one-to-one.
        reorder_union_type_nodes(c, n);
        return;
    }
    let mut keys: Vec<(P<Node>, u32)> = Vec::with_capacity(end);
    for (i, m) in nodes[..end].iter().enumerate() {
        reorder_typed(c, Some(types[i]), Some(*m), depth);
        keys.push((*m, union_position(types[i])));
    }
    sort_nodes_by_key(&nodes[..end], |m| keys.iter().find(|(k, _)| *k == m).map_or(0, |(_, id)| *id));
}

/// `Checker.formatUnionTypes` (printer.go:253), which tsrs keeps `pub(crate)`.
fn format_union_types(c: &mut Checker, types: &[P<Type>], expanding_enum: bool) -> Vec<P<Type>> {
    let boolean = c.get_boolean_type();
    let mut result = Vec::new();
    let mut flags = TypeFlags::None;
    let mut i = 0;
    while i < types.len() {
        let t = types[i];
        flags |= t.flags();
        if !t.flags().intersects(TypeFlags::Nullable) {
            if t.flags().intersects(TypeFlags::BooleanLiteral)
                || (!expanding_enum && t.flags().intersects(TypeFlags::EnumLike))
            {
                let base_type = if t.flags().intersects(TypeFlags::BooleanLiteral) {
                    boolean
                } else {
                    base_type_of_enum_like_type(c, t)
                };
                if base_type.flags().intersects(TypeFlags::Union) {
                    let base_types = base_type.types();
                    let count = base_types.len();
                    if i + count <= types.len()
                        && regular_type_of_literal_type(types[i + count - 1])
                            == regular_type_of_literal_type(base_types[count - 1])
                    {
                        result.push(base_type);
                        i += count;
                        continue;
                    }
                }
            }
            result.push(t);
        }
        i += 1;
    }
    if flags.intersects(TypeFlags::Null) {
        result.push(c.get_null_type());
    }
    if flags.intersects(TypeFlags::Undefined) {
        result.push(c.get_undefined_type());
    }
    result
}

/// `getBaseTypeOfEnumLikeType`.
fn base_type_of_enum_like_type(c: &mut Checker, t: P<Type>) -> P<Type> {
    if t.flags().intersects(TypeFlags::EnumLike)
        && let Some(sym) = t.symbol()
        && c.get_symbol_flags_exported(sym).intersects(SymbolFlags::EnumMember)
        && let Some(parent) = c.get_parent_of_symbol_exported(sym)
    {
        return c.get_declared_type_of_symbol_exported(parent);
    }
    t
}

/// `getRegularTypeOfLiteralType` for the literal types a union holds.
pub(super) fn regular_type_of_literal_type(t: P<Type>) -> P<Type> {
    if t.flags().intersects(TypeFlags::Literal) {
        if let Some(r) = t.as_literal_type().regular_type() {
            return r;
        }
    }
    t
}

/// `UnionTypesInIdOrder`: t's constituents in Strada's order, by type id;
/// typescript-go keeps them sorted by value.
pub fn union_types_in_id_order(t: P<Type>) -> Vec<P<Type>> {
    let mut types = t.types().to_vec();
    types.sort_by_key(|x| x.id().0);
    types
}

/// The id Strada sorts a printed union member by. A member formatUnionTypes
/// collapsed (boolean, an enum) stands where its first constituent stood.
fn union_position(t: P<Type>) -> u32 {
    if t.flags().intersects(TypeFlags::Union) && !t.types().is_empty() {
        return t.types()[0].id().0;
    }
    t.id().0
}

/// Checks that each node could have been printed from the type at the same
/// position: literals and keywords must be that very type and references must
/// name it. Anything else is taken on trust.
fn union_members_match(c: &mut Checker, nodes: &[P<Node>], types: &[P<Type>]) -> bool {
    for (n, &t) in nodes.iter().zip(types) {
        if n.kind() == Kind::BooleanKeyword {
            if t != c.get_boolean_type() {
                return false;
            }
            continue;
        }
        if let Some(want) = type_of_literal_or_keyword_node(c, *n) {
            let got = if t.flags().intersects(TypeFlags::Literal) { regular_type_of_literal_type(t) } else { t };
            if got != want {
                return false;
            }
            continue;
        }
        if n.kind() == Kind::TypeReference && !reference_names(*n, t) {
            return false;
        }
    }
    true
}

fn reference_names(n: P<Node>, t: P<Type>) -> bool {
    let mut name = n.as_type_reference_node().type_name();
    if name.kind() == Kind::QualifiedName {
        name = name.as_qualified_name().right();
    }
    let text = name.text();
    if let Some(alias) = t.alias()
        && let Some(sym) = alias.symbol()
        && sym.name() == text
    {
        return true;
    }
    t.symbol().is_some_and(|s| s.name() == text)
}

/// Walks each property signature with its property's type and then sorts the
/// signatures into Strada's property order.
fn reorder_type_literal(c: &mut Checker, t: P<Type>, n: P<Node>, depth: usize) {
    let members = n.as_type_literal_node().members().nodes();
    let is_object = t.flags().intersects(TypeFlags::Object | TypeFlags::Intersection);
    for &m in members {
        let mut mt = None;
        if is_object && m.kind() == Kind::PropertySignature {
            let name = member_name(m);
            if !name.is_empty()
                && let Some(prop) = c.get_property_of_type_exported(t, &name)
            {
                mt = Some(c.get_type_of_symbol_exported(prop));
            }
        }
        if m.kind() == Kind::PropertySignature {
            reorder_typed(c, mt, m.type_node(), depth);
        } else {
            reorder_union_type_nodes(c, m);
        }
    }
    if !is_object {
        return;
    }
    let mut rank: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for (i, name) in property_order(c, t, 0).into_iter().enumerate() {
        rank.entry(name).or_insert(i);
    }
    let len = rank.len();
    sort_nodes_by_key(members, |m| match rank.get(&member_name(m)) {
        Some(&r) if m.kind() == Kind::PropertySignature => r,
        _ => len,
    });
}

fn member_name(m: P<Node>) -> String {
    let Some(name) = m.name() else { return String::new() };
    match name.kind() {
        Kind::Identifier | Kind::StringLiteral | Kind::NumericLiteral | Kind::NoSubstitutionTemplateLiteral => {
            name.text().to_string()
        }
        _ => String::new(),
    }
}

fn is_mapped(t: P<Type>) -> bool {
    t.flags().intersects(TypeFlags::Object) && t.object_flags().intersects(ObjectFlags::Mapped)
}

/// `isMappedTypeWithKeyofConstraintDeclaration`, from the mapped type node: the
/// type's symbol's first declaration is its MappedType node.
fn is_mapped_type_with_keyof_constraint_declaration(t: P<Type>) -> bool {
    let Some(decl) = t.symbol().and_then(|s| s.declarations().first().copied()) else { return false };
    if decl.kind() != Kind::MappedType {
        return false;
    }
    let Some(constraint) = decl.as_mapped_type_node().type_parameter().as_type_parameter_declaration().constraint() else {
        return false;
    };
    constraint.kind() == Kind::TypeOperator && constraint.as_type_operator_node().operator == Kind::KeyOfKeyword
}

/// The order Strada lays out t's properties in.
///   - A homomorphic mapped type (`{ [K in keyof T]: X }`) iterates T's
///     properties, so it keeps T's order. (tsrs: the modifiers type is not
///     reachable, so the type's own order stands; see PORTING.md.)
///   - Any other mapped type iterates its key union, which Strada keeps in id
///     order and typescript-go in value order; the keys are string literals,
///     interned, so their ids give back Strada's order.
///   - An intersection lists its constituents' properties in turn.
///   - A widened object literal lists its own properties, then the ones it
///     gained as `?: undefined` from the other literals in its union;
///     typescript-go sorts them all by declaration position.
///   - Every other object type keeps declaration order in both compilers.
fn property_order(c: &mut Checker, t: P<Type>, depth: usize) -> Vec<String> {
    let props = c.get_properties_of_type_exported(t);
    let mut names: Vec<String> = props.iter().map(|p| p.name().to_string()).collect();
    if depth > MAX_REORDER_DEPTH {
        return names;
    }
    if is_mapped(t) && is_mapped_type_with_keyof_constraint_declaration(t) {
        return names;
    }
    if is_mapped(t) {
        let mut keys: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
        for name in &names {
            let id = string_literal_type(c, name).map_or(0, |t| t.id().0);
            keys.insert(name.clone(), id);
        }
        names.sort_by_key(|n| keys[n]);
        return names;
    }
    if t.flags().intersects(TypeFlags::Intersection) {
        let mut order = Vec::new();
        for &m in t.types() {
            order.extend(property_order(c, m, depth + 1));
        }
        return order_by(names, &order);
    }
    if let Some(literal) = object_literal_declaration(t) {
        let (own, gained): (Vec<&P<tsrs_ast::Symbol>>, Vec<&P<tsrs_ast::Symbol>>) =
            props.iter().partition(|p| p.declarations().iter().any(|d| d.parent() == Some(literal)));
        return own.into_iter().chain(gained).map(|p| p.name().to_string()).collect();
    }
    names
}

fn object_literal_declaration(t: P<Type>) -> Option<P<Node>> {
    if !t.flags().intersects(TypeFlags::Object) {
        return None;
    }
    t.symbol()?.declarations().iter().copied().find(|d| d.kind() == Kind::ObjectLiteralExpression)
}

/// Sorts names by their first position in order; names order does not mention
/// keep their place after the rest.
fn order_by(mut names: Vec<String>, order: &[String]) -> Vec<String> {
    let mut rank: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
    for (i, name) in order.iter().enumerate() {
        rank.entry(name.as_str()).or_insert(i);
    }
    names.sort_by_key(|n| rank.get(n.as_str()).copied().unwrap_or(order.len()));
    names
}

