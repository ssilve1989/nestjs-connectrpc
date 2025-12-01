// biome-ignore lint/style/noDefaultExport: commitlint config
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-max-line-length': [2, 'always', 150],
  },
};
