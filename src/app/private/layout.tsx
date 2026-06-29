import type { Metadata } from "next"
import { PrivateRouteFrame } from "@/features/private-chat/client"

export const metadata: Metadata = {
  title: "Private Chat",
  robots: {
    index: false,
    follow: false,
  },
}

export default function PrivateLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <PrivateRouteFrame>{children}</PrivateRouteFrame>
}
