import type { Metadata } from "next"
import { notFound } from "next/navigation"

export const metadata: Metadata = {
  title: "Room Not Found",
  robots: {
    index: false,
    follow: false,
  },
}

export default function LegacyRoomLayout() {
  notFound()
}
