//! Port of Go `tsutil/print.go`.

use std::cell::RefCell;
use std::rc::Rc;

use tsrs_ast::{self as ast, Kind, Node, Symbol};
use tsrs_core::{P, UTF16Offset};
use tsrs_printer::{EmitTextWriter, PrintHandlers, PrinterOptions, new_printer, new_text_writer};

use super::source_file_of;

#[derive(Default)]
struct Track {
    last_open: i64,
    close_next: bool,
    cut: Vec<usize>,
    stack: Vec<i64>,
    text_pos: usize,
}

/// Go's `parenTrackingWriter`: the text writer, recording where `(` was last
/// written and the `)` to cut.
struct ParenTrackingWriter {
    inner: Box<dyn EmitTextWriter>,
    track: Rc<RefCell<Track>>,
}

impl ParenTrackingWriter {
    fn sync(&self) {
        self.track.borrow_mut().text_pos = self.inner.get_text_pos() as usize;
    }
}

macro_rules! delegate {
    ($($name:ident($($arg:ident : $ty:ty),*)),* $(,)?) => {
        $(fn $name(&mut self, $($arg: $ty),*) { self.inner.$name($($arg),*); self.sync(); })*
    };
}

impl EmitTextWriter for ParenTrackingWriter {
    delegate!(
        write(s: &str),
        write_trailing_semicolon(t: &str),
        write_comment(t: &str),
        write_keyword(t: &str),
        write_operator(t: &str),
        write_space(t: &str),
        write_string_literal(t: &str),
        write_parameter(t: &str),
        write_property(t: &str),
        write_symbol(t: &str, s: P<Symbol>),
        write_line(),
        write_line_force(f: bool),
        increase_indent(),
        decrease_indent(),
        clear(),
        raw_write(s: &str),
        write_literal(s: &str),
    );

    fn write_punctuation(&mut self, s: &str) {
        self.inner.write_punctuation(s);
        self.sync();
        let pos = self.inner.get_text_pos() as i64 - 1;
        let mut t = self.track.borrow_mut();
        if s == "(" {
            t.last_open = pos;
        } else if s == ")" && t.close_next {
            t.close_next = false;
            t.cut.push(pos as usize);
        }
    }

    fn string(&self) -> String {
        self.inner.string()
    }
    fn get_text_pos(&self) -> u32 {
        self.inner.get_text_pos()
    }
    fn get_line(&self) -> u32 {
        self.inner.get_line()
    }
    fn get_column(&self) -> UTF16Offset {
        self.inner.get_column()
    }
    fn get_indent(&self) -> u32 {
        self.inner.get_indent()
    }
    fn is_at_start_of_line(&self) -> bool {
        self.inner.is_at_start_of_line()
    }
    fn has_trailing_comment(&self) -> bool {
        self.inner.has_trailing_comment()
    }
    fn has_trailing_whitespace(&self) -> bool {
        self.inner.has_trailing_whitespace()
    }
}

/// `PrintNode` is `ts.createPrinter({removeComments: true}).printNode`.
///
/// typescript-go ranks a non-null assertion at unary precedence, so it prints
/// `x!.y` as `(x!).y`; Strada treats `x!` as a left-hand-side expression and
/// never parenthesises it. The hash must stay byte-compatible with the TS
/// inspector, so those synthesised parens are recorded as they are written and
/// cut from the output.
pub fn print_node(n: P<Node>) -> String {
    let track = Rc::new(RefCell::new(Track { last_open: -1, ..Default::default() }));
    let mut w = ParenTrackingWriter { inner: new_text_writer("\n", 0), track: track.clone() };

    let before_track = track.clone();
    let after_track = track.clone();
    let handlers = PrintHandlers {
        on_before_emit_node: Some(Box::new(move |node: Option<P<Node>>| {
            let Some(node) = node else { return };
            if node.kind() != Kind::NonNullExpression {
                return;
            }
            let mut t = before_track.borrow_mut();
            let mut open = -1;
            if t.last_open == t.text_pos as i64 - 1 && is_left_hand_operand(node) {
                open = t.last_open;
            }
            t.stack.push(open);
        })),
        on_after_emit_node: Some(Box::new(move |node: Option<P<Node>>| {
            let Some(node) = node else { return };
            let mut t = after_track.borrow_mut();
            if node.kind() != Kind::NonNullExpression || t.stack.is_empty() {
                return;
            }
            let open = t.stack.pop().unwrap();
            if open >= 0 {
                t.cut.push(open as usize);
                t.close_next = true;
            }
        })),
        ..Default::default()
    };
    let mut p = new_printer(PrinterOptions { remove_comments: true, ..Default::default() }, handlers, None);
    p.write(n, Some(source_file_of(n)), &mut w, None);
    let out = w.string();
    let mut cut = std::mem::take(&mut track.borrow_mut().cut);
    if cut.is_empty() {
        return out;
    }
    cut.sort_unstable();
    let bytes = out.as_bytes();
    let mut b: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut prev = 0;
    for i in cut {
        b.extend_from_slice(&bytes[prev..i]);
        prev = i + 1;
    }
    b.extend_from_slice(&bytes[prev..]);
    String::from_utf8(b).expect("cut only removes ASCII parens")
}

/// `x!` is what is accessed, called, constructed or incremented, the places
/// typescript-go adds parens. A `(` written just before it anywhere else is the
/// source's own: an argument list, `if (`, a ParenthesizedExpression.
fn is_left_hand_operand(node: P<Node>) -> bool {
    let Some(parent) = node.parent() else { return false };
    match parent.kind() {
        Kind::PropertyAccessExpression
        | Kind::ElementAccessExpression
        | Kind::CallExpression
        | Kind::NewExpression
        | Kind::TaggedTemplateExpression => parent.expression() == Some(node),
        Kind::PostfixUnaryExpression => parent.as_postfix_unary_expression().operand() == node,
        _ => false,
    }
}

#[allow(dead_code)]
fn _keep(_: &dyn Fn(P<Node>) -> bool) {
    let _ = ast::is_identifier;
}
