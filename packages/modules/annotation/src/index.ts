export type { Category } from "./domain/category";
export { DEFAULT_CATEGORIES, isHexColor } from "./domain/category";
export type { Highlight } from "./domain/highlight";
export { normalizeQuoteText } from "./domain/highlight";
export { createCategorySyncHandler } from "./infra/category-sync";
export { categoryTrashParticipant } from "./infra/category-trash";
export { seedDefaultCategories } from "./infra/seed";
