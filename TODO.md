# TODO

## Content

1. Add method for user to upload their AniList/MAL,Tmdb watchlist ✅
   - Before this, incorporate all the stats that the sites store for user information, if not more, and properly map those to this site's database. ✅
   - Connections page: link AniList/MAL/TMDB, import from the linked account, two-way sync (AniList, MAL) and push-only (TMDB). ✅
2. Add nicknames for content/franchises (mostly in Japan), for example Kono Subarashi is known as KonoSuba, etc.

## Home

## Search

## Watchlist

## Profile

1. Fix user avatar/image upload system

## Forum

1. Make sure any public text inboxes have a strict censorship. ✅
   - This includes to the chatbot, usernames and passwords, and the future additions of forums and dms.
2. Add ability for friending others, and add a friends tab to the profile dropdown. ✅
3. Add a Messaging tab to the profile dropdown. ✅
   - This place will allow you to message your friends directly, like as is a normal messagin service. Allow people to see initial message friend requests here as well.
4. Add review system and discussion features for users in a new tab called Forum. ✅
   - Allow users to tag the specified (movies, series, series episodes, and characters) or "franchise" (not sure if this is a current content table yet, if not make it one.)
   - For any associated forums, allow some of the leading forum posts and a few highlighted comments to the associated content's screen.
   - Update Home with a few highlighted forum posts that refresh every few hours and depend on the user watchlist.
5. Add an inbox in the profile dropwdown to see any site news, friend invites, comments on a post/comment, warnings, etc. ✅
   - Include unresolved watchlist import clashes: when an import finds titles the sites disagree on (or that disagree with the watchlist) and the user leaves Settings before picking a version, prompt them here. Clashes are already saved server-side (`watchlist_import_conflicts`, `GET /api/watchlist/import/conflicts`); for now they only show in Settings → Import.

## Infrastructure

1. Create more CI/CD test blockers before PRs.
2. Watch Connections sync traffic as sign-ups grow (services/connectionSync.js).
   - Unlike apps that sync from the user's device, every AniList call here comes from our server IP, and AniList allows 30-90 requests a minute per IP, shared with catalog jobs. Polling is budgeted (default 12/min AniList, 20/min MAL, each account at most every 2 min), so it can't get us rate-limited, but with N connected accounts each one is polled roughly every N/12 minutes on AniList (~80 min at 1,000 accounts).
   - When that gets too slow: poll recently active users first (and idle accounts rarely), pull on watchlist page load, and/or batch several accounts into one GraphQL request with aliases.
   - Imports aren't pushed out to other connected sites (a big import would be thousands of writes); only edits made afterwards sync. Revisit if users expect an import from one site to fill the other.
