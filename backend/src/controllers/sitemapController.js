/**
 * HTTP handlers for the sitemaps search engines read (see services/sitemapService.js).
 *
 * Layer: controller. Public and cached for an hour; served at the site root through
 * vercel.json (`/sitemap.xml`, `/sitemaps/*`).
 */

import { buildSitemapFile, buildSitemapIndex } from '../services/sitemapService.js'
import { appUrl } from '../services/emailService.js'
import { sendError } from '../utils/httpError.js'

const sendXml = (res, xml) => {
  res.set('Cache-Control', 'public, max-age=3600')
  res.type('application/xml').send(xml)
}

/** `GET /sitemap.xml` — the index of child sitemaps. */
export const sitemapIndex = async (req, res) => {
  try {
    sendXml(res, await buildSitemapIndex(appUrl()))
  } catch (error) {
    sendError(res, error, 'Error building the sitemap')
  }
}

/** `GET /sitemaps/:file` — one child sitemap; 404 when there is no such file. */
export const sitemapFile = async (req, res) => {
  try {
    const xml = await buildSitemapFile(appUrl(), req.params.file)
    if (!xml) return res.status(404).json({ success: false, message: 'Sitemap not found' })
    sendXml(res, xml)
  } catch (error) {
    sendError(res, error, 'Error building the sitemap')
  }
}

export default { sitemapIndex, sitemapFile }
