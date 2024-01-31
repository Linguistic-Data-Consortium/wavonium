module.exports = {
  parserOptions: {
    extraFileExtensions: ['.svelte']
  },
  extends: [
    'eslint:recommended',
    'plugin:svelte/recommended',
    '@electron-toolkit/eslint-config-ts/recommended',
    '@electron-toolkit/eslint-config-prettier'
  ],
  overrides: [
    {
      files: ['*.svelte'],
      parser: 'svelte-eslint-parser',
      parserOptions: {
        parser: '@typescript-eslint/parser'
      },
      indent: ['error', 4],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'off'
      }
    }
  ]
}
