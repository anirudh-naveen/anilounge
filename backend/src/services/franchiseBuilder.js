/**
 * Build franchises from catalog data instead of the hand-kept franchise map.
 *
 * Titles land in one group when MAL links them with a typed relation (sequel,
 * prequel, side story, ...) or when they share most of their main cast (TMDB-only
 * titles such as Avatar have no relations at all). Untyped 'other' relations are
 * ignored because MAL uses them for crossovers, and 'alternative_setting' because
 * it links different stories in a shared universe (Steins;Gate, Robotics;Notes). Each group then joins the one
 * franchise its members already belong to, or gets a new franchise; groups that
 * span two existing franchises are left for an admin.
 */
import crypto from 'crypto'
import { query, withTransaction } from '../../config/postgres.js'
import { canonicalCharacterNameKey } from '../utils/entities.js'

/** Share of each title's main cast two titles must have in common. */
export const MAIN_CAST_OVERLAP = 0.5

/** Two-lead shows can share one common name ("Yuuri", "Senpai") by chance. */
export const MIN_SHARED_CAST = 2

/** Cast compared for titles whose source marks no main roles. */
const TOP_BILLED_CAST = 8

/**
 * Relation kinds that never put two titles in one franchise: MAL uses 'other' for
 * crossovers, and 'alternative_setting' for another story in a shared universe.
 */
export const UNLINKED_RELATION_KINDS = ['other', 'alternative_setting']

/**
 * Group works and decide what each group needs.
 * @param {{
 *   works: Array<{ id: string, name: string, kind: string, malId?: number|null, tmdbId?: number|null,
 *     year?: number|null, franchiseId?: string|null }>,
 *   relations: Array<{ fromId: string, toId: string }>,
 *   sharedUniverse?: Array<{ fromId: string, toId: string }>,
 *   mainCast: Array<{ workId: string, characterId: string }>,
 *   franchises: Array<{ id: string, name: string }>,
 * }} input
 * @returns {{
 *   create: Array<{ name: string, memberIds: string[], titles: string[] }>,
 *   join: Array<{ franchiseId: string, name: string, memberIds: string[], titles: string[] }>,
 *   conflicts: Array<{ franchises: string[], titles: string[] }>,
 *   sharedUniverse: Array<[string, string]>,
 * }}
 */
export function planFranchises({ works, relations, sharedUniverse = [], mainCast, franchises }) {
  const byId = new Map(works.map((work) => [work.id, work]))
  const parent = new Map(works.map((work) => [work.id, work.id]))
  const find = (id) => {
    while (parent.get(id) !== id) {
      parent.set(id, parent.get(parent.get(id)))
      id = parent.get(id)
    }
    return id
  }
  const union = (a, b) => {
    if (!byId.has(a) || !byId.has(b)) return
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  for (const { fromId, toId } of relations) union(fromId, toId)

  const castByWork = new Map()
  const worksByCharacter = new Map()
  for (const { workId, characterId } of mainCast) {
    if (!byId.has(workId)) continue
    if (!castByWork.has(workId)) castByWork.set(workId, new Set())
    castByWork.get(workId).add(characterId)
    if (!worksByCharacter.has(characterId)) worksByCharacter.set(characterId, new Set())
    worksByCharacter.get(characterId).add(workId)
  }
  const shared = new Map()
  for (const workIds of worksByCharacter.values()) {
    const list = [...workIds].sort()
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const key = `${list[i]}|${list[j]}`
        shared.set(key, (shared.get(key) || 0) + 1)
      }
    }
  }
  for (const [key, count] of shared) {
    const [a, b] = key.split('|')
    // Both sides must share most of their main cast, so a crossover that borrows
    // a few leads from several shows does not chain those shows together.
    if (
      count >= MIN_SHARED_CAST &&
      count / castByWork.get(a).size >= MAIN_CAST_OVERLAP &&
      count / castByWork.get(b).size >= MAIN_CAST_OVERLAP
    ) {
      union(a, b)
    }
  }

  const groups = new Map()
  for (const work of works) {
    const root = find(work.id)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(work)
  }

  const franchiseName = new Map(franchises.map((row) => [row.id, row.name]))
  const plan = { create: [], join: [], conflicts: [], sharedUniverse: [] }
  const groupLabel = new Map()
  for (const [root, members] of groups) {
    if (members.length < 2) continue
    const existing = [...new Set(members.map((work) => work.franchiseId).filter(Boolean))]
    const loose = members.filter((work) => !work.franchiseId)
    const titles = (list) => list.map((work) => work.name).sort()
    if (existing.length > 1) {
      plan.conflicts.push({
        franchises: existing.map((id) => franchiseName.get(id) || id).sort(),
        titles: titles(members),
      })
      groupLabel.set(root, existing.map((id) => franchiseName.get(id) || id).sort().join(' + '))
    } else if (existing.length === 1) {
      if (loose.length) {
        plan.join.push({
          franchiseId: existing[0],
          name: franchiseName.get(existing[0]) || existing[0],
          memberIds: loose.map((work) => work.id),
          titles: titles(loose),
        })
      }
      groupLabel.set(root, franchiseName.get(existing[0]) || existing[0])
    } else {
      const name = groupName(members)
      plan.create.push({ name, memberIds: members.map((work) => work.id), titles: titles(members) })
      groupLabel.set(root, name)
    }
  }

  // Noted, never merged: two franchises (or a franchise and a lone title) whose
  // stories share a world.
  const seenPairs = new Set()
  for (const { fromId, toId } of sharedUniverse) {
    if (!byId.has(fromId) || !byId.has(toId)) continue
    const a = find(fromId)
    const b = find(toId)
    if (a === b) continue
    const pair = [groupLabel.get(a) || byId.get(fromId).name, groupLabel.get(b) || byId.get(toId).name].sort()
    const key = pair.join('|')
    if (seenPairs.has(key)) continue
    seenPairs.add(key)
    plan.sharedUniverse.push(pair)
  }
  plan.sharedUniverse.sort((x, y) => x[0].localeCompare(y[0]))
  plan.create.sort((a, b) => a.name.localeCompare(b.name))
  return plan
}

/**
 * Franchise name for a new group: the first series (the original show), else the
 * first title, without a season marker. Admins can rename it afterwards.
 * @param {object[]} members
 * @returns {string}
 */
function groupName(members) {
  const byAge = [...members].sort(
    (a, b) =>
      (a.year ?? Infinity) - (b.year ?? Infinity) || a.name.length - b.name.length,
  )
  return seasonlessName((byAge.find((work) => work.kind === 'series') || byAge[0]).name)
}

/**
 * Drop a trailing season or part marker, for groups whose first season is not
 * in the catalog ("Dandadan 2nd Season", "Major S1").
 * @param {string} name
 * @returns {string}
 */
export function seasonlessName(name) {
  const base = name
    .replace(/[\s:-]*(\d+(st|nd|rd|th) Season|Season \d+|S\d+|Part \d+)(\s+Part \d+)?$/i, '')
    .trim()
  return base || name
}

/**
 * Load the catalog and plan franchises.
 * @returns {Promise<ReturnType<typeof planFranchises>>}
 */
export async function loadFranchisePlan() {
  const [works, relations, sharedUniverse, mainCast, franchises] = await Promise.all([
    query(
      `SELECT w.id::text, w.title AS name, w.kind, w.mal_id, w.tmdb_id,
              COALESCE(w.start_year, extract(year FROM w.release_date)::int) AS year,
              fm.franchise_id::text AS franchise_id
       FROM works w
       LEFT JOIN franchise_members fm ON fm.member_id = w.id`,
    ),
    query(
      `SELECT from_id::text AS from_id, to_id::text AS to_id
       FROM content_relations WHERE kind <> ALL($1::text[])`,
      [UNLINKED_RELATION_KINDS],
    ),
    query(
      `SELECT from_id::text AS from_id, to_id::text AS to_id
       FROM content_relations WHERE kind = 'alternative_setting'`,
    ),
    // TMDB credits mark the whole cast 'supporting'; use the top billing there.
    query(
      `SELECT ranked.work_id::text AS work_id, c.name AS character_name
       FROM (
         SELECT a.*,
                bool_or(a.role = 'main') OVER (PARTITION BY a.work_id) AS has_main,
                row_number() OVER (PARTITION BY a.work_id ORDER BY a.importance DESC, a.id) AS billing
         FROM appearances a
       ) ranked
       JOIN content c ON c.id = ranked.character_id
       WHERE role = 'main' OR (NOT has_main AND billing <= $1)`,
      [TOP_BILLED_CAST],
    ),
    query(`SELECT id::text, name FROM content WHERE kind = 'franchise'`),
  ])
  return planFranchises({
    works: works.rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      malId: row.mal_id,
      tmdbId: row.tmdb_id,
      year: row.year,
      franchiseId: row.franchise_id,
    })),
    relations: relations.rows.map((row) => ({ fromId: row.from_id, toId: row.to_id })),
    sharedUniverse: sharedUniverse.rows.map((row) => ({ fromId: row.from_id, toId: row.to_id })),
    // By name: titles outside any franchise each have their own row for a
    // character until the franchise merge folds them together.
    mainCast: mainCast.rows
      .map((row) => ({ workId: row.work_id, characterId: canonicalCharacterNameKey(row.character_name) }))
      .filter((row) => row.characterId),
    franchises: franchises.rows,
  })
}

/**
 * Write a plan: create new franchises and add loose titles, in one transaction.
 * A new group whose name an existing franchise already has joins that franchise.
 * @param {ReturnType<typeof planFranchises>} plan
 * @returns {Promise<{ created: number, added: number, changedWorkIds: string[] }>}
 *   `changedWorkIds`: one title per franchise that gained titles, for follow-up work.
 */
export async function applyFranchisePlan(plan) {
  return withTransaction(async () => {
    let created = 0
    let added = 0
    const changedWorkIds = []
    const addMembers = async (franchiseId, memberIds) => {
      const { rowCount } = await query(
        `INSERT INTO franchise_members (franchise_id, member_id)
         SELECT $1, id FROM unnest($2::uuid[]) AS id
         ON CONFLICT DO NOTHING`,
        [franchiseId, memberIds],
      )
      added += rowCount || 0
      if (rowCount) changedWorkIds.push(memberIds[0])
    }
    for (const group of plan.join) await addMembers(group.franchiseId, group.memberIds)
    for (const group of plan.create) {
      const { rows } = await query(
        `SELECT id::text FROM content WHERE kind = 'franchise' AND name = $1`,
        [group.name],
      )
      let franchiseId = rows[0]?.id
      if (!franchiseId) {
        franchiseId = crypto.randomUUID()
        await query(`INSERT INTO content (id, kind, name) VALUES ($1, 'franchise', $2)`, [
          franchiseId,
          group.name,
        ])
        await query('INSERT INTO franchises (content_id) VALUES ($1)', [franchiseId])
        created += 1
      }
      await addMembers(franchiseId, group.memberIds)
    }
    return { created, added, changedWorkIds }
  })
}
