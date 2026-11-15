//! Port of Go `visit/check_mock.go`: a function declared `mock: true` has its
//! input and output but no body.

use tsrs_ast::{self as ast, Kind, Node};
use tsrs_core::P;

use super::Context;
use crate::diag::codes;

impl Context<'_> {
    /// `readFunctionMock` reads a function's `mock`: `true` declares it without
    /// a body. A mocked function that also has a body, or a `mock` the build
    /// cannot read, is refused rather than guessed at.
    pub fn read_function_mock(&mut self, obj: P<Node>, name: &str) -> bool {
        for p in obj.properties() {
            if !ast::is_property_assignment(*p) || !p.name().is_some_and(|n| ast::is_identifier(n) && n.text() == "mock") {
                continue;
            }
            match p.initializer().unwrap().kind() {
                Kind::TrueKeyword => {}
                Kind::FalseKeyword => return false,
                _ => {
                    self.log.critical(
                        codes::INVALID_VALUE,
                        format!("'{name}' has a `mock` the build cannot read. Use `mock: true`, or remove it."),
                    );
                    return false;
                }
            }
            for k in ["func", "default", "browser", "cli"] {
                if self.get_property_assignment_initializer(obj, k, true).is_some() {
                    self.log.critical(
                        codes::INVALID_VALUE,
                        format!(
                            "'{name}' declares `mock: true` and also has a `{k}`. A function is either mocked or implemented: remove `mock`, or remove the body."
                        ),
                    );
                    return false;
                }
            }
            return true;
        }
        false
    }
}
