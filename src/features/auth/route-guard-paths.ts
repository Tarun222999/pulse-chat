export const accountHomePath = "/personal"
export const accountLoginPath = "/login"

const protectedAccountPathPrefixes = ["/personal", "/ai", "/private"] as const
const legacyAccountLoginPaths = ["/personal/login"] as const

const getPathname = (value: string) => value.split(/[?#]/, 1)[0] ?? value

const isAccountLoginPath = (pathname: string) =>
  pathname === accountLoginPath ||
  legacyAccountLoginPaths.some((loginPath) => loginPath === pathname)

const isProtectedAccountPath = (pathname: string) =>
  protectedAccountPathPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )

export const normalizeAccountGuardNextPath = (
  value: string | null | undefined,
) => {
  if (typeof value !== "string") {
    return null
  }

  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    return null
  }

  if (!trimmedValue.startsWith("/") || trimmedValue.startsWith("//")) {
    return null
  }

  const pathname = getPathname(trimmedValue)

  if (!isProtectedAccountPath(pathname)) {
    return null
  }

  if (isAccountLoginPath(pathname)) {
    return null
  }

  return trimmedValue
}

export const buildAccountLoginRedirectPath = (nextPath?: string | null) => {
  const normalizedNextPath = normalizeAccountGuardNextPath(nextPath)

  if (!normalizedNextPath) {
    return accountLoginPath
  }

  return `${accountLoginPath}?next=${encodeURIComponent(normalizedNextPath)}`
}

export const resolveAccountLoginSuccessPath = (nextPath?: string | null) =>
  normalizeAccountGuardNextPath(nextPath) ?? accountHomePath

export const buildRoutePathWithSearch = (
  pathname: string,
  search?: string | null,
) => {
  if (!search) {
    return pathname
  }

  return search.startsWith("?") ? `${pathname}${search}` : `${pathname}?${search}`
}
