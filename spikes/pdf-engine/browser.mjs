import { chromium } from "playwright";
import os from "node:os";
export const CHROME = `${os.homedir()}/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
export const launch = (opts = {}) => chromium.launch({ executablePath: CHROME, ...opts });
