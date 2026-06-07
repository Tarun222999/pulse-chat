"use client"

import { format } from "date-fns"
import Link from "next/link"
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams, useRouter } from "next/navigation"
import {
  PersonalChatApiError,
  sendPersonalChatInvite,
} from "@/features/personal-chat/client/personal-chat-api"
import { useUsername } from "@/hooks/use-username"
import { client } from "@/lib/client"
import { encrypt } from "@/lib/encryption"
import { useRealtime } from "@/lib/realtime-client"
import DecryptedMessage from "@/components/private-chat-decrypted-message"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function formatTimeRemaining(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

type PendingMessage = {
  id: string
  sender: string
  text: string
  timeStamp: number
  status: "sending" | "failed"
}

const createPendingMessageId = () =>
  `pending-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`}`

function InviteIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M4 6h12a2 2 0 0 1 2 2v7" />
      <path d="m4 8 7 5 7-5" />
      <path d="M4 6v10a2 2 0 0 0 2 2h7" />
      <path d="M18 16v6" />
      <path d="M15 19h6" />
    </svg>
  )
}

const getInviteErrorMessage = (error: unknown) => {
  if (error instanceof PersonalChatApiError) {
    if (error.status === 401) {
      return "Sign in through Personal inbox to send email invites."
    }

    return error.message || "Unable to send the invite right now."
  }

  return "Unable to send the invite right now."
}

export default function PrivateRoomPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { username } = useUsername()
  const roomId = params.roomId as string
  const [copyStatus, setCopyStatus] = useState("COPY")
  const [input, setInput] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const messageViewportRef = useRef<HTMLDivElement>(null)
  const messageEndRef = useRef<HTMLDivElement>(null)
  const previousMessageCountRef = useRef(0)
  const isNearBottomRef = useRef(true)
  const forceScrollToLatestRef = useRef(false)
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null)
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([])

  const { data } = useQuery({
    queryKey: ["room-expiration", roomId],
    queryFn: async () => {
      const res = await client.room.ttl.get({
        query: { roomId },
      })

      return res.data
    },
    staleTime: Infinity,
  })

  const setTimeEvent = useEffectEvent((time: number) => {
    setTimeRemaining(time)
  })

  useEffect(() => {
    if (!data) {
      return
    }

    if (data.destroyed || !data.expiresAt) {
      router.push("/private?destroyed=true")
      return
    }

    const drift = Date.now() - data.serverTime

    const calculateRemaining = () => {
      const correctedNow = Date.now() - drift

      return Math.max(0, Math.floor((data.expiresAt - correctedNow) / 1000))
    }

    setTimeEvent(calculateRemaining())

    const interval = setInterval(() => {
      const remaining = calculateRemaining()
      setTimeEvent(remaining)

      if (remaining === 0) {
        router.push("/private?destroyed=true")
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [data, router])

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "")

      if (hash) {
        if (hash.length !== 64) {
          router.push("/private?error=invalid-key")
        } else {
          setEncryptionKey(hash)
        }

        return
      }

      router.push("/private?error=missing-key")
    }

    handleHashChange()
    globalThis.addEventListener("hashchange", handleHashChange)

    return () => globalThis.removeEventListener("hashchange", handleHashChange)
  }, [router])

  const { data: messages, refetch } = useQuery({
    queryKey: ["messages", roomId],
    queryFn: async () => {
      const res = await client.messages.get({ query: { roomId } })
      return res.data
    },
  })

  const messageCount = (messages?.messages.length ?? 0) + pendingMessages.length

  useLayoutEffect(() => {
    if (messageCount === 0) {
      previousMessageCountRef.current = 0
      forceScrollToLatestRef.current = false
      return
    }

    const isInitialLoad = previousMessageCountRef.current === 0
    const hasNewMessages = messageCount > previousMessageCountRef.current
    const shouldScroll =
      isInitialLoad ||
      forceScrollToLatestRef.current ||
      (hasNewMessages && isNearBottomRef.current)

    if (shouldScroll) {
      messageEndRef.current?.scrollIntoView({
        behavior: isInitialLoad ? "auto" : "smooth",
        block: "end",
      })
    }

    previousMessageCountRef.current = messageCount
    forceScrollToLatestRef.current = false
  }, [messageCount])

  const { mutate: sendMessage, isPending } = useMutation({
    mutationFn: async ({
      text,
    }: {
      pendingId: string
      text: string
    }) => {
      if (!encryptionKey) {
        console.error("Refused to send message without encryption key", {
          roomId,
          username,
        })
        throw new Error("Missing encryption key")
      }

      const encrypted = await encrypt(text, encryptionKey)

      const res = await client.messages.post(
        { sender: username, text: encrypted },
        { query: { roomId } },
      )

      if (res.status !== 200) {
        console.error("Failed to send encrypted message", {
          status: res.status,
          error: res.error,
          roomId,
        })
        throw new Error("Unable to send message right now.")
      }
    },
    onMutate: ({ pendingId, text }) => {
      setActionError(null)
      setPendingMessages((currentMessages) => [
        ...currentMessages,
        {
          id: pendingId,
          sender: username,
          text,
          timeStamp: Date.now(),
          status: "sending",
        },
      ])
    },
    onSuccess: (_data, { pendingId, text }) => {
      forceScrollToLatestRef.current = true
      setInput((currentInput) => (currentInput === text ? "" : currentInput))
      setPendingMessages((currentMessages) =>
        currentMessages.filter((message) => message.id !== pendingId),
      )
      void refetch()
    },
    onError: (error, { pendingId }) => {
      console.error("sendMessage mutation failed", error)
      setPendingMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === pendingId
            ? {
                ...message,
                status: "failed",
              }
            : message,
        ),
      )
      setActionError(
        error instanceof Error && error.message === "Missing encryption key"
          ? "Encryption key missing. Reopen the secure invite link and try again."
          : "Unable to send your encrypted message right now.",
      )
    },
  })

  const handleSendMessage = () => {
    const trimmedInput = input.trim()

    if (!trimmedInput || isPending || !encryptionKey) {
      return
    }

    forceScrollToLatestRef.current = true
    sendMessage({
      pendingId: createPendingMessageId(),
      text: trimmedInput,
    })
    inputRef.current?.focus()
  }

  const handleMessageViewportScroll = () => {
    const viewport = messageViewportRef.current

    if (!viewport) {
      return
    }

    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
    isNearBottomRef.current = distanceFromBottom < 120
  }

  useRealtime({
    channels: [roomId],
    events: ["chat.message", "chat.destroy"],
    onData: ({ event }) => {
      if (event === "chat.message") {
        void refetch()
      }

      if (event === "chat.destroy") {
        router.push("/private?destroyed=true")
      }
    },
  })

  const copyLink = () => {
    navigator.clipboard.writeText(globalThis.location.href)
    setCopyStatus("COPIED")
    setTimeout(() => setCopyStatus("COPY"), 2000)
  }

  const { mutate: sendInvite, isPending: isInvitePending } = useMutation({
    mutationFn: async (email: string) => {
      await sendPersonalChatInvite({
        email,
        inviteUrl: globalThis.location.href,
      })
    },
    onMutate: () => {
      setInviteError(null)
      setInviteSuccess(null)
    },
    onSuccess: (_data, email) => {
      setInviteEmail("")
      setInviteSuccess(`Invite sent to ${email}.`)
    },
    onError: (error) => {
      setInviteError(getInviteErrorMessage(error))
    },
  })

  const handleSendInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const email = inviteEmail.trim()
    setInviteError(null)
    setInviteSuccess(null)

    if (!email) {
      setInviteError("Enter an email address.")
      return
    }

    if (!EMAIL_PATTERN.test(email)) {
      setInviteError("Enter a valid email address.")
      return
    }

    sendInvite(email)
  }

  const openInviteDialog = () => {
    setInviteError(null)
    setInviteSuccess(null)
    setIsInviteDialogOpen(true)
  }

  const closeInviteDialog = () => {
    if (isInvitePending) {
      return
    }

    setIsInviteDialogOpen(false)
    setInviteError(null)
    setInviteSuccess(null)
  }

  const { mutate: destroyRoom, isPending: isDestroyPending } = useMutation({
    mutationFn: async () => {
      const res = await client.room.delete(null, { query: { roomId } })

      if (res.status !== 200) {
        console.error("Failed to destroy room", {
          status: res.status,
          error: res.error,
          roomId,
        })
        throw new Error("Unable to destroy the room right now.")
      }
    },
    onMutate: () => {
      setActionError(null)
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["messages", roomId] })
      queryClient.removeQueries({ queryKey: ["room-expiration", roomId] })
      router.push("/private?destroyed=true")
    },
    onError: (error) => {
      console.error("destroyRoom mutation failed", error)
      setActionError("Unable to destroy the room right now.")
    },
  })

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-900/30 p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <div className="flex flex-col">
            <span className="text-xs uppercase text-zinc-500">Room ID</span>
            <div className="flex items-center gap-2">
              <span className="truncate font-bold text-green-500">{roomId}</span>
              <button
                onClick={copyLink}
                className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
              >
                {copyStatus}
              </button>
            </div>
          </div>

          <div className="h-8 w-px bg-zinc-800" />

          <div className="flex flex-col">
            <span className="text-xs uppercase text-zinc-500">
              Self-Destruct
            </span>
            <span
              className={`flex items-center gap-2 text-sm font-bold ${
                timeRemaining !== null && timeRemaining < 60
                  ? "text-red-500"
                  : "text-amber-500"
              }`}
            >
              {timeRemaining !== null ? formatTimeRemaining(timeRemaining) : "--:--"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            aria-label="Invite by email"
            title="Invite by email"
            onClick={openInviteDialog}
            className="flex h-10 w-10 items-center justify-center rounded border border-green-500/40 bg-green-500/10 text-green-300 transition-colors hover:border-green-400 hover:bg-green-500 hover:text-black focus:outline-none focus:ring-2 focus:ring-green-500/40"
          >
            <InviteIcon />
          </button>
          <Link
            href="/personal"
            prefetch={false}
            className="rounded border border-zinc-800 bg-zinc-950/60 px-3 py-1.5 text-xs font-bold text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
          >
            Personal inbox
          </Link>

          <button
            className="group flex items-center gap-2 rounded bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-400 transition-all hover:bg-red-600 hover:text-white disabled:opacity-50"
            onClick={() => destroyRoom()}
            disabled={isDestroyPending}
          >
            <span className="group-hover:animate-pulse">!!</span>
            DESTROY NOW
          </button>
        </div>
      </header>

      {actionError && (
        <div className="border-b border-red-900 bg-red-950/50 px-4 py-3">
          <p role="alert" className="text-sm text-red-400">
            {actionError}
          </p>
        </div>
      )}

      <div
        ref={messageViewportRef}
        onScroll={handleMessageViewportScroll}
        className="scrollbar-thin flex-1 min-h-0 space-y-4 overflow-y-auto p-4"
      >
        {(messages?.messages.length ?? 0) === 0 && pendingMessages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="font-mono text-sm text-zinc-600">
              No messages yet, start the conversation.
            </p>
          </div>
        )}

        {messages?.messages.map((msg) => (
          <div key={msg.id} className="flex flex-col items-start">
            <div className="group max-w-[80%]">
              <div className="mb-1 flex items-baseline gap-3">
                <span
                  className={`text-xs font-bold ${
                    msg.sender === username ? "text-green-500" : "text-blue-500"
                  }`}
                >
                  {msg.sender === username ? "YOU" : msg.sender}
                </span>

                <span className="text-[10px] text-zinc-600">
                  {format(msg.timeStamp, "HH:mm")}
                </span>
              </div>

              <div className="break-all text-sm leading-relaxed text-zinc-300">
                <DecryptedMessage text={msg.text} encryptionKey={encryptionKey} />
              </div>
            </div>
          </div>
        ))}

        {pendingMessages.map((msg) => (
          <div key={msg.id} className="flex flex-col items-start">
            <div
              className={`group max-w-[80%] ${
                msg.status === "sending" ? "opacity-80" : "opacity-95"
              }`}
            >
              <div className="mb-1 flex items-baseline gap-3">
                <span className="text-xs font-bold text-green-500">YOU</span>
                <span className="text-[10px] text-zinc-600">
                  {format(msg.timeStamp, "HH:mm")}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-[0.2em] ${
                    msg.status === "failed"
                      ? "text-red-400"
                      : "animate-pulse text-green-400"
                  }`}
                >
                  {msg.status === "failed" ? "Not sent" : "Sending"}
                </span>
              </div>

              <div
                className={`break-all border px-3 py-2 text-sm leading-relaxed ${
                  msg.status === "failed"
                    ? "border-red-900/70 bg-red-950/20 text-red-100"
                    : "border-green-500/20 bg-green-500/5 text-zinc-300"
                }`}
              >
                {msg.text}
              </div>
            </div>
          </div>
        ))}
        <div ref={messageEndRef} />
      </div>

      <div className="shrink-0 border-t border-zinc-800 bg-zinc-900/30 p-4">
        <div className="flex gap-4">
          <div className="group relative flex-1">
            <span className="absolute top-1/2 left-4 -translate-y-1/2 animate-pulse text-green-500">
              {">"}
            </span>
            <input
              ref={inputRef}
              autoFocus
              type="text"
              placeholder={
                encryptionKey ? "Type message..." : "Checking encryption..."
              }
              disabled={!encryptionKey}
              value={input}
              onKeyDown={(event) => {
                if (event.key === "Enter" && input.trim() && !isPending) {
                  handleSendMessage()
                }
              }}
              onChange={(event) => setInput(event.target.value)}
              className="w-full border border-zinc-800 bg-black py-3 pr-4 pl-8 text-sm text-zinc-100 placeholder:text-zinc-700 transition-colors focus:border-zinc-700 focus:outline-none"
            />
          </div>

          <button
            onClick={() => {
              if (!input.trim() || isPending) {
                return
              }

              handleSendMessage()
            }}
            disabled={!input.trim() || isPending || !encryptionKey}
            className="flex min-w-24 cursor-pointer items-center justify-center gap-2 bg-zinc-800 px-6 text-sm font-bold text-zinc-400 transition-all hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? (
              <>
                <span
                  aria-hidden="true"
                  className="h-3 w-3 animate-spin rounded-full border border-green-400/30 border-t-green-400"
                />
                SENDING
              </>
            ) : (
              "SEND"
            )}
          </button>
        </div>
      </div>

      {isInviteDialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 py-20 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeInviteDialog()
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="private-room-invite-title"
            className="w-full max-w-sm border border-zinc-700 bg-zinc-950 shadow-[0_24px_90px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
              <div>
                <h2
                  id="private-room-invite-title"
                  className="text-sm font-bold text-zinc-100"
                >
                  Invite by email
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close invite"
                onClick={closeInviteDialog}
                disabled={isInvitePending}
                className="flex h-8 w-8 items-center justify-center rounded border border-zinc-800 bg-black/30 text-xs font-bold text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                X
              </button>
            </div>

            <form onSubmit={handleSendInvite} className="space-y-4 px-5 py-5">
              <div className="space-y-2">
                <label
                  htmlFor="private-room-invite-email"
                  className="block text-xs uppercase tracking-[0.18em] text-zinc-500"
                >
                  Email address
                </label>
                <input
                  id="private-room-invite-email"
                  type="email"
                  autoComplete="email"
                  value={inviteEmail}
                  onChange={(event) => {
                    setInviteEmail(event.target.value)
                    setInviteError(null)
                    setInviteSuccess(null)
                  }}
                  placeholder="friend@example.com"
                  disabled={isInvitePending}
                  className="h-11 w-full border border-zinc-800 bg-black/60 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-green-500 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              {inviteError ? (
                <p
                  role="alert"
                  className="border border-red-900/70 bg-red-950/35 px-3 py-2 text-sm text-red-200"
                >
                  {inviteError}
                </p>
              ) : null}

              {inviteSuccess ? (
                <p
                  role="status"
                  className="border border-green-900/70 bg-green-950/30 px-3 py-2 text-sm text-green-200"
                >
                  {inviteSuccess}
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeInviteDialog}
                  disabled={isInvitePending}
                  className="h-10 rounded border border-zinc-800 bg-black/30 px-4 text-xs font-bold text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isInvitePending}
                  className="flex h-10 min-w-32 items-center justify-center gap-2 rounded border border-green-500/60 bg-green-500/10 px-4 text-xs font-bold text-green-300 transition-colors hover:bg-green-500 hover:text-black disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-500"
                >
                  {isInvitePending ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 animate-spin rounded-full border border-green-400/30 border-t-green-400"
                      />
                      Sending
                    </>
                  ) : (
                    "Send invite"
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  )
}
