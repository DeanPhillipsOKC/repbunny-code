// Issue #415, #940: the query shim for the app's local-mode database, in plain
// JS so both the e2e fixtures (e2e/fixtures/local.ts, which adds the types and
// documents what it maps) and the plain Node capture scripts
// (scripts/lib/sample-account.mjs) use the same one.
//
// `localDb(page)` reads and writes the database of an app page opened on the
// dev server or an e2e hooks build (#960), with a small query builder
// (`db.from('exercises').insert({ name }).select('id').single()`). Each query
// runs in the page against the app's own connection (`window.__rbLocalDb`,
// src/testHooks.ts), with the adapter's own column encoding
// (src/data/sqlite/repos.ts).

class LocalQuery {
  constructor(page, spec) {
    this.page = page
    this.spec = spec
  }
  select(columns = '*', options) {
    if (this.spec.action === 'select')
      this.spec.columns = columns
    else {
      this.spec.returning = true
      this.spec.columns = columns
    }
    if (options?.count)
      this.spec.count = true
    if (options?.head)
      this.spec.head = true
    return this
  }
  filter(op, column, value) {
    this.spec.filters.push({ op, column, value })
    return this
  }
  eq(column, value) {
    return this.filter('eq', column, value)
  }
  neq(column, value) {
    return this.filter('neq', column, value)
  }
  in(column, values) {
    return this.filter('in', column, values)
  }
  is(column, value) {
    return this.filter('is', column, value)
  }
  gt(column, value) {
    return this.filter('gt', column, value)
  }
  gte(column, value) {
    return this.filter('gte', column, value)
  }
  lt(column, value) {
    return this.filter('lt', column, value)
  }
  lte(column, value) {
    return this.filter('lte', column, value)
  }
  like(column, value) {
    return this.filter('like', column, value)
  }
  ilike(column, value) {
    return this.filter('ilike', column, value)
  }
  match(values) {
    for (const [column, value] of Object.entries(values))
      this.filter('eq', column, value)
    return this
  }
  order(column, options) {
    this.spec.order.push({ column, ascending: options?.ascending ?? true })
    return this
  }
  limit(count) {
    this.spec.limit = count
    return this
  }
  single() {
    this.spec.single = 'single'
    return this
  }
  maybeSingle() {
    this.spec.single = 'maybe'
    return this
  }
  then(onfulfilled, onrejected) {
    return this.page.evaluate(runQuery, this.spec).then(onfulfilled, onrejected)
  }
}
class LocalTable {
  constructor(page, table) {
    this.page = page
    this.table = table
  }
  query(action, values) {
    return new LocalQuery(this.page, { table: this.table, action, values, returning: false, filters: [], order: [] })
  }
  select(columns = '*', options) {
    return this.query('select').select(columns, options)
  }
  insert(values) {
    return this.query('insert', values)
  }
  upsert(values) {
    return this.query('upsert', values)
  }
  update(values) {
    return this.query('update', values)
  }
  delete() {
    return this.query('delete')
  }
}
export function localDb(page) {
  return { from: (table) => new LocalTable(page, table) }
}
// Runs in the page (serialized by page.evaluate), so it imports what it needs.
async function runQuery(spec) {
  const { TABLES, encode, decode } = await window.__rbImport('/src/data/sqlite/repos.ts')
  const db = await window.__rbLocalDb()
  const table = spec.table === 'profiles' ? 'settings' : spec.table
  const known = table in TABLES
  const columnsOf = (t) => (t in TABLES ? TABLES[t].columns : [])
  const enc = (column, value) => {
    if (known)
      return encode(table, column, value)
    if (value === undefined)
      return null
    return value !== null && typeof value === 'object' ? JSON.stringify(value) : value
  }
  const dec = (t, row) => (t in TABLES ? decode(t, row) : row)
  const fail = (message) => ({ data: null, error: { message }, count: null })
  const errorOf = (e) => {
    const message = e instanceof Error ? e.message : String(e)
    const codes = [
      [/UNIQUE constraint failed/i, '23505'],
      [/FOREIGN KEY constraint failed/i, '23503'],
      [/CHECK constraint failed/i, '23514'],
      [/NOT NULL constraint failed/i, '23502'],
    ]
    const code = codes.find(([pattern]) => pattern.test(message))?.[1]
    return { message, ...(code ? { code } : {}) }
  }
  // Splits a select list at top-level commas: `id, exercises(name, load_type)`.
  function parseColumns(list) {
    const parts = []
    let depth = 0
    let current = ''
    for (const ch of list) {
      if (ch === '(')
        depth++
      if (ch === ')')
        depth--
      if (ch === ',' && depth === 0) {
        parts.push(current.trim())
        current = ''
      }
      else
        current += ch
    }
    if (current.trim())
      parts.push(current.trim())
    return parts.map((part) => {
      const embed = /^([a-z_]+)(?:!inner)?\((.*)\)$/s.exec(part)
      return embed ? { name: embed[1], inner: embed[2] } : { name: part, inner: null }
    })
  }
  const FOREIGN_KEYS = {
    exercises: 'exercise_id',
    workouts: 'workout_id',
    workout_templates: 'template_id',
  }
  async function shape(t, raw, list) {
    const row = dec(t, raw)
    if (t === 'settings')
      row.id = 'local'
    if (columnsOf(t).length > 0 || t === 'settings')
      row.user_id = 'local'
    if (list.trim() === '*')
      return row
    const out = {}
    for (const { name, inner } of parseColumns(list)) {
      if (name === '*')
        Object.assign(out, row)
      else if (inner === null)
        out[name] = row[name] ?? null
      else {
        const key = FOREIGN_KEYS[name]
        if (!key || !(key in raw))
          throw new Error(`local db shim: can't embed ${name} in ${t}`)
        const [target] = raw[key] == null ? [] : await db.query(`SELECT * FROM ${name} WHERE id = ?`, [raw[key]])
        out[name] = target ? await shape(name, target, inner) : null
      }
    }
    return out
  }
  function where() {
    const clauses = []
    const params = []
    for (const { op, column, value } of spec.filters) {
      if (column === 'user_id' || column.endsWith('.user_id') || (table === 'settings' && column === 'id'))
        continue
      if (column.includes('.'))
        throw new Error(`local db shim: filter on embedded ${column}`)
      if (op === 'in') {
        const values = value
        if (values.length === 0)
          clauses.push('0')
        else {
          clauses.push(`${column} IN (${values.map(() => '?').join(', ')})`)
          params.push(...values.map((v) => enc(column, v)))
        }
      }
      else if (op === 'is') {
        clauses.push(value === null ? `${column} IS NULL` : `${column} = ?`)
        if (value !== null)
          params.push(value ? 1 : 0)
      }
      else {
        const sqlOp = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', ilike: 'LIKE' }[op]
        clauses.push(`${column} ${sqlOp} ?`)
        params.push(enc(column, value))
      }
    }
    return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params }
  }
  async function selectRows(extra) {
    const w = extra ?? where()
    let sql = `SELECT * FROM ${table}${w.sql}`
    if (spec.order.length)
      sql += ` ORDER BY ${spec.order.map((o) => `${o.column} ${o.ascending ? 'ASC' : 'DESC'}`).join(', ')}`
    if (spec.limit !== undefined)
      sql += ` LIMIT ${Number(spec.limit)}`
    return db.query(sql, w.params)
  }
  async function finish(rows) {
    const shaped = []
    for (const row of rows)
      shaped.push(await shape(table, row, spec.columns ?? '*'))
    if (spec.single === 'single' && shaped.length !== 1)
      return fail(`Expected one ${spec.table} row, got ${shaped.length}`)
    if (spec.single === 'maybe' && shaped.length > 1)
      return fail(`Expected at most one ${spec.table} row, got ${shaped.length}`)
    const data = spec.single ? (shaped[0] ?? null) : shaped
    return { data, error: null, count: spec.count ? shaped.length : null }
  }
  try {
    if (spec.action === 'select') {
      if (spec.head) {
        const w = where()
        const [row] = await db.query(`SELECT COUNT(*) AS n FROM ${table}${w.sql}`, w.params)
        return { data: null, error: null, count: Number(row.n) }
      }
      return await finish(await selectRows())
    }
    if (spec.action === 'delete') {
      const w = where()
      const before = spec.returning ? await selectRows(w) : []
      await db.run(`DELETE FROM ${table}${w.sql}`, w.params)
      return spec.returning ? await finish(before) : { data: null, error: null, count: null }
    }
    const writable = (values) => {
      const out = {}
      for (const [column, value] of Object.entries(values)) {
        if (value === undefined || column === 'user_id' || column === 'created_at')
          continue
        if (table === 'settings' && column === 'id')
          continue
        if (known && !columnsOf(table).includes(column))
          throw new Error(`Column "${column}" doesn't exist on ${spec.table}`)
        out[column] = value
      }
      return out
    }
    if (spec.action === 'update' || (spec.action === 'upsert' && table === 'settings')) {
      const patch = writable((Array.isArray(spec.values) ? spec.values[0] : spec.values) ?? {})
      const columns = Object.keys(patch)
      const w = where()
      if (columns.length > 0) {
        await db.run(`UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(', ')}${w.sql}`, [
          ...columns.map((c) => enc(c, patch[c])),
          ...w.params,
        ])
      }
      return spec.returning ? await finish(await selectRows(w)) : { data: null, error: null, count: null }
    }
    // insert, or upsert by id
    const rows = Array.isArray(spec.values) ? spec.values : [spec.values ?? {}]
    const ids = []
    const now = new Date().toISOString()
    const DEFAULT_NOW = {
      workouts: 'performed_at',
      body_weight_entries: 'recorded_at',
      body_measurements: 'recorded_at',
      client_errors: 'occurred_at',
    }
    for (const input of rows) {
      const values = writable(input)
      values.id ??= crypto.randomUUID()
      const nowColumn = DEFAULT_NOW[table]
      if (nowColumn)
        values[nowColumn] ??= now
      if (table === 'sets') {
        const [next] = await db.query('SELECT COALESCE(MAX(set_index), -1) + 1 AS n FROM sets WHERE workout_id = ?', [values.workout_id])
        values.set_index = Number(next.n)
      }
      const columns = Object.keys(values)
      const verb = spec.action === 'upsert' ? 'INSERT OR REPLACE' : 'INSERT'
      await db.run(`${verb} INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, columns.map((c) => enc(c, values[c])))
      ids.push(values.id)
    }
    if (!spec.returning)
      return { data: null, error: null, count: null }
    const inserted = []
    for (const id of ids)
      inserted.push(...(await db.query(`SELECT * FROM ${table} WHERE id = ?`, [id])))
    return await finish(inserted)
  }
  catch (e) {
    return { data: null, error: errorOf(e), count: null }
  }
}
