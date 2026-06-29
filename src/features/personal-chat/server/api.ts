import { Elysia } from "elysia"
import { z } from "zod"
import {
  chatMessageSchema,
  conversationDetailSchema,
  conversationSummarySchema,
  dmCandidateSchema,
  personalSessionSchema,
  privacyLinkMessageSchema,
  realtimeSessionBootstrapSchema,
} from "@/features/personal-chat/domain"
import { getPersonalChatService } from "./get-personal-chat-service"
import {
  PersonalChatBadRequestError,
  PersonalChatConversationNotFoundError,
  PersonalChatInvalidCredentialsError,
  PersonalChatParticipantNotFoundError,
  PersonalChatUnauthorizedError,
  PersonalChatUserAlreadyExistsError,
} from "./personal-chat-service"
import {
  clearPersonalChatSessionCookie,
  getPersonalChatSessionToken,
  setPersonalChatSessionCookie,
} from "./session-cookie"
import {
  buildPersonalChatPrivacyRoomUrl,
  createPersonalChatPrivacyLinkBody,
  isValidPersonalChatPrivacyRoomKey,
  personalChatPrivacyRoomLabel,
} from "./privacy-link-message"
import { createPrivateRoom } from "@/features/private-chat/server/create-private-room"
import { resolvePersonalChatRealtimeSocketUrl } from "./realtime-socket-url"

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

const registerBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(3).max(30),
})

const directConversationBodySchema = z.object({
  participantId: z.string().min(1),
})

const chatInviteBodySchema = z.object({
  email: z.string().trim().email(),
  inviteUrl: z.string().url(),
})

const userSearchQuerySchema = z.object({
  query: z.string().trim().min(3).max(255),
  limit: z.coerce.number().int().min(1).max(25).optional(),
})

const conversationDetailQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  before: z.string().uuid().optional(),
  after: z.iso.datetime().optional(),
})

const sendMessageBodySchema = z.object({
  text: z.string().min(1).max(5000),
  clientMessageId: z.string().min(1).optional(),
})

const privacyRoomLinkBodySchema = z.object({
  encryptionKey: z
    .string()
    .refine(
      isValidPersonalChatPrivacyRoomKey,
      "Encryption key must be a 64-character hexadecimal string",
    ),
  clientMessageId: z.string().min(1).optional(),
})

const realtimeSessionBodySchema = z.object({
  conversationId: z.string().min(1),
})

const statusSchema = z.object({
  feature: z.literal("personal-chat"),
  status: z.literal("scaffolded"),
})

const conversationNotFoundSchema = z.object({
  error: z.literal("Conversation not found"),
  conversationId: z.string(),
})

const participantNotFoundSchema = z.object({
  error: z.literal("Participant not found"),
  participantId: z.string(),
})

const unauthorizedSchema = z.object({
  error: z.literal("Unauthorized"),
})

const invalidCredentialsSchema = z.object({
  error: z.literal("Invalid email or password"),
})

const userAlreadyExistsSchema = z.object({
  error: z.literal("User with this email already exists"),
})

const badRequestSchema = z.object({
  error: z.string(),
})

const logoutResponseSchema = z.object({
  success: z.literal(true),
})

const sessionResponseSchema = z.object({
  session: personalSessionSchema,
})

const dmCandidatesResponseSchema = z.object({
  candidates: z.array(dmCandidateSchema),
})

const userSearchResponseSchema = z.object({
  users: z.array(dmCandidateSchema),
})

const conversationListResponseSchema = z.object({
  conversations: z.array(conversationSummarySchema),
})

const conversationResponseSchema = z.object({
  conversation: conversationDetailSchema,
})

const directConversationResponseSchema = z.object({
  conversation: conversationSummarySchema,
})

const chatInviteResponseSchema = z.object({
  sent: z.literal(true),
})

const messageResponseSchema = z.object({
  message: chatMessageSchema,
})

const privacyLinkMessageResponseSchema = z.object({
  message: privacyLinkMessageSchema,
})

const privacyRoomDraftResponseSchema = z.object({
  draft: z.object({
    roomId: z.string().min(1),
    roomUrl: z.string().min(1),
    label: z.string().min(1),
    body: z.string().min(1),
  }),
})

const realtimeSessionResponseSchema = z.object({
  realtimeSession: realtimeSessionBootstrapSchema,
})

const personalChatApiBase = new Elysia({ prefix: "/personal" })
  .error({
    PersonalChatConversationNotFoundError,
    PersonalChatBadRequestError,
    PersonalChatUnauthorizedError,
    PersonalChatInvalidCredentialsError,
    PersonalChatParticipantNotFoundError,
    PersonalChatUserAlreadyExistsError,
  })
  .onError(({ code, error, set }) => {
    if (code === "PersonalChatConversationNotFoundError") {
      set.status = 404

      return {
        error: "Conversation not found" as const,
        conversationId:
          error instanceof PersonalChatConversationNotFoundError
            ? error.conversationId
            : "unknown",
      }
    }

    if (code === "PersonalChatParticipantNotFoundError") {
      set.status = 404

      return {
        error: "Participant not found" as const,
        participantId:
          error instanceof PersonalChatParticipantNotFoundError
            ? error.participantId
            : "unknown",
      }
    }

    if (code === "PersonalChatUnauthorizedError") {
      set.status = 401

      return {
        error: "Unauthorized" as const,
      }
    }

    if (code === "PersonalChatInvalidCredentialsError") {
      set.status = 401

      return {
        error: "Invalid email or password" as const,
      }
    }

    if (code === "PersonalChatBadRequestError") {
      set.status = 400

      return {
        error:
          error instanceof PersonalChatBadRequestError
            ? error.message
            : "Bad request",
      }
    }

    if (code === "PersonalChatUserAlreadyExistsError") {
      set.status = 409

      return {
        error: "User with this email already exists" as const,
      }
    }
  })

export const personalChatApi = personalChatApiBase
  .get(
    "/",
    () => ({
      feature: "personal-chat" as const,
      status: "scaffolded" as const,
    }),
    {
      response: statusSchema,
    },
  )
  .get(
    "/session",
    async ({ cookie }) => {
      const service = getPersonalChatService()
      const session = await service.getSession({
        sessionToken: getPersonalChatSessionToken(cookie),
      })

      return { session }
    },
    {
      response: {
        200: sessionResponseSchema,
        401: unauthorizedSchema,
      },
    },
  )
  .get(
    "/dm-candidates",
    async ({ cookie }) => {
      const service = getPersonalChatService()
      const candidates = await service.getDmCandidates({
        sessionToken: getPersonalChatSessionToken(cookie),
      })

      return { candidates }
    },
    {
      response: {
        200: dmCandidatesResponseSchema,
        401: unauthorizedSchema,
      },
    },
  )
  .get(
    "/users/search",
    async ({ cookie, query }) => {
      const service = getPersonalChatService()
      const users = await service.searchUsers(
        {
          sessionToken: getPersonalChatSessionToken(cookie),
        },
        query,
      )

      return { users }
    },
    {
      query: userSearchQuerySchema,
      response: {
        200: userSearchResponseSchema,
        401: unauthorizedSchema,
      },
    },
  )
  .get(
    "/conversations",
    async ({ cookie }) => {
      const service = getPersonalChatService()
      const conversations = await service.getConversationSummaries({
        sessionToken: getPersonalChatSessionToken(cookie),
      })

      return { conversations }
    },
    {
      response: {
        200: conversationListResponseSchema,
        401: unauthorizedSchema,
      },
    },
  )
  .get(
    "/conversations/:conversationId",
    async ({ cookie, params, query }) => {
      const service = getPersonalChatService()
      const conversation = await service.getConversationDetail(
        { sessionToken: getPersonalChatSessionToken(cookie) },
        params.conversationId,
        query,
      )

      return { conversation }
    },
    {
      params: z.object({
        conversationId: z.string().min(1),
      }),
      query: conversationDetailQuerySchema,
      response: {
        200: conversationResponseSchema,
        401: unauthorizedSchema,
        404: conversationNotFoundSchema,
      },
    },
  )
  .post(
    "/register",
    async ({ body, cookie, set }) => {
      const service = getPersonalChatService()
      const result = await service.register(body)

      setPersonalChatSessionCookie(cookie, result.sessionToken)
      set.status = 201

      return { session: result.session }
    },
    {
      body: registerBodySchema,
      response: {
        201: sessionResponseSchema,
        400: badRequestSchema,
        409: userAlreadyExistsSchema,
      },
    },
  )
  .post(
    "/login",
    async ({ body, cookie }) => {
      const service = getPersonalChatService()
      const result = await service.login(body)

      setPersonalChatSessionCookie(cookie, result.sessionToken)

      return { session: result.session }
    },
    {
      body: loginBodySchema,
      response: {
        200: sessionResponseSchema,
        400: badRequestSchema,
        401: invalidCredentialsSchema,
      },
    },
  )
  .post(
    "/logout",
    async ({ cookie }) => {
      const service = getPersonalChatService()
      try {
        await service.logout({
          sessionToken: getPersonalChatSessionToken(cookie),
        })
      } catch (error) {
        if (!(error instanceof PersonalChatUnauthorizedError)) {
          throw error
        }
      } finally {
        clearPersonalChatSessionCookie(cookie)
      }

      return { success: true as const }
    },
    {
      response: logoutResponseSchema,
    },
  )
  .post(
    "/direct-conversations",
    async ({ body, cookie }) => {
      const service = getPersonalChatService()
      const conversation = await service.openOrCreateDirectConversation(
        { sessionToken: getPersonalChatSessionToken(cookie) },
        body,
      )

      return { conversation }
    },
    {
      body: directConversationBodySchema,
      response: {
        200: directConversationResponseSchema,
        400: badRequestSchema,
        401: unauthorizedSchema,
        404: participantNotFoundSchema,
      },
    },
  )
  .post(
    "/chat-invites",
    async ({ body, cookie }) => {
      const service = getPersonalChatService()
      return service.sendChatInvite(
        { sessionToken: getPersonalChatSessionToken(cookie) },
        body,
      )
    },
    {
      body: chatInviteBodySchema,
      response: {
        200: chatInviteResponseSchema,
        400: badRequestSchema,
        401: unauthorizedSchema,
      },
    },
  )
  .post(
    "/conversations/:conversationId/messages",
    async ({ body, cookie, params }) => {
      const service = getPersonalChatService()
      const message = await service.sendMessage(
        { sessionToken: getPersonalChatSessionToken(cookie) },
        {
          conversationId: params.conversationId,
          text: body.text,
          clientMessageId: body.clientMessageId,
        },
      )

      return { message }
    },
    {
      params: z.object({
        conversationId: z.string().min(1),
      }),
      body: sendMessageBodySchema,
      response: {
        200: messageResponseSchema,
        400: badRequestSchema,
        401: unauthorizedSchema,
        404: conversationNotFoundSchema,
      },
    },
  )
  .post(
    "/conversations/:conversationId/privacy-room-link",
    async ({ body, cookie, params }) => {
      const service = getPersonalChatService()
      const message = await service.createPrivacyRoomLink(
        { sessionToken: getPersonalChatSessionToken(cookie) },
        {
          conversationId: params.conversationId,
          encryptionKey: body.encryptionKey,
          clientMessageId: body.clientMessageId,
        },
      )

      return { message }
    },
    {
      params: z.object({
        conversationId: z.string().min(1),
      }),
      body: privacyRoomLinkBodySchema,
      response: {
        200: privacyLinkMessageResponseSchema,
        400: badRequestSchema,
        401: unauthorizedSchema,
        404: conversationNotFoundSchema,
      },
    },
  )
  .post(
    "/conversations/:conversationId/privacy-room-draft",
    async ({ body, cookie, params }) => {
      const service = getPersonalChatService()

      await service.getConversationDetail(
        { sessionToken: getPersonalChatSessionToken(cookie) },
        params.conversationId,
        {
          limit: 1,
        },
      )

      const { roomId } = await createPrivateRoom()
      const roomUrl = buildPersonalChatPrivacyRoomUrl(roomId, body.encryptionKey)

      return {
        draft: {
          roomId,
          roomUrl,
          label: personalChatPrivacyRoomLabel,
          body: createPersonalChatPrivacyLinkBody(roomId, body.encryptionKey),
        },
      }
    },
    {
      params: z.object({
        conversationId: z.string().min(1),
      }),
      body: z.object({
        encryptionKey: z
          .string()
          .refine(
            isValidPersonalChatPrivacyRoomKey,
            "Encryption key must be a 64-character hexadecimal string",
          ),
      }),
      response: {
        200: privacyRoomDraftResponseSchema,
        401: unauthorizedSchema,
        404: conversationNotFoundSchema,
      },
    },
  )
  .post(
    "/realtime/session",
    async ({ body, cookie, headers }) => {
      const service = getPersonalChatService()
      const realtimeSession = await service.createRealtimeSession(
        { sessionToken: getPersonalChatSessionToken(cookie) },
        body,
      )

      return {
        realtimeSession:
          realtimeSession.provider === "gateway"
            ? {
                ...realtimeSession,
                socketUrl: resolvePersonalChatRealtimeSocketUrl({
                  configuredSocketUrl: realtimeSession.socketUrl,
                  requestHost: headers["x-forwarded-host"] ?? headers.host,
                  requestProtocol: headers["x-forwarded-proto"],
                }),
              }
            : realtimeSession,
      }
    },
    {
      body: realtimeSessionBodySchema,
      response: {
        200: realtimeSessionResponseSchema,
        401: unauthorizedSchema,
        404: conversationNotFoundSchema,
      },
    },
  )
