import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderPt } from "../../test/render";
import LoginPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

describe("login page", () => {
  it("[user/screens#AC-6] says the email was confirmed for ?verified=1 and not otherwise", async () => {
    const { unmount } = renderPt(
      await LoginPage({ searchParams: Promise.resolve({ verified: "1" }) }),
    );
    expect(screen.getByRole("status").textContent).toContain("E-mail confirmado");
    unmount();

    renderPt(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("status")).toBeNull();
    renderPt(await LoginPage({ searchParams: Promise.resolve({ verified: "0" }) }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
