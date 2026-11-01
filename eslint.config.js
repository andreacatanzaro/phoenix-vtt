import js from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";

const pure = {
  "no-restricted-globals": [
    "error",
    { name: "fetch", message: "Engine packages are pure: no network." },
    { name: "process", message: "Engine packages are pure: no environment." },
    { name: "setTimeout", message: "Engine packages are pure: no clock." },
    { name: "setInterval", message: "Engine packages are pure: no clock." },
  ],
  "no-restricted-properties": [
    "error",
    { object: "Math", property: "random", message: "Use the injected Rng." },
    { object: "Date", property: "now", message: "Time comes from the context." },
    { object: "performance", property: "now", message: "Time comes from the context." },
    { object: "crypto", property: "getRandomValues", message: "Use the injected Rng." },
    { object: "crypto", property: "randomUUID", message: "Ids come from the context." },
  ],
  "no-restricted-syntax": [
    "error",
    { selector: "NewExpression[callee.name='Date']", message: "Time comes from the context." },
    { selector: "CallExpression[callee.name='Date']", message: "Time comes from the context." },
  ],
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        { group: ["node:*", "fs", "fs/*", "net", "http", "https", "child_process", "crypto", "pg", "fastify", "@fastify/*", "drizzle-orm", "drizzle-orm/*", "react", "react-dom", "pixi.js"], message: "Engine packages cannot import IO, network, database or UI." },
      ],
    },
  ],
};

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["packages/rules-core/src/**/*.ts", "packages/rules-srd/src/**/*.ts"],
    rules: pure,
  },
  {
    files: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
    plugins: { boundaries },
    settings: {
      "import/resolver": { typescript: { project: ["packages/*/tsconfig.json", "apps/*/tsconfig.json"] } },
      "boundaries/elements": [
        { type: "rules-core", pattern: "packages/rules-core/**", partialMatch: false },
        { type: "rules-srd", pattern: "packages/rules-srd/**", partialMatch: false },
        { type: "content", pattern: "packages/content/**", partialMatch: false },
        { type: "shared", pattern: "packages/shared/**", partialMatch: false },
        { type: "server", pattern: "apps/server/**", partialMatch: false },
        { type: "client", pattern: "apps/client/**", partialMatch: false },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            { from: { element: { type: "rules-core" } }, allow: { to: { element: { type: "rules-core" } } } },
            { from: { element: { type: "rules-srd" } }, allow: { to: { element: { type: ["rules-srd", "rules-core", "shared"] } } } },
            { from: { element: { type: "content" } }, allow: { to: { element: { type: ["content", "rules-core", "rules-srd", "shared"] } } } },
            { from: { element: { type: "shared" } }, allow: { to: { element: { type: "shared" } } } },
            { from: { element: { type: "server" } }, allow: { to: { element: { type: ["server", "rules-core", "rules-srd", "content", "shared"] } } } },
            { from: { element: { type: "client" } }, allow: { to: { element: { type: ["client", "rules-core", "rules-srd", "content", "shared"] } } } },
          ],
        },
      ],
    },
  },
);
