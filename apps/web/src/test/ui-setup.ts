import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { FakeXMLHttpRequest } from "./fake-xhr";

// `findBy` and `waitFor` wait 1 s by default, which a busy machine or a small CI runner can exceed.
configure({ asyncUtilTimeout: 5000 });
afterEach(cleanup);

// The upload of a PDF reads its progress with XMLHttpRequest; the tests answer it through the fake API.
vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
