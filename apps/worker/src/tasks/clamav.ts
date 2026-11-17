import type { Scanner } from "@app/library";
import { connect } from "node:net";

const CHUNK_BYTES = 64 * 1024;
const FOUND = /^stream: (.+) FOUND$/;

/**
 * Scanner over the clamd `zINSTREAM` protocol (ADR 0038): the command, length-prefixed chunks, a
 * zero length to end, and one line of answer. Anything but `OK` or `FOUND` is an error, never a
 * clean result.
 */
export function createClamavScanner(opts: {
  host: string;
  port: number;
  timeoutMs?: number;
}): Scanner {
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;

  return (bytes) =>
    new Promise((resolve, reject) => {
      const socket = connect({ host: opts.host, port: opts.port });
      const answer: Buffer[] = [];
      const fail = (error: Error) => {
        socket.destroy();
        reject(error);
      };

      socket.setTimeout(timeoutMs, () => fail(new Error("clamd timed out")));
      socket.on("error", fail);
      socket.on("data", (chunk: Buffer) => answer.push(chunk));
      socket.on("close", () => {
        const text = Buffer.concat(answer).toString("utf8").replace(/\0+$/, "").trim();
        if (text === "stream: OK") return resolve({ clean: true });
        const found = FOUND.exec(text);
        if (found) return resolve({ clean: false, signature: found[1]! });
        reject(new Error(text ? `clamd answered: ${text}` : "clamd closed without an answer"));
      });
      socket.on("connect", () => {
        socket.write("zINSTREAM\0");
        for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
          const chunk = bytes.subarray(offset, offset + CHUNK_BYTES);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(chunk.length);
          socket.write(size);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
    });
}
