import type { Metadata } from "next"
import { PersonalRouteFrame } from "@/features/personal-chat/client"
import { getPersonalRouteSession } from "@/features/personal-chat/server"

export const metadata: Metadata = {
  title: "Personal Chat",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function PersonalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getPersonalRouteSession()

  return <PersonalRouteFrame session={session}>{children}</PersonalRouteFrame>
}
