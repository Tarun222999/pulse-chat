# SEO Foundation Plan

## Goal

Introduce practical, real-world SEO basics to Pulse without making the project
more complex than it needs to be.

Pulse is mostly an authenticated/private chat app, so the SEO strategy is:

- Make the public entry page easy for search engines and link previews to
  understand.
- Keep private, authenticated, temporary, and API routes out of search results.
- Add only the SEO infrastructure that is useful for this project right now.

## Step 1: SEO Intent Map

The first SEO decision is whether each route should be indexed.

Indexed pages can appear in search results. Noindexed pages tell search engines
not to show them in search results.

### Should Be Indexed

| Route | Reason |
| --- | --- |
| `/` | Public product entry page for Pulse. This is the main page search engines should understand. |

### Should Not Be Indexed

| Route | Reason |
| --- | --- |
| `/login` | Login pages are utility pages, not useful search results. |
| `/personal` | Authenticated personal inbox. User-specific app content should stay private. |
| `/personal/chat/[conversationId]` | User-specific conversation content should stay private. |
| `/personal/login` | Legacy redirect route; not useful as a search result. |
| `/ai` | Authenticated AI inbox. User-specific app content should stay private. |
| `/ai/chat/[conversationId]` | User-specific AI conversation content should stay private. |
| `/private` | Temporary room launcher. It is functional app UI, not public content. |
| `/private/room/[roomId]` | Temporary encrypted room. These URLs should never be search results. |
| `/api/*` | API endpoints are machine routes, not pages for search results. |

## Initial Implementation Scope

1. Replace default global metadata with Pulse metadata.
2. Add route-level `noindex` metadata for private/authenticated sections.
3. Add `robots.ts` to discourage crawling private and API routes.
4. Add `sitemap.ts` with only the public homepage.
5. Verify the generated metadata, `robots.txt`, and `sitemap.xml`.

## Out Of Scope For Now

- Blog/content system
- Keyword strategy beyond the homepage
- Advanced structured data
- Analytics/search-console setup
- Programmatic SEO pages

These are useful topics later, but they would make this learning pass larger
than it needs to be.
