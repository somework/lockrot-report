import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["legacy/", "fixtures/", "build/", "dist/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      // The renderer has one sanctioned way to put markup on the page: JSX. Anything that parses a
      // string as HTML reopens the class of bug the rewrite exists to close.
      "no-restricted-properties": [
        "error",
        { property: "innerHTML", message: "Render with JSX; never parse strings as HTML." },
        { property: "outerHTML", message: "Render with JSX; never parse strings as HTML." },
        { property: "insertAdjacentHTML", message: "Render with JSX; never parse strings as HTML." },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: "Never set raw HTML." },
      ],
    },
  },
  { files: ["**/*.mjs", "**/*.js"], ...tseslint.configs.disableTypeChecked },
);
