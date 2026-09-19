# TODO

## Content

1. Fix characters as content
   - Character should have images attached.
   - Character should be merged with all of the same name in their home "franchise".
2. Add voice actors as a type of content. ✅
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
4. Fix related content
   - Content have incorrect relationships. For example, re:Zero has been connected with Real Girl, when it should only be connected to other re:Zero media.

## Home

1. Rework the entire homepage
   a. Display a "status" chunk in the majority of the middle (leaning left, leaving space in the right for b.) displaying the latest watchlist changes personally and with friends. If the user isn't logged in, replace the section with a prompt to register to access the watchlist and see personal and friend's activity.
   b. Have a right side bar displaying updates to content in the watchlist (new episode releases or upcoming titles released). If none are available and/or the user is not logged in, show trending episode/title releases.
   c. Under the status rectangle show a bar for the character of the day.
   d. Below them all, display popular forum posts.

## Search

## Watchlist

## Profile

1. Make the profile a more customizable screen with tabs that display the user's Favorites, Watchlist, and Stats as tabs.
   - This must be a customizable place for the user.
   - This user profile must be sharable to the public.
   - Content should have a heart icon to add/remove it to favorites on hover.
2. Add option to delete account.
   - Deny this option for the demo account.
3. Add email verification for sign up and password lockouts.
   - Additionally give option to set up 2FA.
   - The email will be from notify@anilounge.net. This email will be used for all notifications, like announcements as well.
4. Make sure accounts are safe from basic cyber attacks.
5. Have the accounts be auto-logged in on the browser.
6. Add a toggle for a new dark mofe.

## Forum

1. Make sure any public text inboxes have a strict censorship.
   - This includes to the chatbot, usernames and passwords, and the future additions of forums and dms.
2. Add ability for friending others, and add a friends tab to the profile dropdown.
3. Add a Messaging tab to the profile dropdown.
   - This place will allow you to message your friends directly, like as is a normal messagin service. Allow people to see initial message friend requests here as well.
4. Add review system and discussion features for users in a new tab called Forum.
   - Allow users to tag the specified (movies, series, series episodes, and characters) or "franchise" (not sure if this is a current content table yet, if not make it one.)
   - For any associated forums, allow some of the leading forum posts and a few highlighted comments to the associated content's screen.
5. Add an inbox in the profile dropwdown to see any site news, friend invites, comments on a post/comment.

## Infrastructure

1. Migrate from MongoDB to a Relational Database. ✅
2. Create CI/CD test blockers before PRs.
3. Switch the recipient email of the site to support@anilounge.net. Confirm recipient email is setup for bug reports and emails.
