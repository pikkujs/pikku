//! Port of `jsdoc.go`: Strada's language-service JSDoc readers
//! (getDocumentationComment, getJsDocTags, displayPartsToString), which the
//! TypeScript collectSurface reads through. Display parts are flattened to
//! their text as they are produced, since every caller joins them anyway.

use std::collections::HashSet;

use tsrs_ast::{Kind, Node, NodeList, Symbol, SymbolFlags, is_assignment_expression, is_class_like};
use tsrs_checker::Checker;
use tsrs_core::P;

pub struct TagInfo {
    pub name: String,
    pub text: String,
}

fn jsdoc_nodes(node: P<Node>) -> &'static [P<Node>] {
    node.jsdoc(None)
}

fn single_variable_of_variable_statement(node: Option<P<Node>>) -> Option<P<Node>> {
    let node = node?;
    if node.kind() != Kind::VariableStatement {
        return None;
    }
    let list = node.as_variable_statement().declaration_list;
    list.as_variable_declaration_list().declarations.nodes().first().copied()
}

fn single_initializer_of_variable_statement_or_property_declaration(node: P<Node>) -> Option<P<Node>> {
    match node.kind() {
        Kind::VariableStatement => single_variable_of_variable_statement(Some(node)).and_then(|v| v.initializer()),
        Kind::PropertyDeclaration | Kind::PropertyAssignment => node.initializer(),
        _ => None,
    }
}

fn nested_module_declaration(node: P<Node>) -> bool {
    if node.kind() != Kind::ModuleDeclaration {
        return false;
    }
    node.body().is_some_and(|b| b.kind() == Kind::ModuleDeclaration)
}

/// Strada's getNextJSDocCommentLocation, which differs from typescript-go's own
/// in which parents it climbs to.
fn next_jsdoc_comment_location(node: P<Node>) -> Option<P<Node>> {
    let parent = node.parent()?;
    if parent.kind() == Kind::PropertyAssignment
        || parent.kind() == Kind::ExportAssignment
        || parent.kind() == Kind::PropertyDeclaration
        || (parent.kind() == Kind::ExpressionStatement && node.kind() == Kind::PropertyAccessExpression)
        || parent.kind() == Kind::ReturnStatement
        || nested_module_declaration(parent)
        || is_assignment_expression(node, false)
    {
        return Some(parent);
    }
    if let Some(gp) = parent.parent() {
        if single_variable_of_variable_statement(Some(gp)) == Some(node) || is_assignment_expression(parent, false) {
            return Some(gp);
        }
    }
    if let Some(gp) = parent.parent() {
        if let Some(ggp) = gp.parent() {
            if single_variable_of_variable_statement(Some(ggp)).is_some()
                || single_initializer_of_variable_statement_or_property_declaration(ggp) == Some(node)
            {
                return Some(ggp);
            }
        }
    }
    None
}

fn tag_nodes(jsdoc: P<Node>) -> &'static [P<Node>] {
    if jsdoc.kind() != Kind::JSDoc {
        return &[];
    }
    match jsdoc.as_jsdoc().tags {
        Some(t) => t.nodes(),
        None => &[],
    }
}

/// Keeps the last comment whole and only the @overload tags of the ones before it.
fn filter_owned_jsdoc_tags(comments: &[P<Node>]) -> Vec<P<Node>> {
    let mut out = Vec::new();
    for (i, jsdoc) in comments.iter().enumerate() {
        if i == comments.len() - 1 {
            out.push(*jsdoc);
            continue;
        }
        for tag in tag_nodes(*jsdoc) {
            if tag.kind() == Kind::JSDocOverloadTag {
                out.push(*tag);
            }
        }
    }
    out
}

/// getJSDocCommentsAndTags: JSDoc nodes and loose tags, gathered from the host
/// and the nodes its comment may sit on.
pub fn jsdoc_comments_and_tags(host: P<Node>) -> Vec<P<Node>> {
    let mut result = Vec::new();
    if let Some(init) = variable_like_initializer(host) {
        let docs = jsdoc_nodes(init);
        if !docs.is_empty() {
            result.extend(filter_owned_jsdoc_tags(docs));
        }
    }
    let mut cur = Some(host);
    while let Some(node) = cur {
        if node.parent().is_none() {
            break;
        }
        let docs = jsdoc_nodes(node);
        if !docs.is_empty() {
            result.extend(filter_owned_jsdoc_tags(docs));
        }
        if node.kind() == Kind::Parameter {
            result.extend(parameter_tags(node));
            break;
        }
        if node.kind() == Kind::TypeParameter {
            result.extend(type_parameter_tags(node));
            break;
        }
        cur = next_jsdoc_comment_location(node);
    }
    result
}

fn variable_like_initializer(node: P<Node>) -> Option<P<Node>> {
    match node.kind() {
        Kind::VariableDeclaration
        | Kind::Parameter
        | Kind::PropertyDeclaration
        | Kind::PropertyAssignment
        | Kind::BindingElement
        | Kind::EnumMember => node.initializer(),
        _ => None,
    }
}

/// getJSDocTags(node).
fn jsdoc_tags(node: P<Node>) -> Vec<P<Node>> {
    let mut tags = Vec::new();
    for each in jsdoc_comments_and_tags(node) {
        if each.kind() == Kind::JSDoc {
            tags.extend_from_slice(tag_nodes(each));
        } else {
            tags.push(each);
        }
    }
    tags
}

fn parameter_tags(param: P<Node>) -> Vec<P<Node>> {
    let Some(name) = param.name() else { return vec![] };
    let Some(parent) = param.parent() else { return vec![] };
    let param_tags: Vec<P<Node>> = jsdoc_tags(parent).into_iter().filter(|t| t.kind() == Kind::JSDocParameterTag).collect();
    if name.kind() == Kind::Identifier {
        return param_tags
            .into_iter()
            .filter(|tag| tag.name().is_some_and(|n| n.kind() == Kind::Identifier && n.text() == name.text()))
            .collect();
    }
    for (i, p) in parent.parameters().iter().enumerate() {
        if *p == param && i < param_tags.len() {
            return vec![param_tags[i]];
        }
    }
    vec![]
}

fn type_parameter_tags(param: P<Node>) -> Vec<P<Node>> {
    let Some(name) = param.name() else { return vec![] };
    let Some(parent) = param.parent() else { return vec![] };
    let mut out = Vec::new();
    for tag in jsdoc_tags(parent) {
        if tag.kind() != Kind::JSDocTemplateTag {
            continue;
        }
        for tp in tag.as_jsdoc_template_tag().type_parameters.nodes() {
            if tp.name().is_some_and(|n| n.text() == name.text()) {
                out.push(tag);
                break;
            }
        }
    }
    out
}

fn comment_list(node: P<Node>) -> Option<P<NodeList>> {
    if node.kind() == Kind::JSDoc {
        // Go's JSDoc.Comment is non-nil even for a tag-only comment (`/** @override */`),
        // so an empty comment still counts as a part and stops doc inheritance.
        return Some(node.as_jsdoc().comment);
    }
    node.comment_list()
}

fn has_comment(node: P<Node>) -> bool {
    comment_list(node).is_some()
}

/// displayPartsToString(getDisplayPartsFromComment(comment)).
fn display_text(list: Option<P<NodeList>>, c: Option<&mut Checker>) -> String {
    let Some(list) = list else { return String::new() };
    let mut c = c;
    let mut b = String::new();
    for n in list.nodes() {
        match n.kind() {
            Kind::JSDocText => b.push_str(n.text()),
            Kind::JSDocLink | Kind::JSDocLinkCode | Kind::JSDocLinkPlain => {
                b.push_str(&link_display_text(*n, c.as_deref_mut()))
            }
            _ => {}
        }
    }
    b
}

fn link_prefix(n: P<Node>) -> &'static str {
    match n.kind() {
        Kind::JSDocLink => "link",
        Kind::JSDocLinkCode => "linkcode",
        _ => "linkplain",
    }
}

/// buildLinkParts.
fn link_display_text(link: P<Node>, c: Option<&mut Checker>) -> String {
    let mut b = format!("{{@{} ", link_prefix(link));
    let name = link.name();
    let text = link.text();
    match name {
        None => b.push_str(text),
        Some(name) => {
            let mut target: Option<P<Symbol>> = None;
            if let Some(c) = c {
                if let Some(sym) = c.get_symbol_at_location_exported(name) {
                    target = symbol_target(sym, c);
                }
            }
            let suffix = find_link_name_end(text);
            let full = format!("{}{}", tsrs_scanner::get_text_of_node(name), &text[..suffix]);
            let rest = skip_separator_from_link_text(&text[suffix..]);
            let decl = target.and_then(|t| t.value_declaration().or_else(|| t.declarations().first().copied()));
            if decl.is_some() {
                b.push_str(&full);
                b.push_str(rest);
            } else {
                let sep = if suffix == 0 || (suffix < text.len() && text.as_bytes()[suffix] == b'|' && !full.ends_with(' ')) {
                    " "
                } else {
                    ""
                };
                b.push_str(&full);
                b.push_str(sep);
                b.push_str(rest);
            }
        }
    }
    b.push('}');
    b
}

fn symbol_target(sym: P<Symbol>, c: &mut Checker) -> Option<P<Symbol>> {
    let mut next = Some(sym);
    let mut i = 0;
    while i < 100 {
        match next {
            Some(n) if n.flags().intersects(SymbolFlags::Alias) => next = Some(c.get_aliased_symbol(n)),
            _ => break,
        }
        i += 1;
    }
    next
}

fn find_link_name_end(text: &str) -> usize {
    if let Some(pos) = text.find("://") {
        if pos == 0 {
            let b = text.as_bytes();
            let mut p = pos;
            while p < b.len() && b[p] != b'|' {
                p += 1;
            }
            return p;
        }
    }
    if text.starts_with("()") {
        return 2;
    }
    if text.starts_with('<') {
        let b = text.as_bytes();
        let mut brackets = 0;
        let mut i = 0;
        while i < b.len() {
            if b[i] == b'<' {
                brackets += 1;
            }
            if b[i] == b'>' {
                brackets -= 1;
            }
            i += 1;
            if brackets == 0 {
                return i;
            }
        }
    }
    0
}

fn skip_separator_from_link_text(text: &str) -> &str {
    if text.starts_with('|') {
        let b = text.as_bytes();
        let mut pos = 1;
        while pos < b.len() && b[pos] == b' ' {
            pos += 1;
        }
        return &text[pos..];
    }
    text
}

/// getTextOfJSDocComment, whose links keep their source form rather than their
/// display form.
pub fn text_of_jsdoc_comment(node: P<Node>) -> Option<String> {
    let list = comment_list(node)?;
    let mut b = String::new();
    for n in list.nodes() {
        if n.kind() == Kind::JSDocText {
            b.push_str(n.text());
            continue;
        }
        let name = n.name().map(tsrs_scanner::get_text_of_node).unwrap_or_default();
        let text = n.text();
        let space = if n.name().is_some() && (text.is_empty() || text.starts_with("://")) { "" } else { " " };
        b.push_str(&format!("{{@{} {}{}{}}}", link_prefix(*n), name, space, text));
    }
    Some(b)
}

fn is_typedef_or_callback(t: &P<Node>) -> bool {
    t.kind() == Kind::JSDocTypedefTag || t.kind() == Kind::JSDocCallbackTag
}

fn is_param_or_return(t: &P<Node>) -> bool {
    t.kind() == Kind::JSDocParameterTag || t.kind() == Kind::JSDocReturnTag
}

fn comment_having_nodes(decl: P<Node>) -> Vec<P<Node>> {
    match decl.kind() {
        Kind::JSDocParameterTag | Kind::JSDocPropertyTag => return vec![decl],
        Kind::JSDocCallbackTag | Kind::JSDocTypedefTag => {
            let mut v = vec![decl];
            if let Some(p) = decl.parent() {
                v.push(p);
            }
            return v;
        }
        Kind::JSDocSignature => {
            if let Some(p) = decl.parent() {
                if p.kind() == Kind::JSDocOverloadTag {
                    return p.parent().into_iter().collect();
                }
            }
        }
        _ => {}
    }
    jsdoc_comments_and_tags(decl)
}

fn unique_decls(decls: &[P<Node>]) -> Vec<P<Node>> {
    let mut seen = HashSet::new();
    decls.iter().copied().filter(|d| seen.insert(*d)).collect()
}

/// getJsDocCommentsFromDeclarations. The bool reports whether any part was
/// produced, which getDocumentationComment's inheritance check needs.
fn doc_comments_from_declarations(decls: &[P<Node>], mut c: Option<&mut Checker>) -> (String, bool) {
    let mut parts: Vec<String> = Vec::new();
    for decl in unique_decls(decls) {
        for jsdoc in comment_having_nodes(decl) {
            let mut inherit_doc: Option<P<Node>> = None;
            let is_doc = jsdoc.kind() == Kind::JSDoc;
            if is_doc {
                for t in tag_nodes(jsdoc) {
                    if t.kind() == Kind::JSDocUnknownTag {
                        let n = t.tag_name().text();
                        if n == "inheritDoc" || n == "inheritdoc" {
                            inherit_doc = Some(*t);
                            break;
                        }
                    }
                }
            }
            let tags = tag_nodes(jsdoc);
            if (!has_comment(jsdoc) && inherit_doc.is_none())
                || (is_doc
                    && decl.kind() != Kind::JSDocTypedefTag
                    && decl.kind() != Kind::JSDocCallbackTag
                    && tags.iter().any(is_typedef_or_callback)
                    && !tags.iter().any(is_param_or_return))
            {
                continue;
            }
            let mut text = String::new();
            if has_comment(jsdoc) {
                text = display_text(comment_list(jsdoc), c.as_deref_mut());
            }
            if let Some(inh) = inherit_doc {
                if inh.comment_list().is_some() {
                    text.push_str(&display_text(inh.comment_list(), c.as_deref_mut()));
                }
            }
            if !parts.contains(&text) {
                parts.push(text);
            }
        }
    }
    let any = !parts.is_empty();
    (parts.join("\n"), any)
}

/// Symbol.getDocumentationComment(checker) as text.
pub fn documentation_comment(sym: Option<P<Symbol>>, mut c: Option<&mut Checker>, seen: &mut HashSet<P<Symbol>>) -> String {
    let Some(sym) = sym else { return String::new() };
    let decls = sym.declarations();
    if decls.is_empty() {
        return String::new();
    }
    let (mut doc, mut any) = doc_comments_from_declarations(decls, c.as_deref_mut());
    let inherit = !any || decls.iter().any(|d| has_inherit_doc_tag(*d));
    if c.is_some() && inherit {
        for decl in decls {
            if decl.kind() == Kind::GetAccessor || decl.kind() == Kind::SetAccessor {
                continue;
            }
            let base = find_base_of_declaration(c.as_deref_mut().unwrap(), *decl, &mut |cc, s| {
                if !seen.insert(s) {
                    return None;
                }
                Some(documentation_comment(Some(s), Some(cc), seen))
            });
            if let Some(base) = base {
                if !any {
                    doc = base;
                    any = true;
                } else {
                    doc = format!("{base}\n{doc}");
                }
            }
        }
    }
    doc
}

fn has_inherit_doc_tag(node: P<Node>) -> bool {
    jsdoc_tags(node).iter().any(|t| {
        let n = t.tag_name().text();
        n == "inheritDoc" || n == "inheritdoc"
    })
}

fn super_type_nodes(node: P<Node>) -> Vec<P<Node>> {
    if node.kind() == Kind::InterfaceDeclaration {
        return tsrs_ast::get_extends_heritage_clause_elements(node).to_vec();
    }
    if is_class_like(node) {
        let mut out = Vec::new();
        if let Some(base) = tsrs_ast::get_class_extends_heritage_element(node) {
            out.push(base);
        }
        out.extend_from_slice(tsrs_ast::get_implements_heritage_clause_elements(node));
        return out;
    }
    vec![]
}

/// The first defined result of `cb` over the same member of the declaration's
/// base types.
fn find_base_of_declaration(
    c: &mut Checker,
    decl: P<Node>,
    cb: &mut dyn FnMut(&mut Checker, P<Symbol>) -> Option<String>,
) -> Option<String> {
    let mut parent = decl.parent()?;
    if parent.kind() == Kind::Constructor {
        parent = parent.parent()?;
    }
    let decl_symbol = decl.symbol()?;
    let is_static = tsrs_ast::has_static_modifier(decl);
    for super_type in super_type_nodes(parent) {
        let base_type = c.get_type_at_location(super_type);
        let mut t = base_type;
        if is_static {
            if let Some(s) = base_type.symbol() {
                t = c.get_type_of_symbol(s);
            }
        }
        let Some(prop) = c.get_property_of_type_exported(t, decl_symbol.name()) else { continue };
        if let Some(s) = cb(c, prop) {
            return Some(s);
        }
    }
    None
}

/// Symbol.getJsDocTags(checker), with each tag's display text. Only the default
/// display form is reproduced, which is what the @deprecated and @example tags
/// the surface reads use.
pub fn jsdoc_tags_of_symbol(sym: Option<P<Symbol>>, mut c: Option<&mut Checker>) -> Vec<TagInfo> {
    let Some(sym) = sym else { return vec![] };
    let mut infos = Vec::new();
    for decl in unique_decls(sym.declarations()) {
        let tags = jsdoc_tags(decl);
        if tags.iter().any(is_typedef_or_callback) && !tags.iter().any(is_param_or_return) {
            continue;
        }
        for tag in tags {
            infos.push(TagInfo { name: tag.tag_name().text().to_string(), text: display_text(tag.comment_list(), c.as_deref_mut()) });
            infos.extend(property_tag_infos(tag, c.as_deref_mut()));
        }
    }
    infos
}

fn property_tag_infos(tag: P<Node>, mut c: Option<&mut Checker>) -> Vec<TagInfo> {
    if tag.kind() != Kind::JSDocParameterTag && tag.kind() != Kind::JSDocPropertyTag {
        return vec![];
    }
    let pt = tag.as_jsdoc_parameter_or_property_tag();
    if !pt.is_name_first {
        return vec![];
    }
    let Some(te) = pt.type_expression else { return vec![] };
    let Some(lit) = te.type_node() else { return vec![] };
    if lit.kind() != Kind::JSDocTypeLiteral {
        return vec![];
    }
    let mut out = Vec::new();
    for p in lit.as_jsdoc_type_literal().jsdoc_property_tags {
        out.push(TagInfo { name: p.tag_name().text().to_string(), text: display_text(p.comment_list(), c.as_deref_mut()) });
        out.extend(property_tag_infos(*p, c.as_deref_mut()));
    }
    out
}
