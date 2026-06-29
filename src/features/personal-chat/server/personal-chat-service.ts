import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  DmCandidate,
  PersonalSession,
  PrivacyLinkMessage,
  RealtimeSessionBootstrap,
} from "@/features/personal-chat/domain"

export interface PersonalChatServiceContext {
  sessionToken?: string | null
}

export interface PersonalChatLoginInput {
  email: string
  password: string
}

export interface PersonalChatRegisterInput {
  email: string
  password: string
  displayName: string
}

export interface PersonalChatLoginResult {
  session: PersonalSession
  sessionToken: string
}

export interface OpenDirectConversationInput {
  participantId: string
}

export interface SearchPersonalUsersInput {
  query: string
  limit?: number
}

export interface ConversationMessagePageInput {
  limit?: number
  before?: string
  after?: string
}

export interface SendPersonalMessageInput {
  conversationId: string
  text: string
  clientMessageId?: string
}

export interface CreatePrivacyRoomLinkInput {
  conversationId: string
  encryptionKey: string
  clientMessageId?: string
}

export interface CreateRealtimeSessionInput {
  conversationId: string
}

export interface SendChatInviteInput {
  email: string
  inviteUrl: string
}

export interface SendChatInviteResult {
  sent: true
}

export interface PersonalChatService {
  getSession(context: PersonalChatServiceContext): Promise<PersonalSession>
  getDmCandidates(context: PersonalChatServiceContext): Promise<DmCandidate[]>
  searchUsers(
    context: PersonalChatServiceContext,
    input: SearchPersonalUsersInput,
  ): Promise<DmCandidate[]>
  getConversationSummaries(
    context: PersonalChatServiceContext,
  ): Promise<ConversationSummary[]>
  getConversationDetail(
    context: PersonalChatServiceContext,
    conversationId: string,
    page?: ConversationMessagePageInput,
  ): Promise<ConversationDetail>
  register(input: PersonalChatRegisterInput): Promise<PersonalChatLoginResult>
  login(input: PersonalChatLoginInput): Promise<PersonalChatLoginResult>
  logout(context: PersonalChatServiceContext): Promise<void>
  openOrCreateDirectConversation(
    context: PersonalChatServiceContext,
    input: OpenDirectConversationInput,
  ): Promise<ConversationSummary>
  sendMessage(
    context: PersonalChatServiceContext,
    input: SendPersonalMessageInput,
  ): Promise<ChatMessage>
  createPrivacyRoomLink(
    context: PersonalChatServiceContext,
    input: CreatePrivacyRoomLinkInput,
  ): Promise<PrivacyLinkMessage>
  createRealtimeSession(
    context: PersonalChatServiceContext,
    input: CreateRealtimeSessionInput,
  ): Promise<RealtimeSessionBootstrap>
  sendChatInvite(
    context: PersonalChatServiceContext,
    input: SendChatInviteInput,
  ): Promise<SendChatInviteResult>
}

export class PersonalChatConversationNotFoundError extends Error {
  conversationId: string
  constructor(conversationId: string) {
    super(`Conversation "${conversationId}" was not found`)
    this.name = "PersonalChatConversationNotFoundError"
    this.conversationId = conversationId
  }
}

export class PersonalChatUnauthorizedError extends Error {
  constructor() {
    super("Unauthorized")
    this.name = "PersonalChatUnauthorizedError"
  }
}

export class PersonalChatInvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password")
    this.name = "PersonalChatInvalidCredentialsError"
  }
}

export class PersonalChatUserAlreadyExistsError extends Error {
  constructor() {
    super("User with this email already exists")
    this.name = "PersonalChatUserAlreadyExistsError"
  }
}

export class PersonalChatParticipantNotFoundError extends Error {
  participantId: string

  constructor(participantId: string) {
    super(`Participant "${participantId}" was not found`)
    this.name = "PersonalChatParticipantNotFoundError"
    this.participantId = participantId
  }
}

export class PersonalChatBadRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PersonalChatBadRequestError"
  }
}

export class PersonalChatDependencyError extends Error {
  cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message, {
      cause,
    })
    this.name = "PersonalChatDependencyError"
    this.cause = cause
  }
}
