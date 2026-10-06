import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { readJsxLiteralText } from "@pikku/inspector";
import type { ValidateFinding } from "./persona-checks.js";

const UI_DIR = "src/components/ui";

const isComponent = (name: string) =>
  name.endsWith(".tsx") && !name.endsWith(".stories.tsx") && !name.endsWith(".test.tsx");

/**
 * A physical-direction utility and the logical one that replaces it. Physical
 * classes are wrong in right-to-left locales, and the shadcn CLI copies them in.
 * `(?<![\w-])` keeps a longer class (`slide-in-from-left-2`) from matching.
 */
const PHYSICAL: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [
    /(?<![\w-])(-?)(ml|mr|pl|pr)-(?=[\w[(./-])/g,
    (m) => `${m[1]}${m[2] === "ml" ? "ms" : m[2] === "mr" ? "me" : m[2] === "pl" ? "ps" : "pe"}-`,
  ],
  [
    /(?<![\w-])(-?)(left|right)-(?=[\w[(./-])/g,
    (m) => `${m[1]}${m[2] === "left" ? "start" : "end"}-`,
  ],
  [/(?<![\w-])text-(left|right)(?![\w-])/g, (m) => `text-${m[1] === "left" ? "start" : "end"}`],
  [/(?<![\w-])(rounded|border)-(l|r)(?![a-z0-9])/g, (m) => `${m[1]}-${m[2] === "l" ? "s" : "e"}`],
];

const collect = async (dir: string, out: string[] = []) => {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collect(path, out);
    else if (isComponent(entry.name)) out.push(path);
  }
  return out;
};

const lineOf = (source: string, index: number) => source.slice(0, index).split("\n").length;

/** A shadcn app is one with a `components.json` and a `src/components/ui` folder. */
export const isShadcnApp = (dir: string) =>
  existsSync(join(dir, "components.json")) && existsSync(join(dir, UI_DIR));

/**
 * What the shadcn CLI copies into `src/components/ui` is not ready to ship: it
 * carries literal text, and physical left/right classes. Both are errors here, so
 * the build fails until the change that added the component has fixed them.
 */
export const runComponentChecks = async (dir: string): Promise<ValidateFinding[]> => {
  const findings: ValidateFinding[] = [];
  for (const file of await collect(join(dir, UI_DIR))) {
    const shown = relative(dir, file);
    const source = await readFile(file, "utf8");

    for (const { text, line } of readJsxLiteralText(file, source)) {
      findings.push({
        id: "component-literal-string",
        severity: "error",
        message: `${shown}:${line} renders the literal string "${text}" — a component's words come from messages so the app can translate them`,
        path: file,
        fixHint: "Read it from the messages module (m.<key>()) and add the key to messages/en.json",
      });
    }

    const seen = new Set<string>();
    for (const [pattern, logical] of PHYSICAL) {
      for (const match of source.matchAll(pattern)) {
        const at = match.index!;
        const token = source.slice(at).match(/^[^\s"'`)]+/)![0];
        const key = `${at}:${token}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          id: "component-physical-class",
          severity: "error",
          message: `${shown}:${lineOf(source, at)} uses "${token}", which points the wrong way in right-to-left locales`,
          path: file,
          fixHint: `Use "${token.replace(match[0], logical(match))}"`,
        });
      }
    }
  }
  return findings;
};
