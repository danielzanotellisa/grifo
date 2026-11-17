import { DomainError } from "@app/platform";

/** Reads a JSON body without buffering more than `maxBytes`: a hostile client cannot make the process hold more. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const tooLarge = () => new DomainError("PAYLOAD_TOO_LARGE", "The body is too large", 413);
  const declared = Number(request.headers.get("content-length"));
  if (declared > maxBytes) throw tooLarge();

  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    for await (const chunk of request.body) {
      size += chunk.byteLength;
      if (size > maxBytes) throw tooLarge();
      chunks.push(chunk);
    }
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw invalidInput("The body is not valid JSON");
  }
}

export const invalidInput = (message: string): DomainError =>
  new DomainError("VALIDATION_FAILED", message, 400);
