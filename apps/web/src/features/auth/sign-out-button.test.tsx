import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderPt } from "../../test/render";
import { SignOutButton } from "./sign-out-button";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("sign-out button", () => {
  it("[user/screens#AC-7] ends the session and goes to the sign-in screen", async () => {
    fetchMock.mockResolvedValue(Response.json({ success: true }));
    const user = userEvent.setup();
    renderPt(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: "Sair" }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/login"));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/auth/sign-out");
    expect(init.method).toBe("POST");
  });
});
