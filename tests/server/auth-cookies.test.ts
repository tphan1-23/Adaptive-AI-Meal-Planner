import { describe, expect, it } from "vitest";
import { dropMalformedAuthCookies } from "@/server/auth/cookies";

const session = { access_token: "a", refresh_token: "b" };
const encoded = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
const c = (name: string, value: string) => ({ name, value });

describe("dropMalformedAuthCookies", () => {
  it("keeps a valid base64 session and unrelated cookies", () => {
    const all = [c("sb-abc-auth-token", encoded), c("theme", "dark")];
    expect(dropMalformedAuthCookies(all)).toEqual(all);
  });
  it("keeps a valid plain JSON session", () => {
    const all = [c("sb-abc-auth-token", JSON.stringify(session))];
    expect(dropMalformedAuthCookies(all)).toEqual(all);
  });
  it("drops a forged session but keeps other cookies", () => {
    const out = dropMalformedAuthCookies([c("sb-abc-auth-token", "base64-notarealsession"), c("theme", "dark")]);
    expect(out).toEqual([c("theme", "dark")]);
  });
  it("drops invalid UTF-8 and non-JSON content", () => {
    const badUtf8 = "base64-" + Buffer.from([0xff, 0xfe, 0xfd]).toString("base64url");
    const notJson = "base64-" + Buffer.from("hello").toString("base64url");
    expect(dropMalformedAuthCookies([c("sb-abc-auth-token", badUtf8)])).toEqual([]);
    expect(dropMalformedAuthCookies([c("sb-abc-auth-token", notJson)])).toEqual([]);
  });
  it("reassembles chunked sessions in order before checking them", () => {
    const mid = Math.floor(encoded.length / 2);
    const chunks = [c("sb-abc-auth-token.1", encoded.slice(mid)), c("sb-abc-auth-token.0", encoded.slice(0, mid))];
    expect(dropMalformedAuthCookies(chunks)).toHaveLength(2);
  });
  it("drops every chunk of a broken chunked session", () => {
    const chunks = [c("sb-abc-auth-token.0", "base64-AAAA"), c("sb-abc-auth-token.1", "!!!")];
    expect(dropMalformedAuthCookies(chunks)).toEqual([]);
  });
});
