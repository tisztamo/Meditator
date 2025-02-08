module.exports = {
    env: {
      es6: true
    },
    parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    },
    rules: {
      semi: ["error", "never"],
      quotes: "off",
      "object-curly-spacing": "off",
      "space-before-function-paren": ["error", {named: "never"}],
      "space-in-parens": ["error", "never"],
      "comma-dangle": ["error", "only-multiline"]
    }
  }