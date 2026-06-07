import {
  chatMessageSchema,
  conversationDetailSchema,
  conversationSummarySchema,
  dmCandidateSchema,
  personalSessionSchema,
  privacyLinkMessageSchema,
  realtimeSessionBootstrapSchema,
} from "@/features/personal-chat/domain"
import { createPrivateRoom } from "@/features/private-chat/server/create-private-room"
import {
  PersonalChatConversationNotFoundError,
  PersonalChatDependencyError,
  PersonalChatInvalidCredentialsError,
  PersonalChatParticipantNotFoundError,
  PersonalChatUnauthorizedError,
  PersonalChatUserAlreadyExistsError,
  type PersonalChatService,
} from "@/features/personal-chat/server/personal-chat-service"
import { mockPersonalChatStore } from "./store"

const clone = <T>(value: T): T => structuredClone(value)

export const createMockPersonalChatService = (): PersonalChatService => ({
  async getSession(context) {
    return personalSessionSchema.parse(
      clone(mockPersonalChatStore.getSession(context.sessionToken)),
    )
  },

  async getDmCandidates(context) {
    const session = mockPersonalChatStore.getSession(context.sessionToken)

    if (!session.isAuthenticated) {
      throw new PersonalChatUnauthorizedError()
    }

    return dmCandidateSchema
      .array()
      .parse(clone(mockPersonalChatStore.getDmCandidates(context.sessionToken)))
  },

  async searchUsers(context, input) {
    const session = mockPersonalChatStore.getSession(context.sessionToken)

    if (!session.isAuthenticated) {
      throw new PersonalChatUnauthorizedError()
    }

    return dmCandidateSchema
      .array()
      .parse(clone(mockPersonalChatStore.searchUsers(context.sessionToken, input)))
  },

  async getConversationSummaries(context) {
    const session = mockPersonalChatStore.getSession(context.sessionToken)

    if (!session.isAuthenticated) {
      throw new PersonalChatUnauthorizedError()
    }

    return conversationSummarySchema.array().parse(
      clone(mockPersonalChatStore.getConversationSummaries(context.sessionToken)),
    )
  },

  async getConversationDetail(context, conversationId, page) {
    const session = mockPersonalChatStore.getSession(context.sessionToken)

    if (!session.isAuthenticated) {
      throw new PersonalChatUnauthorizedError()
    }

    const conversation = mockPersonalChatStore.getConversationDetail(
      context.sessionToken,
      conversationId,
      page,
    )

    if (!conversation) {
      throw new PersonalChatConversationNotFoundError(conversationId)
    }

    return conversationDetailSchema.parse(clone(conversation))
  },

  async register(input) {
    const result = mockPersonalChatStore.register(input)

    if (!result) {
      throw new PersonalChatUserAlreadyExistsError()
    }

    return {
      session: personalSessionSchema.parse(clone(result.session)),
      sessionToken: result.sessionToken,
    }
  },

  async login(input) {
    const result = mockPersonalChatStore.login(input.email, input.password)

    if (!result) {
      throw new PersonalChatInvalidCredentialsError()
    }

    return {
      session: personalSessionSchema.parse(clone(result.session)),
      sessionToken: result.sessionToken,
    }
  },

  async logout() {
    mockPersonalChatStore.logout()
  },

  async openOrCreateDirectConversation(context, input) {
    const session = mockPersonalChatStore.getSession(context.sessionToken)

    if (!session.isAuthenticated) {
      throw new PersonalChatUnauthorizedError()
    }

    const conversation = mockPersonalChatStore.openOrCreateDirectConversation(
      context.sessionToken,
      input.participantId,
    )

    if (!conversation) {
      throw new PersonalChatParticipantNotFoundError(input.participantId)
    }

    return conversationSummarySchema.parse(clone(conversation))
  },

  async sendMessage(context, input) {
    const session = mockPersonalChatStore.getSession(context.sessionToken)

    if (!session.isAuthenticated) {
      throw new PersonalChatUnauthorizedError()
    }

    const message = mockPersonalChatStore.sendMessage(context.sessionToken, input)

    if (!message) {
      throw new PersonalChatConversationNotFoundError(input.conversationId)
    }

    return chatMessageSchema.parse(clone(message))
  },

  async createPrivacyRoomLink(context, input) {
    const session = mockPersonalChatStore.getSession(context.sessionToken)

    if (!session.isAuthenticated) {
      throw new PersonalChatUnauthorizedError()
    }

    let roomId: string

    try {
      roomId = (await createPrivateRoom()).roomId
    } catch (error) {
      throw new PersonalChatDependencyError(
        "Failed to create a private room",
        error,
      )
    }

    const message = mockPersonalChatStore.createPrivacyRoomLink(
      context.sessionToken,
      {
        conversationId: input.conversationId,
        encryptionKey: input.encryptionKey,
        roomId,
        clientMessageId: input.clientMessageId,
      },
    )

    if (!message) {
      throw new PersonalChatConversationNotFoundError(input.conversationId)
    }

    return privacyLinkMessageSchema.parse(clone(message))
  },

  async createRealtimeSession(context, input) {
    const session = mockPersonalChatStore.getSession(context.sessionToken)

    if (!session.isAuthenticated) {
      throw new PersonalChatUnauthorizedError()
    }

    const realtimeSession = mockPersonalChatStore.createRealtimeSession(
      context.sessionToken,
      input.conversationId,
    )

    if (!realtimeSession) {
      throw new PersonalChatConversationNotFoundError(input.conversationId)
    }

    return realtimeSessionBootstrapSchema.parse(clone(realtimeSession))
  },

  async sendChatInvite(context) {
    const session = mockPersonalChatStore.getSession(context.sessionToken)

    if (!session.isAuthenticated) {
      throw new PersonalChatUnauthorizedError()
    }

    return {
      sent: true as const,
    }
  },
})
