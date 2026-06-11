// Flat ESLint config for the whole workspace: TS everywhere, React-hooks
// rules for the mobile app, Prettier last so formatting stays Prettier's job.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/",
      "**/.expo/",
      "**/dist/",
      "**/*.config.js", // metro/babel CommonJS configs
      "**/expo-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  prettier,
);
