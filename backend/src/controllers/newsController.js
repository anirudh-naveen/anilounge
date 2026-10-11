/**
 * HTTP handlers for site news: the admin News tab (post, list, delete, upload
 * pictures) and the public picture route.
 *
 * Layer: controller. Logic lives in services/newsService.js.
 */

import * as newsService from '../services/newsService.js'
import { sendError } from '../utils/httpError.js'

/**
 * `GET /admin/news` — news still showing in inboxes.
 * @param {import('express').Request} req
 * @param {import('express').Response} res - 200 `{ data: news[] }` or 500.
 * @returns {Promise<void>}
 */
export const listNews = async (req, res) => {
  try {
    res.json({ success: true, data: await newsService.listRecentNews() })
  } catch (error) {
    sendError(res, error, 'Error loading news')
  }
}

/**
 * `POST /admin/news` — post news to every inbox as Lounge Keeper.
 * @param {import('express').Request} req - `body.title`, `body.body`.
 * @param {import('express').Response} res - 201 `{ data: news }`, 400, or 500.
 * @returns {Promise<void>}
 */
export const postNews = async (req, res) => {
  try {
    const news = await newsService.postNews(req.user, req.body || {})
    res.status(201).json({ success: true, message: 'News posted.', data: news })
  } catch (error) {
    sendError(res, error, 'Error posting news')
  }
}

/**
 * `DELETE /admin/news/:id` — take news out of every inbox.
 * @param {import('express').Request} req - `params.id`.
 * @param {import('express').Response} res - 200, 404, or 500.
 * @returns {Promise<void>}
 */
export const deleteNews = async (req, res) => {
  try {
    await newsService.deleteNews(req.user, req.params.id)
    res.json({ success: true, message: 'News deleted.' })
  } catch (error) {
    sendError(res, error, 'Error deleting news')
  }
}

/**
 * `POST /admin/news-images` — upload a picture (multipart field `image`).
 * @param {import('express').Request} req - `file.buffer`.
 * @param {import('express').Response} res - 201 `{ data: { id, url } }`, 400, or 500.
 * @returns {Promise<void>}
 */
export const uploadNewsImage = async (req, res) => {
  try {
    const image = await newsService.saveNewsImage(req.user, req.file?.buffer)
    res.status(201).json({ success: true, data: image })
  } catch (error) {
    sendError(res, error, 'Error uploading picture')
  }
}

/**
 * `GET /news-images/:id` — a news picture (public, cached for good: ids never change).
 * @param {import('express').Request} req - `params.id`.
 * @param {import('express').Response} res - The image, 404, or 500.
 * @returns {Promise<void>}
 */
export const getNewsImage = async (req, res) => {
  try {
    const image = await newsService.getNewsImage(req.params.id)
    if (!image) return res.status(404).json({ success: false, message: 'Picture not found.' })
    res.set({
      'Content-Type': image.contentType,
      'Content-Length': String(image.data.length),
      'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
      'CDN-Cache-Control': 'public, max-age=31536000, immutable',
      'Last-Modified': new Date(image.createdAt).toUTCString(),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'cross-origin',
    })
    res.send(image.data)
  } catch (error) {
    sendError(res, error, 'Error loading picture')
  }
}

export default { listNews, postNews, deleteNews, uploadNewsImage, getNewsImage }
