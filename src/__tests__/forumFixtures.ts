import type { ForumComment, ForumPost } from '@/types/forum'

export const buildPost = (overrides: Partial<ForumPost> = {}): ForumPost => ({
  id: 'p1',
  kind: 'discussion',
  title: 'Episode 5 thoughts',
  excerpt: 'That ending!',
  body: 'That ending!\n\nWhat did everyone think?',
  score: null,
  subjectId: null,
  spoiler: false,
  createdAt: '2026-10-05T10:00:00Z',
  editedAt: null,
  lastActivityAt: '2026-10-05T10:00:00Z',
  author: { id: 'u2', username: 'kai', profilePicture: null },
  likeCount: 2,
  commentCount: 0,
  liked: false,
  tags: [
    {
      contentId: 's1',
      kind: 'series',
      name: 'Frieren',
      imagePath: null,
      season: 1,
      episode: 5,
    },
  ],
  canEdit: false,
  canDelete: false,
  ...overrides,
})

export const buildComment = (overrides: Partial<ForumComment> = {}): ForumComment => ({
  id: 'c1',
  postId: 'p1',
  parentId: null,
  body: 'Beautiful episode.',
  deleted: false,
  createdAt: '2026-10-05T11:00:00Z',
  editedAt: null,
  author: { id: 'u1', username: 'mika', profilePicture: null },
  likeCount: 1,
  liked: false,
  canEdit: false,
  canDelete: false,
  ...overrides,
})

/** Named routes the forum views link to. */
export const forumRoutes = (component: object) => {
  const stub = { template: '<div />' }
  return [
    { path: '/forum', name: 'forum', component },
    { path: '/forum/post/:id', name: 'forumPost', component },
    { path: '/u/:username', name: 'publicProfile', component: stub },
    { path: '/tv-show/:id', name: 'TVShowDetails', component: stub },
    { path: '/movie/:id', name: 'MovieDetails', component: stub },
    { path: '/character/:id', name: 'CharacterDetails', component: stub },
    { path: '/login', component: stub },
  ]
}
