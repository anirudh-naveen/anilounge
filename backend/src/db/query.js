/**
 * Thenable query object with the mongoose chain methods this codebase uses.
 */

export class DocQuery {
  /**
   * @param {(query: DocQuery) => Promise<unknown>} executor
   */
  constructor(executor) {
    this.executor = executor
    this._sort = null
    this._skip = 0
    this._limit = null
    this._lean = false
    this._populate = []
    this._select = null
  }

  session() {
    return this
  }

  select(fields) {
    this._select = fields
    return this
  }

  populate(spec) {
    this._populate.push(spec)
    return this
  }

  lean() {
    this._lean = true
    return this
  }

  sort(spec) {
    this._sort = spec
    return this
  }

  skip(count) {
    this._skip = Number(count) || 0
    return this
  }

  limit(count) {
    this._limit = count == null ? null : Number(count)
    return this
  }

  exec() {
    return this.executor(this)
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject)
  }

  catch(reject) {
    return this.exec().catch(reject)
  }
}
