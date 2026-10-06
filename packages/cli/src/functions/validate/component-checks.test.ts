import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { isShadcnApp, runComponentChecks } from "./component-checks.js";

const write = async (root: string, rel: string, content: string) => {
  const file = join(root, rel);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
};

const app = async (file: string, source: string) => {
  const root = await mkdtemp(join(tmpdir(), "pikku-components-"));
  await write(root, "components.json", "{}");
  await write(root, `src/components/ui/${file}`, source);
  return root;
};

const ids = async (root: string) => (await runComponentChecks(root)).map((f) => f.id);

describe("component checks", () => {
  test("only an app with components.json and a ui folder is a shadcn app", async () => {
    const bare = await mkdtemp(join(tmpdir(), "pikku-components-"));
    assert.equal(isShadcnApp(bare), false);
    assert.equal(isShadcnApp(await app("a.tsx", "")), true);
  });

  test("a component that reads messages and uses logical classes is clean", async () => {
    const root = await app(
      "dialog.tsx",
      `export const Close = () => <button className="ms-2 pe-4 text-start rounded-s-md border-e" aria-label={m.close()}>{m.close()}</button>\n`,
    );
    assert.deepEqual(await runComponentChecks(root), []);
  });

  test("literal text and a literal aria-label are errors", async () => {
    const root = await app(
      "dialog.tsx",
      `export const Close = () => <button aria-label="Close"><span className="sr-only">Close</span></button>\n`,
    );
    assert.deepEqual(await ids(root), ["component-literal-string", "component-literal-string"]);
  });

  test("physical classes are errors that name the logical class", async () => {
    const root = await app(
      "card.tsx",
      `export const C = ({ n }: { n: string }) => <div className={cn("ml-2 -mr-1 pl-4 pr-4 left-1/2 text-left rounded-l-md border-r", "md:ml-4")}>{n}</div>\n`,
    );
    const found = (await runComponentChecks(root)).filter(
      (f) => f.id === "component-physical-class",
    );
    assert.deepEqual(found.map((f) => f.fixHint).sort(), [
      'Use "-me-1"',
      'Use "border-e"',
      'Use "ms-2"',
      'Use "ms-4"',
      'Use "pe-4"',
      'Use "ps-4"',
      'Use "rounded-s-md"',
      'Use "start-1/2"',
      'Use "text-start"',
    ]);
    assert.equal(found.length, 9);
    assert.ok(found.every((f) => f.severity === "error"));
  });

  test("longer classes that merely contain left or right are not physical", async () => {
    const root = await app(
      "popover.tsx",
      `export const P = () => <div className="data-[side=left]:slide-in-from-right-2 rounded-lg group-left shadow">{m.x()}</div>\n`,
    );
    const found = (await runComponentChecks(root)).filter(
      (f) => f.id === "component-physical-class",
    );
    assert.deepEqual(
      found.map((f) => f.message),
      [],
    );
  });

  test("stories and tests are not checked", async () => {
    const root = await app("button.stories.tsx", `export const S = () => <b>Hello</b>\n`);
    assert.deepEqual(await runComponentChecks(root), []);
  });
});
