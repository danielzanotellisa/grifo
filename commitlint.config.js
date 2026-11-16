const SPEC_TYPES = ["feat", "fix"];
const SPEC_FOOTER = /^Spec:\s*(n\/a|[\w/-]+(#AC-\d+)?(\s*,\s*[\w/-]+(#AC-\d+)?)*)\s*$/im;

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "spec-footer": ({ type, footer }) => [
          !SPEC_TYPES.includes(type) || SPEC_FOOTER.test(footer ?? ""),
          "feat and fix commits need a 'Spec: <spec-id>[#AC-n], ...' footer (or 'Spec: n/a')",
        ],
      },
    },
  ],
  rules: {
    "spec-footer": [2, "always"],
    "type-enum": [2, "always", ["feat", "fix", "refactor", "test", "docs", "chore"]],
    "scope-enum": [
      2,
      "always",
      [
        "web",
        "worker",
        "platform",
        "identity",
        "library",
        "annotation",
        "outline",
        "study",
        "export",
        "db",
        "infra",
        "docs",
        "ci",
        "deps",
      ],
    ],
  },
};
