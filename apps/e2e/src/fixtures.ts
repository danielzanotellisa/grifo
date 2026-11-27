import { test as base, type Page } from "@playwright/test";
import { createVerifiedAccount, signInThroughApi, withOwnClientIp, type Account } from "./account";

type Fixtures = { account: Account; signedIn: Page };

/** `page` has its own client address; `signedIn` is that page with a fresh confirmed account signed in. */
export const test = base.extend<Fixtures>({
  page: async ({ page }, use) => {
    await withOwnClientIp(page);
    await use(page);
  },
  account: async ({ request }, use) => {
    await use(await createVerifiedAccount(request));
  },
  signedIn: async ({ page, account }, use) => {
    await signInThroughApi(page, account);
    await use(page);
  },
});

export { expect } from "@playwright/test";
