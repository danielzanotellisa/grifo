import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import messages from "../../messages/pt-BR.json";

/** Renders a client component with the real pt-BR messages, as the root layout provides them. */
export const renderPt = (ui: ReactElement) =>
  render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

/** What the API answers on failure: Problem Details with a stable code (`docs/specs/user`). */
export const problem = (status: number, code: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ type: "about:blank", title: code, status, code }), {
    status,
    headers: { "content-type": "application/problem+json", ...headers },
  });
