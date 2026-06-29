import type { Metadata } from "next"
import Link from "next/link"
import { PersonalLoginForm } from "@/features/personal-chat/client"
import { resolveAccountLoginSuccessPath } from "@/features/auth/route-guard-paths"
import { redirectAuthenticatedAccountRoute } from "@/features/auth/server"
import { personalChatServerConfig } from "@/features/personal-chat/server"

export const metadata: Metadata = {
  title: "Sign In",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams
  const redirectTo = resolveAccountLoginSuccessPath(
    Array.isArray(next) ? next[0] : next,
  )
  const showMockCredentials = personalChatServerConfig.serviceMode === "mock"

  await redirectAuthenticatedAccountRoute(redirectTo)

  return (
    <main className="relative flex h-[100dvh] min-h-0 overflow-hidden bg-[radial-gradient(circle_at_18%_16%,rgba(56,189,248,0.1),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(34,197,94,0.08),transparent_30%),radial-gradient(circle_at_58%_88%,rgba(245,158,11,0.08),transparent_32%),linear-gradient(180deg,#060708_0%,#0a0b0d_100%)] text-zinc-100">
      <header className="absolute inset-x-0 top-0 z-20 h-16 border-b border-zinc-800/60 bg-black/35 backdrop-blur">
        <div className="mx-auto flex h-full w-full max-w-7xl items-center px-4">
          <Link
            href="/login"
            prefetch={false}
            className="text-base font-semibold uppercase tracking-[0.28em] text-white transition-colors hover:text-zinc-200 sm:text-lg"
          >
            PULSE
          </Link>
        </div>
      </header>

      <section className="grid h-full min-h-0 w-full min-w-0 pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(23rem,31rem)]">
        <div className="relative isolate hidden min-h-0 min-w-0 items-center overflow-hidden px-8 lg:flex">
          <div
            aria-hidden="true"
            className="absolute inset-x-[-12%] top-1/2 -z-10 h-[34rem] -translate-y-1/2 bg-[radial-gradient(circle_at_20%_22%,rgba(56,189,248,0.14),transparent_32%),radial-gradient(circle_at_72%_24%,rgba(34,197,94,0.1),transparent_31%),radial-gradient(circle_at_54%_78%,rgba(245,158,11,0.1),transparent_34%)] blur-3xl"
          />

          <div className="max-w-2xl space-y-8">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.34em] text-zinc-500">
                PULSE IDENTITY
              </p>
              <h1 className="max-w-2xl text-[2.85rem] font-semibold leading-tight tracking-tight text-white">
                One identity across personal, private, and AI conversations.
              </h1>
              <p className="max-w-xl text-base leading-7 text-zinc-400">
                Move seamlessly between people, private rooms, and AI threads.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold uppercase tracking-[0.28em] text-zinc-300">
                <span className="text-sky-300">Personal</span>
                <span className="text-emerald-300">Private</span>
                <span className="text-amber-300">AI</span>
              </div>
              <p className="max-w-md text-xs leading-6 text-zinc-500">
                Access all conversation modes with one account.
              </p>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 items-center justify-center px-5 py-5 lg:border-l lg:border-zinc-800/60 lg:px-10">
          <div className="w-full max-w-[27rem] min-w-0">
            <div
              aria-hidden="true"
              className="h-px bg-gradient-to-r from-sky-400/60 via-emerald-300/45 to-amber-300/45"
            />
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">
              Pulse Account
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Continue with Pulse
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Sign in once to access your conversations and AI workspace.
            </p>

            <PersonalLoginForm
              redirectTo={redirectTo}
              showMockCredentials={showMockCredentials}
            />
          </div>
        </div>
      </section>
    </main>
  )
}
