import { MAILPIT_URL } from "./env";

type Message = { ID: string; To: { Address: string }[] };

/** The first link of the mail Mailpit received for `address`; the worker sends it a moment after sign-up. */
export async function mailLinkFor(address: string, timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = (await (await fetch(`${MAILPIT_URL}/api/v1/messages`)).json()) as {
      messages?: Message[];
    };
    const message = list.messages?.find((m) => m.To.some((to) => to.Address === address));
    if (message) {
      const full = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`)).json()) as {
        Text: string;
      };
      const link = /https?:\/\/\S+/.exec(full.Text)?.[0];
      if (link) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`No mail with a link for ${address} after ${timeoutMs} ms`);
}
