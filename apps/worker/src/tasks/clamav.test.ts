import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createClamavScanner } from "./clamav";

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

/** Reads a `zINSTREAM` conversation; `answer` gets the bytes received and decides the reply. */
const daemon = async (
  answer: (received: Buffer, socket: Socket) => string | null,
): Promise<number> => {
  const server = createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const command = "zINSTREAM\0";
      if (
        buffer.length < command.length ||
        buffer.subarray(0, command.length).toString() !== command
      )
        return;
      let offset = command.length;
      const payload: Buffer[] = [];
      while (buffer.length >= offset + 4) {
        const size = buffer.readUInt32BE(offset);
        if (size === 0) {
          const reply = answer(Buffer.concat(payload), socket);
          if (reply !== null) socket.end(`${reply}\0`);
          return;
        }
        if (buffer.length < offset + 4 + size) return;
        payload.push(buffer.subarray(offset + 4, offset + 4 + size));
        offset += 4 + size;
      }
    });
    socket.on("error", () => undefined);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as { port: number }).port;
};

const scannerFor = (port: number, timeoutMs = 2000) =>
  createClamavScanner({ host: "127.0.0.1", port, timeoutMs });

describe("the clamd client", () => {
  it("[document/deep-scan#AC-6] answers clean for OK and malware with the signature for FOUND", async () => {
    const ok = await daemon(() => "stream: OK");
    const found = await daemon(() => "stream: Eicar-Test-Signature FOUND");

    expect(await scannerFor(ok)(Buffer.from("texto"))).toEqual({ clean: true });
    expect(await scannerFor(found)(Buffer.from("texto"))).toEqual({
      clean: false,
      signature: "Eicar-Test-Signature",
    });
  });

  it("[document/deep-scan#AC-6] treats an error answer, a size answer, a refused connection and silence as errors", async () => {
    const error = await daemon(() => "stream: some failure ERROR");
    const size = await daemon(() => "INSTREAM size limit exceeded. ERROR");
    const closed = await daemon((_received, socket) => {
      socket.destroy();
      return null;
    });
    const silent = await daemon(() => null);
    const refused = await daemon(() => "stream: OK");
    servers.pop()!.close();

    await expect(scannerFor(error)(Buffer.from("x"))).rejects.toThrow("ERROR");
    await expect(scannerFor(size)(Buffer.from("x"))).rejects.toThrow("size limit");
    await expect(scannerFor(closed)(Buffer.from("x"))).rejects.toThrow();
    await expect(scannerFor(silent, 200)(Buffer.from("x"))).rejects.toThrow("timed out");
    await expect(scannerFor(refused)(Buffer.from("x"))).rejects.toThrow();
  });

  it("[document/deep-scan#AC-6] sends every byte of a large stream", async () => {
    let received = 0;
    const port = await daemon((bytes) => {
      received = bytes.length;
      return "stream: OK";
    });
    const big = Buffer.alloc(7 * 1024 * 1024 + 123, 1);

    await scannerFor(port)(big);

    expect(received).toBe(big.length);
  });
});
