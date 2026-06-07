import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PrivateRoomPage from "./page"

const {
  mockPush,
  mockSendPersonalChatInvite,
  mockRoomTtlGet,
  mockMessagesGet,
  mockMessagesPost,
  mockRoomDelete,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockSendPersonalChatInvite: vi.fn(),
  mockRoomTtlGet: vi.fn(),
  mockMessagesGet: vi.fn(),
  mockMessagesPost: vi.fn(),
  mockRoomDelete: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useParams: () => ({
    roomId: "room-1",
  }),
  useRouter: () => ({
    push: mockPush,
  }),
}))

vi.mock("@/hooks/use-username", () => ({
  useUsername: () => ({
    username: "Echo",
  }),
}))

vi.mock("@/lib/client", () => ({
  client: {
    room: {
      ttl: {
        get: mockRoomTtlGet,
      },
      delete: mockRoomDelete,
    },
    messages: {
      get: mockMessagesGet,
      post: mockMessagesPost,
    },
  },
}))

vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn(async (text: string) => `encrypted:${text}`),
}))

vi.mock("@/lib/realtime-client", () => ({
  useRealtime: vi.fn(),
}))

vi.mock("@/components/private-chat-decrypted-message", () => ({
  default: ({ text }: { text: string }) => <span>{text}</span>,
}))

vi.mock(
  "@/features/personal-chat/client/personal-chat-api",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/features/personal-chat/client/personal-chat-api")
      >()

    return {
      ...actual,
      sendPersonalChatInvite: mockSendPersonalChatInvite,
    }
  },
)

const renderRoom = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <PrivateRoomPage />
    </QueryClientProvider>,
  )
}

describe("PrivateRoomPage", () => {
  beforeEach(() => {
    const roomKey =
      "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"

    window.history.pushState({}, "", `/private/room/room-1#${roomKey}`)
    mockPush.mockReset()
    mockSendPersonalChatInvite.mockReset()
    mockRoomTtlGet.mockReset()
    mockMessagesGet.mockReset()
    mockMessagesPost.mockReset()
    mockRoomDelete.mockReset()

    mockSendPersonalChatInvite.mockResolvedValue({
      sent: true,
    })
    mockRoomTtlGet.mockResolvedValue({
      data: {
        destroyed: false,
        expiresAt: Date.now() + 600_000,
        serverTime: Date.now(),
      },
    })
    mockMessagesGet.mockResolvedValue({
      data: {
        messages: [],
      },
    })
    mockMessagesPost.mockResolvedValue({
      status: 200,
    })
    mockRoomDelete.mockResolvedValue({
      status: 200,
    })
  })

  it("sends email invites with the current secure room URL", async () => {
    let resolveInvite: ((value: { sent: true }) => void) | undefined

    mockSendPersonalChatInvite.mockImplementationOnce(
      () =>
        new Promise<{ sent: true }>((resolve) => {
          resolveInvite = resolve
        }),
    )

    renderRoom()

    fireEvent.click(screen.getByRole("button", { name: "Invite by email" }))
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: {
        value: "friend@example.com",
      },
    })
    fireEvent.click(screen.getByRole("button", { name: /Send invite/i }))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Sending/i })).toBeDisabled()
    })

    await waitFor(() => {
      expect(mockSendPersonalChatInvite).toHaveBeenCalledWith({
        email: "friend@example.com",
        inviteUrl: window.location.href,
      })
    })

    await act(async () => {
      resolveInvite?.({
        sent: true,
      })
    })

    expect(
      await screen.findByText("Invite sent to friend@example.com."),
    ).toBeInTheDocument()
  })
})
