/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { PersonalChatUnauthorizedError } from "./personal-chat-service"

const {
  mockCreateGatewayFetch,
  mockFetchGatewayUser,
  mockWithGatewaySession,
} = vi.hoisted(() => ({
  mockCreateGatewayFetch: vi.fn(),
  mockFetchGatewayUser: vi.fn(),
  mockWithGatewaySession: vi.fn(),
}))

vi.mock("./gateway-http", async () => {
  const actual =
    await vi.importActual<typeof import("./gateway-http")>("./gateway-http")

  return {
    ...actual,
    createGatewayFetch: mockCreateGatewayFetch,
    fetchGatewayUser: mockFetchGatewayUser,
  }
})

vi.mock("./gateway-session", () => ({
  withGatewaySession: mockWithGatewaySession,
}))

import { createGatewayPersonalChatService } from "./gateway-personal-chat-service"

describe("createGatewayPersonalChatService.getSession", () => {
  beforeEach(() => {
    mockCreateGatewayFetch.mockReset()
    mockFetchGatewayUser.mockReset()
    mockWithGatewaySession.mockReset()
  })

  it("validates the stored session against the gateway before authenticating", async () => {
    const storedSession = {
      sessionToken: "gateway-session-1",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: {
        id: "user-1",
        handle: "echo",
        displayName: "Echo Vale",
        avatarUrl: null,
      },
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    }
    const validatedUser = {
      ...storedSession.user,
      displayName: "Echo Validated",
    }

    mockWithGatewaySession.mockImplementationOnce(async (_context, action) =>
      action(storedSession),
    )
    mockFetchGatewayUser.mockResolvedValueOnce(validatedUser)

    const service = createGatewayPersonalChatService()
    const session = await service.getSession({
      sessionToken: storedSession.sessionToken,
    })

    expect(mockWithGatewaySession).toHaveBeenCalledWith(
      {
        sessionToken: storedSession.sessionToken,
      },
      expect.any(Function),
    )
    expect(mockFetchGatewayUser).toHaveBeenCalledWith(
      storedSession.accessToken,
      storedSession.user.id,
    )
    expect(session).toEqual({
      isAuthenticated: true,
      user: validatedUser,
    })
  })

  it("treats stale gateway sessions as unauthenticated", async () => {
    mockWithGatewaySession.mockRejectedValueOnce(
      new PersonalChatUnauthorizedError(),
    )

    const service = createGatewayPersonalChatService()
    const session = await service.getSession({
      sessionToken: "stale-session",
    })

    expect(mockFetchGatewayUser).not.toHaveBeenCalled()
    expect(session).toEqual({
      isAuthenticated: false,
      user: null,
    })
  })

  it("returns unauthenticated when no session token is present", async () => {
    const service = createGatewayPersonalChatService()
    const session = await service.getSession({})

    expect(mockWithGatewaySession).not.toHaveBeenCalled()
    expect(mockFetchGatewayUser).not.toHaveBeenCalled()
    expect(session).toEqual({
      isAuthenticated: false,
      user: null,
    })
  })
})

describe("createGatewayPersonalChatService.searchUsers", () => {
  beforeEach(() => {
    mockCreateGatewayFetch.mockReset()
    mockFetchGatewayUser.mockReset()
    mockWithGatewaySession.mockReset()
  })

  it("returns an empty list for blank queries without fetching users", async () => {
    mockWithGatewaySession.mockImplementationOnce(async (_context, action) =>
      action({
        accessToken: "access-token",
        user: {
          id: "user-1",
        },
      }),
    )

    const service = createGatewayPersonalChatService()
    const users = await service.searchUsers(
      {
        sessionToken: "gateway-session-1",
      },
      {
        query: "   ",
        limit: 5,
      },
    )

    expect(users).toEqual([])
    expect(mockCreateGatewayFetch).not.toHaveBeenCalled()
  })

  it("normalizes non-empty queries while preserving filtering and limits", async () => {
    mockWithGatewaySession.mockImplementationOnce(async (_context, action) =>
      action({
        accessToken: "access-token",
        user: {
          id: "user-1",
        },
      }),
    )
    mockCreateGatewayFetch.mockResolvedValueOnce({
      data: [
        {
          id: "user-2",
          email: "mara@example.com",
          displayName: "Mara Vale",
        },
      ],
    })

    const service = createGatewayPersonalChatService()
    const users = await service.searchUsers(
      {
        sessionToken: "gateway-session-1",
      },
      {
        query: "  VA  ",
        limit: 1,
      },
    )

    expect(mockCreateGatewayFetch).toHaveBeenCalledWith({
      path: "/users/search?query=VA&limit=1",
      accessToken: "access-token",
    })
    expect(users).toEqual([
      {
        id: "user-2",
        handle: "mara",
        displayName: "Mara Vale",
        avatarUrl: null,
        isAvailable: true,
      },
    ])
  })
})

describe("createGatewayPersonalChatService.sendChatInvite", () => {
  beforeEach(() => {
    mockCreateGatewayFetch.mockReset()
    mockFetchGatewayUser.mockReset()
    mockWithGatewaySession.mockReset()
  })

  it("forwards chat invite emails to the gateway with the session token", async () => {
    mockWithGatewaySession.mockImplementationOnce(async (_context, action) =>
      action({
        accessToken: "access-token",
        user: {
          id: "user-1",
        },
      }),
    )
    mockCreateGatewayFetch.mockResolvedValueOnce({
      data: {
        sent: true,
      },
    })

    const service = createGatewayPersonalChatService()
    const result = await service.sendChatInvite(
      {
        sessionToken: "gateway-session-1",
      },
      {
        email: "friend@example.com",
        inviteUrl: "https://frontend.example.com/personal",
      },
    )

    expect(mockCreateGatewayFetch).toHaveBeenCalledWith({
      path: "/chat-invites",
      method: "POST",
      accessToken: "access-token",
      body: {
        email: "friend@example.com",
        inviteUrl: "https://frontend.example.com/personal",
      },
    })
    expect(result).toEqual({
      sent: true,
    })
  })
})

describe("createGatewayPersonalChatService.getConversationDetail", () => {
  beforeEach(() => {
    mockCreateGatewayFetch.mockReset()
    mockFetchGatewayUser.mockReset()
    mockWithGatewaySession.mockReset()
  })

  it("passes pagination params through to the gateway and derives hasMoreHistory", async () => {
    mockWithGatewaySession.mockImplementationOnce(async (_context, action) =>
      action({
        accessToken: "access-token",
        user: {
          id: "user-1",
        },
      }),
    )
    mockCreateGatewayFetch
      .mockResolvedValueOnce({
        data: {
          id: "conversation-1",
          kind: "direct",
          title: null,
          participantIds: ["user-1", "user-2"],
          participants: [
            {
              id: "user-1",
              displayName: "Echo Vale",
            },
            {
              id: "user-2",
              displayName: "Mara Vale",
            },
          ],
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z",
          lastMessageAt: "2026-04-20T10:02:00.000Z",
          lastMessagePreview: "Newest message",
        },
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "message-0",
            conversationId: "conversation-1",
            senderId: "user-2",
            body: "Oldest extra message",
            createdAt: "2026-04-20T10:00:00.000Z",
            reactions: [],
          },
          {
            id: "message-1",
            conversationId: "conversation-1",
            senderId: "user-2",
            body: "Middle message",
            createdAt: "2026-04-20T10:01:00.000Z",
            reactions: [],
          },
          {
            id: "message-2",
            conversationId: "conversation-1",
            senderId: "user-1",
            body: "Newest message",
            createdAt: "2026-04-20T10:02:00.000Z",
            reactions: [],
          },
        ],
      })

    const service = createGatewayPersonalChatService()
    const conversation = await service.getConversationDetail(
      {
        sessionToken: "gateway-session-1",
      },
      "conversation-1",
      {
        limit: 2,
        before: "message-3",
      },
    )

    expect(mockCreateGatewayFetch).toHaveBeenNthCalledWith(1, {
      path: "/conversations/conversation-1",
      accessToken: "access-token",
    })
    expect(mockCreateGatewayFetch).toHaveBeenNthCalledWith(2, {
      path: "/conversations/conversation-1/messages?limit=3&before=message-3",
      accessToken: "access-token",
    })
    expect(conversation.hasMoreHistory).toBe(true)
    expect(conversation.messages.map(({ id }) => id)).toEqual([
      "message-1",
      "message-2",
    ])
  })

  it("keeps the newest bounded history messages when the gateway returns newest first", async () => {
    mockWithGatewaySession.mockImplementationOnce(async (_context, action) =>
      action({
        accessToken: "access-token",
        user: {
          id: "user-1",
        },
      }),
    )
    mockCreateGatewayFetch
      .mockResolvedValueOnce({
        data: {
          id: "conversation-1",
          kind: "direct",
          title: null,
          participantIds: ["user-1", "user-2"],
          participants: [
            {
              id: "user-1",
              displayName: "Echo Vale",
            },
            {
              id: "user-2",
              displayName: "Mara Vale",
            },
          ],
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z",
          lastMessageAt: "2026-04-20T10:02:00.000Z",
          lastMessagePreview: "Newest saved message",
        },
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "message-2",
            conversationId: "conversation-1",
            senderId: "user-1",
            body: "Newest saved message",
            createdAt: "2026-04-20T10:02:00.000Z",
            reactions: [],
          },
          {
            id: "message-1",
            conversationId: "conversation-1",
            senderId: "user-2",
            body: "Middle message",
            createdAt: "2026-04-20T10:01:00.000Z",
            reactions: [],
          },
          {
            id: "message-0",
            conversationId: "conversation-1",
            senderId: "user-2",
            body: "Oldest extra message",
            createdAt: "2026-04-20T10:00:00.000Z",
            reactions: [],
          },
        ],
      })

    const service = createGatewayPersonalChatService()
    const conversation = await service.getConversationDetail(
      {
        sessionToken: "gateway-session-1",
      },
      "conversation-1",
      {
        limit: 2,
      },
    )

    expect(mockCreateGatewayFetch).toHaveBeenNthCalledWith(2, {
      path: "/conversations/conversation-1/messages?limit=3",
      accessToken: "access-token",
    })
    expect(conversation.hasMoreHistory).toBe(true)
    expect(conversation.messages.map(({ id }) => id)).toEqual([
      "message-1",
      "message-2",
    ])
  })

  it("keeps hasMoreHistory false when no bounded history page was requested", async () => {
    mockWithGatewaySession.mockImplementationOnce(async (_context, action) =>
      action({
        accessToken: "access-token",
        user: {
          id: "user-1",
        },
      }),
    )
    mockCreateGatewayFetch
      .mockResolvedValueOnce({
        data: {
          id: "conversation-1",
          kind: "direct",
          title: null,
          participantIds: ["user-1", "user-2"],
          participants: [
            {
              id: "user-1",
              displayName: "Echo Vale",
            },
            {
              id: "user-2",
              displayName: "Mara Vale",
            },
          ],
          createdAt: "2026-04-20T00:00:00.000Z",
          updatedAt: "2026-04-20T00:00:00.000Z",
          lastMessageAt: "2026-04-20T10:01:00.000Z",
          lastMessagePreview: "Newest message",
        },
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "message-1",
            conversationId: "conversation-1",
            senderId: "user-2",
            body: "Older message",
            createdAt: "2026-04-20T10:00:00.000Z",
            reactions: [],
          },
          {
            id: "message-2",
            conversationId: "conversation-1",
            senderId: "user-1",
            body: "Newest message",
            createdAt: "2026-04-20T10:01:00.000Z",
            reactions: [],
          },
        ],
      })

    const service = createGatewayPersonalChatService()
    const conversation = await service.getConversationDetail(
      {
        sessionToken: "gateway-session-1",
      },
      "conversation-1",
      {
        after: "2026-04-20T09:59:00.000Z",
        limit: 2,
      },
    )

    expect(mockCreateGatewayFetch).toHaveBeenNthCalledWith(2, {
      path:
        "/conversations/conversation-1/messages?limit=2&after=2026-04-20T09%3A59%3A00.000Z",
      accessToken: "access-token",
    })
    expect(conversation.hasMoreHistory).toBe(false)
    expect(conversation.messages.map(({ id }) => id)).toEqual([
      "message-1",
      "message-2",
    ])
  })
})
