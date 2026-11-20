import { describe, expect, it } from "vitest";
import { MAX_API_BODY_BYTES, checkApiRequest, type GuardInput } from "@/server/auth/request-guard";

const base: GuardInput = {
  method: "POST", contentLength: "120", transferEncoding: null, origin: null, secFetchSite: null, host: "app.example.com",
};
const check = (over: Partial<GuardInput>) => checkApiRequest({ ...base, ...over });

describe("checkApiRequest: cross-site requests", () => {
  it("lets same-origin browser requests through", () => {
    expect(check({ origin: "https://app.example.com", secFetchSite: "same-origin" })).toBeNull();
  });
  it("lets requests without an Origin through (scripts and tools carry no browser cookies)", () => {
    expect(check({})).toBeNull();
  });
  it("blocks a different origin on any changing method", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(check({ method, origin: "https://evil.example" })).toMatchObject({ status: 403 });
    }
  });
  it("blocks Sec-Fetch-Site: cross-site even if Origin is missing", () => {
    expect(check({ secFetchSite: "cross-site" })).toMatchObject({ status: 403 });
  });
  it("blocks look-alike hosts and unreadable origins", () => {
    expect(check({ origin: "https://app.example.com.evil.example" })).toMatchObject({ status: 403 });
    expect(check({ origin: "https://evil.example/app.example.com" })).toMatchObject({ status: 403 });
    expect(check({ origin: "not a url" })).toMatchObject({ status: 403 });
  });
  it("compares the port too", () => {
    expect(check({ host: "localhost:3000", origin: "http://localhost:3000" })).toBeNull();
    expect(check({ host: "localhost:3000", origin: "http://localhost:4000" })).toMatchObject({ status: 403 });
  });
  it("does not touch reads", () => {
    expect(check({ method: "GET", origin: "https://evil.example", secFetchSite: "cross-site" })).toBeNull();
    expect(check({ method: "HEAD", origin: "https://evil.example" })).toBeNull();
  });
});

describe("checkApiRequest: body size", () => {
  it("accepts bodies up to the limit", () => {
    expect(check({ contentLength: String(MAX_API_BODY_BYTES) })).toBeNull();
  });
  it("rejects bodies over the limit with 413", () => {
    expect(check({ contentLength: String(MAX_API_BODY_BYTES + 1) })).toMatchObject({ status: 413 });
  });
  it("rejects a nonsense Content-Length", () => {
    for (const v of ["abc", "-5", "1.5", ""]) expect(check({ contentLength: v })).toMatchObject({ status: 400 });
  });
  it("rejects a body of unknown length (chunked)", () => {
    expect(check({ contentLength: null, transferEncoding: "chunked" })).toMatchObject({ status: 411 });
  });
  it("accepts a request with no body at all", () => {
    expect(check({ contentLength: null, transferEncoding: null })).toBeNull();
  });
  it("does not limit reads", () => {
    expect(check({ method: "GET", contentLength: "999999999" })).toBeNull();
  });
});
