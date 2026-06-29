import type { Metadata } from "next"
import { AiRouteFrame } from "@/features/ai-chat/client"
import { getAccountRouteSession } from "@/features/auth/server"

export const metadata: Metadata = {
  title: "AI Chat",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function AiLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getAccountRouteSession()

  return <AiRouteFrame session={session}>{children}</AiRouteFrame>
}
