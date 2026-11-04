import { expect, test } from "vitest";

// @ts-expect-error plain .mjs module without types
import { payload } from "../../../scripts/payload.mjs";

const encode = payload as (document: unknown) => string;

test.each([
  ["é", "\\u00e9"],
  ["\u2028", "\\u2028"],
  ["\u202e", "\\u202e"],
  ["\u{1F600}", "\\ud83d\\ude00"],
  ["\u007f", "\u007f"],
  ["a/b", "a/b"],
])("writes %j as %j inside a JSON string", (value, written) => {
  expect(encode({ v: value })).toBe(`{"v":"${written}"}`);
});

test.each([
  ["</script", "<\\/script"],
  ["<!--", "<\\u0021--"],
  ["##[warning]", "#\\u0023[warning]"],
])("breaks %j into %j", (value, written) => {
  expect(encode(value)).toBe(`"${written}"`);
});

test("escapes a non-ASCII property name as it escapes a value", () => {
  expect(encode({ ключ: 1 })).toBe('{"\\u043a\\u043b\\u044e\\u0447":1}');
});

test("parses back to the input", () => {
  const document = { a: ["é\u2028</script><!--##[x]\u{1F600}\u007f/"], b: { ключ: 1 } };

  expect(JSON.parse(encode(document))).toEqual(document);
});
