// The bytes of lockrot's `HtmlFormatter::payload()`: PHP `json_encode` without
// `JSON_UNESCAPED_UNICODE`, then `</`, `<!--` and `##[` broken in the order lockrot does.
export const payload = (document) =>
  JSON.stringify(document)
    .replace(/[\u0080-￿]/g, (unit) => "\\u" + unit.charCodeAt(0).toString(16).padStart(4, "0"))
    .replace(/<\//g, "<\\/")
    .replace(/<!--/g, "<\\u0021--")
    .replace(/##\[/g, "#\\u0023[");
