import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { buildAccountLoginRedirectPath } from "@/features/auth/route-guard-paths"

export const metadata: Metadata = {
  title: "Personal Sign In",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function LegacyPersonalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams

  redirect(buildAccountLoginRedirectPath(Array.isArray(next) ? next[0] : next))
}
