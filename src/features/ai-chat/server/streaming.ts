import "server-only"

import {
  streamText,
  type ModelMessage,
} from "ai"
import type {
  AiChatMessage,
  AiModelProfile,
} from "@/features/ai-chat/domain"
import {
  aiChatServerConfig,
  getAiProfileConfig,
} from "./config"
import {
  resolveAiLanguageModel,
  type ResolvedAiLanguageModel,
} from "./provider-registry"
import {
  getAiMessage,
  getRecentAiMessages,
  insertAiMessage,
  renameAiConversationIfDefault,
  updateAiMessage,
  type AiStorageContext,
} from "./storage"
import { generateAiConversationTitle } from "./title"

export interface StreamAiMessageInput {
  conversationId: string
  text: string
  modelProfile: AiModelProfile
  clientMessageId?: string
  abortSignal?: AbortSignal
}

export interface RetryAiMessageStreamInput {
  conversationId: string
  assistantMessageId: string
  modelProfile: AiModelProfile
  abortSignal?: AbortSignal
}

const textEncoder = new TextEncoder()

const aiChatSystemPrompt =
  "You are Pulse AI, a concise and helpful assistant inside a private chat app. " +
  "Do not claim access to personal chats or encrypted private rooms. " +
  "Only use the AI chat messages provided in this conversation."

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "AI response failed"

const isAbortError = (error: unknown) =>
  error instanceof Error &&
  (error.name === "AbortError" ||
    error.name === "ResponseAborted" ||
    error.name === "TimeoutError")

const assertInputWithinLimit = (text: string) => {
  if (text.length > aiChatServerConfig.maxInputChars) {
    throw new Error(
      `AI message is too long. Maximum length is ${aiChatServerConfig.maxInputChars} characters.`,
    )
  }
}

const mapAiChatMessageToModelMessage = (
  message: AiChatMessage,
): ModelMessage | null => {
  if (message.role === "system") {
    return {
      role: "system",
      content: message.content,
    }
  }

  if (message.role === "user") {
    return {
      role: "user",
      content: message.content,
    }
  }

  if (message.status !== "complete" || message.content.length === 0) {
    return null
  }

  return {
    role: "assistant",
    content: message.content,
  }
}

const buildModelMessages = (messages: AiChatMessage[]): ModelMessage[] => [
  {
    role: "system",
    content: aiChatSystemPrompt,
  },
  ...messages
    .map((message) => mapAiChatMessageToModelMessage(message))
    .filter((message): message is ModelMessage => message !== null),
]

const createMockResponseText = (input: StreamAiMessageInput) =>
  [
    "Mock AI response:",
    input.text.length > 0 ? input.text : "I am ready when you are.",
  ].join(" ")

const createMockRetryResponseText = () =>
  "Mock AI retry response: I regenerated the previous assistant turn."

const createPersistedTextStreamResponse = ({
  source,
  assistantMessage,
  context,
  abortSignal,
}: {
  source: AsyncIterable<string>
  assistantMessage: AiChatMessage
  context: AiStorageContext
  abortSignal?: AbortSignal
}) => {
  let assistantText = ""

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (abortSignal?.aborted) {
          throw new DOMException("Request aborted", "AbortError")
        }

        for await (const chunk of source) {
          if (abortSignal?.aborted) {
            throw new DOMException("Request aborted", "AbortError")
          }

          assistantText += chunk
          controller.enqueue(textEncoder.encode(chunk))
        }

        if (assistantText.length === 0) {
          throw new Error("AI provider returned an empty response")
        }

        await updateAiMessage(context, {
          messageId: assistantMessage.id,
          content: assistantText,
          status: "complete",
          errorMessage: null,
        })

        controller.close()
      } catch (error) {
        const status = isAbortError(error) ? "cancelled" : "failed"

        await updateAiMessage(context, {
          messageId: assistantMessage.id,
          content: assistantText,
          status,
          errorMessage: status === "failed" ? getErrorMessage(error) : null,
        })

        if (status === "cancelled") {
          controller.close()
          return
        }

        controller.error(error)
      }
    },
  })

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-transform",
      "content-type": "text/plain; charset=utf-8",
      "x-ai-assistant-message-id": assistantMessage.id,
    },
  })
}

async function* createMockTextStream(text: string) {
  const words = text.split(/(\s+)/).filter((part) => part.length > 0)

  for (const word of words) {
    yield word
    await new Promise((resolve) => setTimeout(resolve, 12))
  }
}

const createAssistantTextStreamResponse = async (
  context: AiStorageContext,
  input: {
    conversationId: string
    modelProfile: AiModelProfile
    mockResponseText: string
    abortSignal?: AbortSignal
  },
): Promise<Response> => {
  const resolvedProviderModel: ResolvedAiLanguageModel | null =
    aiChatServerConfig.serviceMode === "provider"
      ? resolveAiLanguageModel(input.modelProfile)
      : null
  const modelSelection =
    resolvedProviderModel?.selection ?? getAiProfileConfig(input.modelProfile)

  const assistantMessage = await insertAiMessage(context, {
    conversationId: input.conversationId,
    role: "assistant",
    content: "",
    status: "streaming",
    model: modelSelection,
  })

  if (aiChatServerConfig.serviceMode === "mock") {
    return createPersistedTextStreamResponse({
      context,
      assistantMessage,
      abortSignal: input.abortSignal,
      source: createMockTextStream(input.mockResponseText),
    })
  }

  if (!resolvedProviderModel) {
    throw new Error("AI provider model is not configured.")
  }

  const recentMessages = await getRecentAiMessages(
    context,
    input.conversationId,
    aiChatServerConfig.maxHistoryMessages,
  )
  // The response loop below owns client cancellation. Passing the incoming
  // request signal to the provider can make slower streams end without a text
  // delta when the route adapter closes its request lifecycle.
  const result = streamText({
    model: resolvedProviderModel.model,
    messages: buildModelMessages(recentMessages),
  })

  return createPersistedTextStreamResponse({
    context,
    assistantMessage,
    abortSignal: input.abortSignal,
    source: result.textStream,
  })
}

export const streamAiMessage = async (
  context: AiStorageContext,
  input: StreamAiMessageInput,
): Promise<Response> => {
  const trimmedText = input.text.trim()

  assertInputWithinLimit(trimmedText)

  await insertAiMessage(context, {
    conversationId: input.conversationId,
    role: "user",
    content: trimmedText,
    status: "complete",
    model: null,
    clientMessageId: input.clientMessageId,
  })

  const title = await generateAiConversationTitle({
    message: trimmedText,
    modelProfile: input.modelProfile,
    abortSignal: input.abortSignal,
  })

  await renameAiConversationIfDefault(context, {
    conversationId: input.conversationId,
    title,
  })

  return createAssistantTextStreamResponse(context, {
    conversationId: input.conversationId,
    modelProfile: input.modelProfile,
    abortSignal: input.abortSignal,
    mockResponseText: createMockResponseText(input),
  })
}

export const retryAiMessage = async (
  context: AiStorageContext,
  input: RetryAiMessageStreamInput,
): Promise<Response> => {
  const message = await getAiMessage(context, input.assistantMessageId)

  if (message.conversationId !== input.conversationId) {
    throw new Error("AI message does not belong to this conversation.")
  }

  if (message.role !== "assistant") {
    throw new Error("Only assistant messages can be retried.")
  }

  if (message.status !== "failed" && message.status !== "cancelled") {
    throw new Error("Only failed or stopped assistant messages can be retried.")
  }

  return createAssistantTextStreamResponse(context, {
    conversationId: input.conversationId,
    modelProfile: input.modelProfile,
    abortSignal: input.abortSignal,
    mockResponseText: createMockRetryResponseText(),
  })
}
