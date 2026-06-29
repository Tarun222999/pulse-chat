import { describe, expect, it } from "vitest"
import {
  accountLoginPath,
  buildAccountLoginRedirectPath,
  buildRoutePathWithSearch,
  normalizeAccountGuardNextPath,
  resolveAccountLoginSuccessPath,
} from "@/features/auth/route-guard-paths"

describe("account route guard paths", () => {
  it("accepts protected account feature paths as login return targets", () => {
    expect(normalizeAccountGuardNextPath("/personal")).toBe("/personal")
    expect(normalizeAccountGuardNextPath("/personal/chat/demo-thread")).toBe(
      "/personal/chat/demo-thread",
    )
    expect(normalizeAccountGuardNextPath("/ai")).toBe("/ai")
    expect(normalizeAccountGuardNextPath("/ai/chat/demo-thread")).toBe(
      "/ai/chat/demo-thread",
    )
    expect(normalizeAccountGuardNextPath("/ai/chat/demo-thread?model=free")).toBe(
      "/ai/chat/demo-thread?model=free",
    )
    expect(normalizeAccountGuardNextPath("/private/room/room-1#key")).toBe(
      "/private/room/room-1#key",
    )
  })

  it("rejects unsafe, unrelated, and guest-only next paths", () => {
    expect(normalizeAccountGuardNextPath("https://example.com")).toBeNull()
    expect(normalizeAccountGuardNextPath("//example.com")).toBeNull()
    expect(normalizeAccountGuardNextPath("/login")).toBeNull()
    expect(normalizeAccountGuardNextPath("/personal/login")).toBeNull()
    expect(normalizeAccountGuardNextPath("/personality")).toBeNull()
    expect(normalizeAccountGuardNextPath("/airdrop")).toBeNull()
    expect(normalizeAccountGuardNextPath("/")).toBeNull()
  })

  it("builds the login redirect query only for safe next paths", () => {
    expect(buildAccountLoginRedirectPath("/ai/chat/demo-thread")).toBe(
      "/login?next=%2Fai%2Fchat%2Fdemo-thread",
    )
    expect(buildAccountLoginRedirectPath("/private/room/room-1#key")).toBe(
      "/login?next=%2Fprivate%2Froom%2Froom-1%23key",
    )
    expect(buildAccountLoginRedirectPath("/personal/login")).toBe(
      accountLoginPath,
    )
  })

  it("resolves the post-login target to a safe account route", () => {
    expect(resolveAccountLoginSuccessPath("/ai/chat/demo-thread")).toBe(
      "/ai/chat/demo-thread",
    )
    expect(resolveAccountLoginSuccessPath("/private/room/room-1#key")).toBe(
      "/private/room/room-1#key",
    )
    expect(resolveAccountLoginSuccessPath("/login")).toBe("/personal")
    expect(resolveAccountLoginSuccessPath("/personal/login")).toBe("/personal")
    expect(resolveAccountLoginSuccessPath("https://example.com")).toBe(
      "/personal",
    )
  })

  it("joins pathnames and search params consistently", () => {
    expect(buildRoutePathWithSearch("/ai", "model=free")).toBe(
      "/ai?model=free",
    )
    expect(buildRoutePathWithSearch("/ai", "?model=free")).toBe(
      "/ai?model=free",
    )
    expect(buildRoutePathWithSearch("/ai", "")).toBe("/ai")
  })
})
