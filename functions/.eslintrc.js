module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    "ecmaVersion": 2022,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "error",
    "quotes": ["error", "double", {"allowTemplateLiterals": true}],
  },
  overrides: [
    {files: [
      "speaking/**/*.js", "test/speaking*.js", "scripts/seedSpeaking.js",
    ],
    globals: {fetch: "readonly", AbortSignal: "readonly"},
    rules: {
      "max-len": "off", "require-jsdoc": "off", "valid-jsdoc": "off",
      "object-curly-spacing": "off", "indent": "off",
    }},
    {
      files: ["**/*.spec.*"],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  globals: {},
};
