import { v7 as uuidv7 } from "uuid";

/** UUIDv7: time-ordered, safe to generate on the client (ADR 0006). */
export const newId = (): string => uuidv7();
