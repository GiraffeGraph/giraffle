import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  expoConfig,
  // Jest loads manual mocks as CommonJS modules on Node.
  { files: ["__mocks__/**/*.js"], languageOptions: { globals: { __dirname: "readonly" } } },
  // `.jest-staging` holds a verbatim copy of a published dependency that Jest
  // needs outside node_modules; it is not this project's code to lint.
  { ignores: ["dist/**", ".expo/**", ".jest-staging/**", "android/**", "ios/**", "assets/editor/**", "assets/canvas/**"] }
]);
