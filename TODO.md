# TODO

## Content

### Additions

1. Add characters as a type of content.
   - They will not have their own tab but will have their own screen and can be clicked and will be searchable and favoritable for the profile.
   - Additionally if the API has pictures for them, include them.
   - Make sure they appear under every content theyre in with a role, whether they were introduced then or not.
   - Update content and episodes to use this new feature on click.
   - Update the chatbot to be able to answer questions about these (but should not contribute to recommending series if asked)
2. Add voice actors as a type of content.
   - They will not have their own tab but will have their own screen and can be clicked and will be searchable and favoritable for the profile.
   - Additionally if the API has pictures for them, include them.
   - Make sure they appear under every content theyre in with a role, whether they were introduced then or not.
   - Update the chatbot to be able to answer questions about these (but should not contribute to recommending series if asked)
3. Add animation studios as a type of content.
   - They will not have their own tab but will have their own screen and can be clicked and will be searchable and favoritable for the profile.
   - On their screen, they should show all the movies/shows they have worked on. (not episodes)
   - Additionally if the API has pictures for them, include them.
   - Update content and episodes to use this new feature on click.
   - Update the chatbot to use this as a low tier help for recommending series.

### Bug Fixes

1. Fix the text for all buttons on pages to be properly centered.

## Home

### Additions

1. Rework the entire homepage
   a. Display a "status" chunk displaying the latest watchlist changes personally and with friends.
   b. Have a right side bar displaying updates to content in the watchlist (new episode releases or upcoming titles released). If none are available, show trending episode/title releases.
   c. Under the status rectangle show a bar for the character of the day.
   d. Below them all, display popular forum posts.

### Bug Fixes

## Search

### Additions

### Bug Fixes

## Watchlist

### Additions

### Bug Fixes

1. Make sure that if content is in the watchlist, when clicking the content the "Add to Watchlist" should instead display the current status on your watchlist.
   - By clicking the current status, you should be allowed to change its status there too.
2. Change watchlist so that the filter between the types of "watched" is a dropdown clicker next to the sort instead of individual tabs.

## Profile

### Additions

1. Make the profile a more customizable screen with tabs that display the user's Favorites, Watchlist, and Stats as tabs.
   - This must be a customizable place for the user.
   - This user profile must be sharable to the public.
2. Add option to delete account.
   - Deny this option for the demo account.
3. Add email verification for sign up and password lockouts.
   - Additionally give option to set up 2FA
4. Make sure accounts are safe from basic cyber attacks.

### Bug Fixes

## Forum

### Additions

1. Make sure any public text inboxes have a strict censorship.
   - This includes to the chatbot, usernames and passwords, and the future additions of forums and dms.
2. Add ability for friending others, and add a friends tab to the profile dropdown.
3. Add a Messaging tab to the profile dropdown.
   - This place will allow you to message your friends directly, like as is a normal messagin service. Allow people to see initial message friend requests here as well.
4. Add review system and discussion features for users in a new tab called Forum.
   - Allow users to tag the specified (movies, series, series episodes, and characters) or "franchise" (not sure if this is a current content table yet, if not make it one.)
   - For any associated forums, allow some of the leading forum posts and a few highlighted comments to the associated content's screen.
5. Add an inbox in the profile dropwdown to see any site news, friend invites, comments on a post/comment.

### Bug Fixes

## Infrastructure

### Additions

1. Create CI/CD test blockers before PRs.

### Bug Fixes
