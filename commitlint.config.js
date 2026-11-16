export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
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
