import {
  mapTransportAuthUserToSessionUser,
  mapTransportConversationEnvelopeToDetail,
  mapTransportConversationListToSummaries,
  mapTransportConversationToSummary,
  mapTransportMessageEnvelopeToChatMessage,
  mapTransportUserListToDmCandidates,
  mapTransportUserSummaryListToDmCandidates,
} from "@/features/personal-chat/server/mappers"
import { compareMessagesByDateAndId } from "@/features/personal-chat/domain/message-order"
import { createPersonalChatPrivacyLinkBody } from "@/features/personal-chat/server/privacy-link-message"
import {
  ConversationMessagePageInput,
  CreatePrivacyRoomLinkInput,
  CreateRealtimeSessionInput,
  OpenDirectConversationInput,
  PersonalChatLoginInput,
  PersonalChatLoginResult,
  PersonalChatUnauthorizedError,
  PersonalChatRegisterInput,
  PersonalChatService,
  SearchPersonalUsersInput,
  SendChatInviteInput,
  SendPersonalMessageInput,
} from "@/features/personal-chat/server/personal-chat-service"
import {
  mapGatewayBadRequestError,
  mapGatewayConversationNotFoundError,
  mapGatewayLoginError,
  mapGatewayRegisterError,
  isGatewayBadRequestError,
  isGatewayStatus,
} from "./gateway-error-mapping"
import {
  createGatewayFetch,
  fetchGatewayUser,
  parseAccessTokenClaims,
} from "./gateway-http"
import {
  withGatewaySession,
} from "./gateway-session"
import {
  gatewayPersonalChatSessionStore,
} from "./gateway-session-store"
import type {
  TransportAuthResponse,
  TransportAuthTokens,
  TransportConversationEnvelope,
  TransportConversationListEnvelope,
  TransportMessageEnvelope,
  TransportMessageListEnvelope,
  TransportUserSummaryListResponse,
  TransportUserListResponse,
} from "@/features/personal-chat/transport"
import { validateGatewayConfig } from "./config"
import { createPrivateRoom } from "@/features/private-chat/server/create-private-room"
import { deletePrivateRoom } from "@/features/private-chat/server/delete-private-room"

const buildGatewaySearch = (
  values: Record<string, string | number | undefined>,
  arrayValues?: Record<string, string[] | undefined>,
) => {
  const searchParams = new URLSearchParams()

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      searchParams.set(key, String(value))
    }
  }

  for (const [key, items] of Object.entries(arrayValues ?? {})) {
    for (const item of items ?? []) {
      searchParams.append(key, item)
    }
  }

  const query = searchParams.toString()
  return query ? `?${query}` : ""
}

const buildConversationMessagesRequest = (
  conversationId: string,
  page?: ConversationMessagePageInput,
) => {
  const requestedLimit = page?.limit
  const shouldDetectHistory =
    typeof requestedLimit === "number" && !page?.after

  return {
    path: `/conversations/${encodeURIComponent(conversationId)}/messages${buildGatewaySearch(
      {
        limit:
          typeof requestedLimit === "number"
            ? shouldDetectHistory
              ? requestedLimit + 1
              : requestedLimit
            : undefined,
        before: page?.before,
        after: page?.after,
      },
    )}`,
    requestedLimit,
    shouldDetectHistory,
  }
}

const trimConversationMessages = (
  response: TransportMessageListEnvelope,
  requestedLimit?: number,
  shouldDetectHistory: boolean = false,
) => {
  const messagesByAge = [...response.data].sort(compareMessagesByDateAndId)

  if (!shouldDetectHistory || typeof requestedLimit !== "number") {
    return {
      messages: messagesByAge,
      hasMoreHistory: false,
    }
  }

  return {
    messages: messagesByAge.slice(-requestedLimit),
    hasMoreHistory: messagesByAge.length > requestedLimit,
  }
}

interface TransportChatInviteResponse {
  data: {
    sent: true
  }
}

export const createGatewayPersonalChatService = (): PersonalChatService => {
  validateGatewayConfig()

  return ({
  async getSession(context) {
    if (!context.sessionToken) {
      return {
        isAuthenticated: false,
        user: null,
      }
    }

    try {
      const session = await withGatewaySession(context, async (session) => ({
        ...session,
        user: await fetchGatewayUser(session.accessToken, session.user.id),
      }))

      return {
        isAuthenticated: true,
        user: session.user,
      }
    } catch (error) {
      if (error instanceof PersonalChatUnauthorizedError) {
        return {
          isAuthenticated: false,
          user: null,
        }
      }

      throw error
    }
  },

  async getDmCandidates(context) {
    return withGatewaySession(context, async (session) => {
      try {
        const response = await createGatewayFetch<TransportUserSummaryListResponse>({
          path: "/users/dm-candidates",
          accessToken: session.accessToken,
        })

        return mapTransportUserSummaryListToDmCandidates(response)
      } catch (error) {
        if (isGatewayBadRequestError(error)) {
          throw mapGatewayBadRequestError(error)
        }

        throw error
      }
    })
  },

  async searchUsers(context, input: SearchPersonalUsersInput) {
    return withGatewaySession(context, async (session) => {
      try {
        const normalizedQuery = input.query.trim()

        if (normalizedQuery.length === 0) {
          return []
        }

        const response = await createGatewayFetch<TransportUserListResponse>({
          path: `/users/search${buildGatewaySearch(
            {
              query: normalizedQuery,
              limit: input.limit ?? 8,
            },
          )}`,
          accessToken: session.accessToken,
        })

        return mapTransportUserListToDmCandidates(response)
          .filter((candidate) => candidate.id !== session.user.id)
      } catch (error) {
        if (isGatewayBadRequestError(error)) {
          throw mapGatewayBadRequestError(error)
        }

        throw error
      }
    })
  },

  async getConversationSummaries(context) {
    return withGatewaySession(context, async (session) => {
      try {
        const response = await createGatewayFetch<TransportConversationListEnvelope>({
          path: "/conversations",
          accessToken: session.accessToken,
        })

        return mapTransportConversationListToSummaries(response, session.user.id)
      } catch (error) {
        if (isGatewayBadRequestError(error)) {
          throw mapGatewayBadRequestError(error)
        }

        throw error
      }
    })
  },

  async getConversationDetail(context, conversationId, page) {
    return withGatewaySession(context, async (session) => {
      try {
        const messageRequest = buildConversationMessagesRequest(
          conversationId,
          page,
        )
        const [conversationResponse, messagesResponse] = await Promise.all([
          createGatewayFetch<TransportConversationEnvelope>({
            path: `/conversations/${encodeURIComponent(conversationId)}`,
            accessToken: session.accessToken,
          }),
          createGatewayFetch<TransportMessageListEnvelope>({
            path: messageRequest.path,
            accessToken: session.accessToken,
          }),
        ])
        const messagePage = trimConversationMessages(
          messagesResponse,
          messageRequest.requestedLimit,
          messageRequest.shouldDetectHistory,
        )

        return mapTransportConversationEnvelopeToDetail(
          conversationResponse,
          {
            ...messagesResponse,
            data: messagePage.messages,
          },
          {
            currentUserId: session.user.id,
            hasMoreHistory: messagePage.hasMoreHistory,
          },
        )
      } catch (error) {
        if (isGatewayStatus(error, 404)) {
          throw mapGatewayConversationNotFoundError(conversationId)
        }

        if (isGatewayBadRequestError(error)) {
          throw mapGatewayBadRequestError(error)
        }

        throw error
      }
    })
  },

  async register(
    input: PersonalChatRegisterInput,
  ): Promise<PersonalChatLoginResult> {
    let response: TransportAuthResponse

    try {
      response = await createGatewayFetch<TransportAuthResponse>({
        path: "/auth/register",
        method: "POST",
        body: input,
      })
    } catch (error) {
      throw mapGatewayRegisterError(error)
    }

    const user = mapTransportAuthUserToSessionUser(response.user)
    const record = await gatewayPersonalChatSessionStore.create({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      user,
    })

    return {
      sessionToken: record.sessionToken,
      session: {
        isAuthenticated: true,
        user: record.user,
      },
    }
  },

  async login(input: PersonalChatLoginInput): Promise<PersonalChatLoginResult> {
    let tokens: TransportAuthTokens

    try {
      tokens = await createGatewayFetch<TransportAuthTokens>({
        path: "/auth/login",
        method: "POST",
        body: input,
      })
    } catch (error) {
      throw mapGatewayLoginError(error)
    }

    const claims = parseAccessTokenClaims(tokens.accessToken)
    const user = await fetchGatewayUser(tokens.accessToken, claims.sub)
    const record = await gatewayPersonalChatSessionStore.create({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user,
    })

    return {
      sessionToken: record.sessionToken,
      session: {
        isAuthenticated: true,
        user: record.user,
      },
    }
  },

  async logout(context) {
    const session = await gatewayPersonalChatSessionStore.get(
      context.sessionToken,
    )

    if (!session) {
      return
    }

    try {
      await createGatewayFetch<void>({
        path: "/auth/revoke",
        method: "POST",
        body: {
          userId: session.user.id,
        },
      })
    } finally {
      await gatewayPersonalChatSessionStore.delete(context.sessionToken)
    }
  },

  async openOrCreateDirectConversation(
    context,
    input: OpenDirectConversationInput,
  ) {
    return withGatewaySession(context, async (session) => {
      try {
        const response = await createGatewayFetch<TransportConversationEnvelope>({
          path: "/direct-conversations",
          method: "POST",
          accessToken: session.accessToken,
          body: {
            participantId: input.participantId,
          },
        })

        return mapTransportConversationToSummary(response.data, session.user.id)
      } catch (error) {
        if (isGatewayBadRequestError(error)) {
          throw mapGatewayBadRequestError(error)
        }

        throw error
      }
    })
  },

  async sendMessage(context, input: SendPersonalMessageInput) {
    return withGatewaySession(context, async (session) => {
      try {
        const response = await createGatewayFetch<TransportMessageEnvelope>({
          path: `/conversations/${encodeURIComponent(input.conversationId)}/messages`,
          method: "POST",
          accessToken: session.accessToken,
          body: {
            body: input.text,
          },
        })

        const message = mapTransportMessageEnvelopeToChatMessage(response)

        if (input.clientMessageId) {
          return {
            ...message,
            clientMessageId: input.clientMessageId,
          }
        }

        return message
      } catch (error) {
        if (isGatewayStatus(error, 404)) {
          throw mapGatewayConversationNotFoundError(input.conversationId)
        }

        if (isGatewayBadRequestError(error)) {
          throw mapGatewayBadRequestError(error)
        }

        throw error
      }
    })
  },

  async createPrivacyRoomLink(context, input: CreatePrivacyRoomLinkInput) {
    return withGatewaySession(context, async (session) => {
      const { roomId } = await createPrivateRoom()

      try {
        const response = await createGatewayFetch<TransportMessageEnvelope>({
          path: `/conversations/${encodeURIComponent(input.conversationId)}/messages`,
          method: "POST",
          accessToken: session.accessToken,
          body: {
            body: createPersonalChatPrivacyLinkBody(
              roomId,
              input.encryptionKey,
            ),
          },
        })

        const message = mapTransportMessageEnvelopeToChatMessage(response)

        if (message.kind !== "privacy-link") {
          throw new Error("Gateway privacy link message did not map correctly")
        }

        return {
          ...message,
          clientMessageId: input.clientMessageId,
        }
      } catch (error) {
        await deletePrivateRoom(roomId)

        if (isGatewayStatus(error, 404)) {
          throw mapGatewayConversationNotFoundError(input.conversationId)
        }

        if (isGatewayBadRequestError(error)) {
          throw mapGatewayBadRequestError(error)
        }

        throw error
      }
    })
  },

  async createRealtimeSession(context, input: CreateRealtimeSessionInput) {
    return withGatewaySession(context, async (session) => {
      try {
        await createGatewayFetch<TransportConversationEnvelope>({
          path: `/conversations/${encodeURIComponent(input.conversationId)}`,
          accessToken: session.accessToken,
        })

        return gatewayPersonalChatSessionStore.createRealtimeBridgeSession({
          accessToken: session.accessToken,
          conversationId: input.conversationId,
        })
      } catch (error) {
        if (isGatewayStatus(error, 404)) {
          throw mapGatewayConversationNotFoundError(input.conversationId)
        }

        if (isGatewayBadRequestError(error)) {
          throw mapGatewayBadRequestError(error)
        }

        throw error
      }
    })
  },

  async sendChatInvite(context, input: SendChatInviteInput) {
    return withGatewaySession(context, async (session) => {
      try {
        const response = await createGatewayFetch<TransportChatInviteResponse>({
          path: "/chat-invites",
          method: "POST",
          accessToken: session.accessToken,
          body: {
            email: input.email,
            inviteUrl: input.inviteUrl,
          },
        })

        return {
          sent: response.data.sent,
        }
      } catch (error) {
        if (isGatewayBadRequestError(error)) {
          throw mapGatewayBadRequestError(error)
        }

        throw error
      }
    })
  },
  })
}
