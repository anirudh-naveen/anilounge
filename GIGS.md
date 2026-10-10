# AniLounge gigs

How to find, claim, and finish a gig. To set up the project and open a pull request, see
[CONTRIBUTING.md](CONTRIBUTING.md).

## The gig board

Open tasks are called **gigs**. They are GitHub issues on the
[AniLounge Gigs](PROJECT_URL) board, and each one is mirrored as a post in the
**#gig-board** forum on our [Discord](DISCORD_INVITE). Each post shows the task, its
difficulty, any bounty, and the requirements. The bot keeps the posts up to date, and a
post disappears once its gig is done or closed.

- Issues labelled [`good first issue`](https://github.com/anirudh-naveen/anilounge/labels/good%20first%20issue)
  are small and self-contained, and each one names the files to start from.
- Bigger gigs: talk through your approach in the gig's Discord post or on the issue
  before you write much code.
- Found a bug or have an idea? Open an issue. For anything larger than a small fix, please
  open the issue before the pull request. A maintainer decides whether it becomes a gig.

## Claiming a gig

Claim a gig before you start, so two people don't build the same thing.

1. Join the Discord and ask for the **Developer** role.
2. Run `/link` and sign in with GitHub. This links your Discord account to your GitHub
   account. You only do it once.
3. Open the gig's post in #gig-board and run `/claim`. A maintainer approves or denies
   the request.
4. Once approved, the issue is assigned to you on GitHub, and the post shows the gig as
   claimed. If GitHub can't assign you yet, leave a comment on the issue and a
   maintainer will assign you.

Some rules keep gigs moving:

- You can hold **2 claims or pending requests** at a time.
- Open a draft pull request early and link it to the issue (`Closes #12`). A claim
  expires **7 days after your last commit** on that pull request, or 7 days after
  approval if you haven't opened one. When a claim expires, the gig goes back on the
  board. Pull requests waiting for review don't expire.
- Changed your mind? Run `/unclaim` in the post, and the gig opens up again for
  someone else.
- `/gigs` lists every open gig.

Some gigs show a **bounty**. BOUNTY_TERMS (for example: "Bounties are paid after the pull
request is merged. Ask a maintainer in the gig's post if you have questions.")

Security problems are never gigs. See
[Security issues](CONTRIBUTING.md#security-issues).
