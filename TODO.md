# TODO

## Content

### Additions

1. Refine the search feature. ✅
2. Separate English title with Native title (and make both searchable). ✅
3. Collapse MAL specials (OVA/special) into Movies; label them Specials on hover. ✅
4. Include a content subgroup for TV shows called Episode, with its own title, cast, and description. ✅
   - These should not be clickable into its own page, just expanded when clicked on the show's content page.
   - the Episodes can be a line of content there that can be scrolled through from left to right.
   - Place it under Overview
5. Include a currently airing tag and timer for new episode updates for airing shows. ✅
6. Have the TV Shows Page have tabs for "Popular Right Now", "Currently Airing", and Upcoming Highlights ✅
7. Add voice actors as a type of content.
   - They will not have their own tab but will have their own screen and can be clicked and will be searchable and favoritable for the profile.
   - Additionally if the API has pictures for them, include them.
   - Make sure they appear under every content theyre in with a role, whether they were introduced then or not.
   - Update content and episodes to use this new feature on click.
8. Add animation studios as a type of content.
   - They will not have their own tab but will have their own screen and can be clicked and will be searchable and favoritable for the profile.
   - On their screen, they should show all the movies/shows they have worked on. (not episodes)
   - Additionally if the API has pictures for them, include them.
   - Update content and episodes to use this new feature on click.

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
   - When checking if the content is the same for duplicates, check if any of the names are the same with any of the names from each of the different sources. An example of this issue is with 'The Fragrant Flower Blooms With Dignity', where the native title of one matches the English title of another.
7. Fix the accidental deletion of content (in merge or original filtering?).
8. Fix the text for "Add to Watchlist" and "Share" on content pages to be centered.
9. Fix the tabs (Home, Movies, TV Shows, etc) to have icons when the screen is small (like on phone dimensions). ✅
10. Do not display all alternative titles for content. ✅

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

## Search

### Additions

1. Rework Gemini chatbot functionality.
2. Allow search to filter by "Currently Airing" in the "Year" section.
   - Rename the "Year" filter to something more descriptive and have a more effective filter.
   - Maybe include the seasons like anime does?
3. Add filter for country of origin.

### Bug Fixes

1. Fix search to allow confirmation of search even if no words are types as long as filters are set.
   - Only way search shouldn't be allowed are if both no words in search bar AND no filters set.

## Communication

### Additions

1. Add ability for friending others, and add a friends tab to the profile
2. Add review system and discussion features for users in a new tab called Forum.
   - Allow users to tag the specified content or "franchise" (not sure if this is a current content table yet, if not make it one.)
   - Episodes should be able to be created a forum under.
   - For any associated forums, allow some of the leading forum posts and a few highlighted comments to the associated content's screen.
   - Make sure any public forum post/comments have a strict censorship.
3. Add an inbox next to the profile to see any site news, friend invites, comments on a post/comment
4. Rework Gemini chatbot functionality.

## Infrastructure

### Additions

1. Have an automatically updating database. ✅
2. Create CI/CD test blockers before PRs.
