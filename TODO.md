Additions and Major Changes -

1. Refine the search feature. ✅
2. Rework Gemini chatbot functionality.
3. Have an automatically updating database. ✅
4. Add review system and discussion features for users.
5. Include episode content subgroup for tv shows, with its own cast and description.
6. Include a currently airing tag and timer for new episode updates for airing shows.
7. Seperate English title with Native title (and make both searchable)
8. Collapse MAL specials (OVA/special) into Movies; label them Specials on hover. ✅
9. Add email verification for sign up and password lockouts
10. Make a person's watchlist publicly visible.
11. Add voice actors and animation studios as types of content. 
    - They will not have their own screen but will be searchable and favoritable for the profile.
12. Create a "Stats"" page for watched content (tab under watchlist)
    - Call the original watchlist page "List"
    - Additionally change watchlist so that the filter between the types of "watched" is a dropdown clicker next to the sort instead of individual tabs.

Bug Fixes -

1. Fix the loading time when clicking on relationship content.
    - When clicking on a relationship content and backtracking on the web, it does not go back to the search but stays on the same screen. This may be a clue into the fact that the system thinks its switching pages but it is not displaying such a switch.
2. Fix the duplication of content (is it Tmdb?)
3. Fix the accidental deletion of content (in merge or original filtering?)
4. Fix duplication email login ✅
5. Fix the search feature showing content by default. ✅
6. Fix the content hover screen when hovering over a content item ✅
   - show the Content Image to the left
   - have the dropdown for watchlist addition include watching as an option.
7. Fix the watchlist content size in My Watchlist ✅
8. Fix the tabs (Home, Movies, TV Shows, etc) to have icons when the screen is small (like on phone dimensions). ✅
9. Fix population of ratings from APIs. ✅
    - There should be three sources of ratings (MAL, TMDB, and FINDANIMATION). Those three should have number of raters and each rating score under each content. 
    - Some of those will not have all three, or even two of the three to contribute to the rating. 
    - Add the numbers of voters together and weight the ratings in the avergae shown accordingly.
10. Fix filter of ratings displaying proper values in search. ✅
    - Right now for example, filtering between 3-7 is including ratings of 8.0.
11. Even out the filters.