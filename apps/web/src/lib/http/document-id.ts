import { notFound } from "@app/platform";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A path id that is not a UUID can name nothing, so it answers like a missing resource. */
export function documentIdFrom(id: string): string {
  if (!UUID.test(id)) throw notFound("document");
  return id;
}
