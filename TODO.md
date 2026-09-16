# TODO

## Content

### Additions

1. Refine the search feature. ✅
2. Separate English title with Native title (and make both searchable). ✅
3. Collapse MAL specials (OVA/special) into Movies; label them Specials on hover. ✅
4. Include episode content subgroup for TV shows, with its own cast and description.
5. Include a currently airing tag and timer for new episode updates for airing shows.
6. Add voice actors as a type of content.
   - They will not have their own screen but will be searchable and favoritable for the profile.
   - Additionally if the API has pictures for them, include them.
7. Add animation studios as a type of content.
   - They will not have their own screen but will be searchable and favoritable for the profile.
   - Additionally if the API has pictures for them, include them.

### Bug Fixes

1. Fix the loading time when clicking on relationship content. ✅
   - When clicking on a relationship content and backtracking on the web, it does not go back to the search but stays on the same screen. This may be a clue into the fact that the system thinks its switching pages but it is not displaying such a switch.
2. Fix the search feature showing content by default. ✅
3. Fix the content hover screen when hovering over a content item. ✅
   - Show the Content Image to the left.
   - Have the dropdown for watchlist addition include watching as an option.
4. Fix population of ratings from APIs. ✅
   - There should be three sources of ratings (MAL, TMDB, and FINDANIMATION). Those three should have number of raters and each rating score under each content.
   - Some of those will not have all three, or even two of the three to contribute to the rating.
   - Add the numbers of voters together and weight the ratings in the average shown accordingly.
5. Fix filter of ratings displaying proper values in search. ✅
   - Right now for example, filtering between 3-7 is including ratings of 8.0.
   - Even out the filters. ✅
6. Fix the duplication of content (is it TMDB?).
7. Fix the accidental deletion of content (in merge or original filtering?).
8. Fix the text for "Add to Watchlist" and "Share" on content pages to be centered.
9. Fix the tabs (Home, Movies, TV Shows, etc) to have icons when the screen is small (like on phone dimensions). ✅

## Watchlist

### Additions

### Bug Fixes

1. Fix the watchlist content size in My Watchlist. ✅
2. Make sure that if content is in the watchlist, when clicking the content the "Add to Watchlist" should instead display the current status on your watchlist.
   - By clicking the current status, you should be allowed to change its status there too.
3. Change watchlist so that the filter between the types of "watched" is a dropdown clicker next to the sort instead of individual tabs.

## Profile

### Additions

1. Make the profile a more customizable screen with tabs that display the user's Favorites, Watchlist, and Stats as tabs.
   - This must be a customizable place for the user.
   - This user profile must be sharable to the public.
2. Add option to delete account.
   - Deny this option for the demo account.
3. Add email verification for sign up and password lockouts.

### Bug Fixes

1. Fix duplication email login. ✅

## Communication

### Additions

1. Add review system and discussion features for users.
2. Rework Gemini chatbot functionality.

## Infrastructure

### Additions

1. Have an automatically updating database. ✅
2. Create CI/CD test blockers before PRs.
