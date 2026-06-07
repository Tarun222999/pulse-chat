"use client"

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

const personalSessionResponseSchema = z.object({
  session: personalSessionSchema,
})

const dmCandidatesResponseSchema = z.object({
  candidates: z.array(dmCandidateSchema),
})

const userSearchResponseSchema = z.object({
  users: z.array(dmCandidateSchema),
})

const conversationSummariesResponseSchema = z.object({
  conversations: z.array(conversationSummarySchema),
})

const conversationDetailResponseSchema = z.object({
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

const logoutResponseSchema = z.object({
  success: z.literal(true),
})

const realtimeSessionResponseSchema = z.object({
  realtimeSession: realtimeSessionBootstrapSchema,
})

const apiErrorResponseSchema = z.object({
  error: z.string(),
  conversationId: z.string().optional(),
  participantId: z.string().optional(),
})

export interface PersonalChatLoginInput {
  email: string
  password: string
}

export interface PersonalChatRegisterInput {
  email: string
  password: string
  displayName: string
}

export interface OpenPersonalChatDirectConversationInput {
  participantId: string
}

export interface SendPersonalChatInviteInput {
  email: string
  inviteUrl: string
}

export interface SearchPersonalUsersInput {
  query: string
  limit?: number
}

export interface ConversationDetailMessagePageInput {
  limit?: number
  before?: string
  after?: string
}

export interface SendPersonalChatMessageInput {
  conversationId: string
  text: string
  clientMessageId?: string
}

export interface CreatePersonalChatPrivacyRoomLinkInput {
  conversationId: string
  encryptionKey: string
  clientMessageId?: string
}

export interface PreparePersonalChatPrivacyRoomDraftInput {
  conversationId: string
  encryptionKey: string
}

export interface PersonalChatPrivacyRoomDraft {
  roomId: string
  roomUrl: string
  label: string
  body: string
}

export interface CreatePersonalChatRealtimeSessionInput {
  conversationId: string
}

export class PersonalChatApiError extends Error {
  status: number
  details?: z.infer<typeof apiErrorResponseSchema>

  constructor(
    message: string,
    status: number,
    details?: z.infer<typeof apiErrorResponseSchema>,
  ) {
    super(message)
    this.name = "PersonalChatApiError"
    this.status = status
    this.details = details
  }
}

const readJson = async <TSchema extends z.ZodTypeAny>(
  response: Response,
  schema: TSchema,
): Promise<z.infer<TSchema>> => {
  const rawPayload = await response.text()
  let payload: unknown

  try {
    payload = rawPayload ? JSON.parse(rawPayload) : null
  } catch (error) {
    if (!response.ok) {
      throw new PersonalChatApiError(
        `Request failed (${response.status})${rawPayload ? `: ${rawPayload}` : ""}`,
        response.status,
      )
    }

    throw error
  }

  if (!response.ok) {
    const details = apiErrorResponseSchema.safeParse(payload)

    throw new PersonalChatApiError(
      details.success ? details.data.error : "Request failed",
      response.status,
      details.success ? details.data : undefined,
    )
  }

  return schema.parse(payload)
}

const fetchPersonalChat = async <TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  init?: RequestInit,
): Promise<z.infer<TSchema>> => {
  const headers = new Headers(init?.headers)

  if (!headers.has("accept")) {
    headers.set("accept", "application/json")
  }

  const response = await fetch(`/api/personal${path}`, {
    credentials: "same-origin",
    ...init,
    headers,
  })

  return readJson(response, schema)
}

export const getPersonalSession = async () => {
  const response = await fetchPersonalChat("/session", personalSessionResponseSchema)
  return response.session
}

export const getDmCandidates = async () => {
  const response = await fetchPersonalChat(
    "/dm-candidates",
    dmCandidatesResponseSchema,
  )

  return response.candidates
}

export const searchPersonalUsers = async (input: SearchPersonalUsersInput) => {
  const searchParams = new URLSearchParams({
    query: input.query,
  })

  if (typeof input.limit === "number") {
    searchParams.set("limit", String(input.limit))
  }

  const response = await fetchPersonalChat(
    `/users/search?${searchParams.toString()}`,
    userSearchResponseSchema,
  )

  return response.users
}

export const getConversationSummaries = async () => {
  const response = await fetchPersonalChat(
    "/conversations",
    conversationSummariesResponseSchema,
  )

  return response.conversations
}

export const getConversationDetail = async (
  conversationId: string,
  input?: ConversationDetailMessagePageInput,
) => {
  const encodedConversationId = encodeURIComponent(conversationId)
  const searchParams = new URLSearchParams()

  if (typeof input?.limit === "number") {
    searchParams.set("limit", String(input.limit))
  }

  if (input?.before) {
    searchParams.set("before", input.before)
  }

  if (input?.after) {
    searchParams.set("after", input.after)
  }

  const query = searchParams.toString()
  const response = await fetchPersonalChat(
    `/conversations/${encodedConversationId}${query ? `?${query}` : ""}`,
    conversationDetailResponseSchema,
  )

  return response.conversation
}

export const loginToPersonalChat = async (input: PersonalChatLoginInput) => {
  const response = await fetchPersonalChat("/login", personalSessionResponseSchema, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  })

  return response.session
}

export const registerToPersonalChat = async (input: PersonalChatRegisterInput) => {
  const response = await fetchPersonalChat(
    "/register",
    personalSessionResponseSchema,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    },
  )

  return response.session
}

export const logoutFromPersonalChat = async () => {
  await fetchPersonalChat("/logout", logoutResponseSchema, {
    method: "POST",
  })
}

export const openOrCreatePersonalChatDirectConversation = async (
  input: OpenPersonalChatDirectConversationInput,
) => {
  const response = await fetchPersonalChat(
    "/direct-conversations",
    directConversationResponseSchema,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    },
  )

  return response.conversation
}

export const sendPersonalChatInvite = async (
  input: SendPersonalChatInviteInput,
) => {
  const response = await fetchPersonalChat("/chat-invites", chatInviteResponseSchema, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  })

  return response
}

export const sendPersonalChatMessage = async (
  input: SendPersonalChatMessageInput,
) => {
  const encodedConversationId = encodeURIComponent(input.conversationId)
  const response = await fetchPersonalChat(
    `/conversations/${encodedConversationId}/messages`,
    messageResponseSchema,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text: input.text,
        clientMessageId: input.clientMessageId,
      }),
    },
  )

  return response.message
}

export const createPersonalChatPrivacyRoomLink = async (
  input: CreatePersonalChatPrivacyRoomLinkInput,
) => {
  const encodedConversationId = encodeURIComponent(input.conversationId)
  const response = await fetchPersonalChat(
    `/conversations/${encodedConversationId}/privacy-room-link`,
    privacyLinkMessageResponseSchema,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        encryptionKey: input.encryptionKey,
        clientMessageId: input.clientMessageId,
      }),
    },
  )

  return response.message
}

export const preparePersonalChatPrivacyRoomDraft = async (
  input: PreparePersonalChatPrivacyRoomDraftInput,
) => {
  const encodedConversationId = encodeURIComponent(input.conversationId)
  const response = await fetchPersonalChat(
    `/conversations/${encodedConversationId}/privacy-room-draft`,
    privacyRoomDraftResponseSchema,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        encryptionKey: input.encryptionKey,
      }),
    },
  )

  return response.draft
}

export const createPersonalChatRealtimeSession = async (
  input: CreatePersonalChatRealtimeSessionInput,
) => {
  const response = await fetchPersonalChat(
    "/realtime/session",
    realtimeSessionResponseSchema,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        conversationId: input.conversationId,
      }),
    },
  )

  return response.realtimeSession
}
