import { describe, expect, it } from "vitest";
import { extractBearerToken } from "@/server/auth/bearer";

const jwt = "aaa.bbb.ccc";

describe("extractBearerToken", () => {
  it("reads a well-formed bearer token", () => {
    expect(extractBearerToken(`Bearer ${jwt}`)).toBe(jwt);
    expect(extractBearerToken(`bearer   ${jwt}  `)).toBe(jwt);
  });
  it("returns null when there is no header", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
  });
  it("rejects other schemes and malformed values", () => {
    expect(extractBearerToken(`Basic ${jwt}`)).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
    expect(extractBearerToken("Bearer not-a-jwt")).toBeNull();
    expect(extractBearerToken(`Bearer ${jwt} extra`)).toBeNull();
    expect(extractBearerToken("Bearer a.b")).toBeNull();
  });
});
