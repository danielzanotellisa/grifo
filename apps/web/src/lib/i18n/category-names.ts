/**
 * Names of the default categories in the default locale (pt-BR), until the i18n library is chosen
 * (docs/pending/P-009). The stored name is plain user data after the seed.
 */
const NAMES: Record<string, string> = {
  "category.default.topic": "Tópico",
  "category.default.definition": "Definição",
  "category.default.example": "Exemplo",
  "category.default.important": "Importante",
};

export const categoryName = (key: string): string => NAMES[key] ?? key;
