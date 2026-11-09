import initSqlJs from 'sql.js'
import { serialize, type SqlDb, type SqlDriver } from '../../src/data/sqlite/db'
import { essentialReads } from '../../src/data/sqlite/essentialReads'
import { migrate } from '../../src/data/sqlite/schema'

// Issue #75: an in-memory SQLite database for the SQLite adapter's specs,
// run in Playwright's Node process. sql.js is the engine jeep-sqlite (the
// Capacitor plugin's web backend) runs on.

let sqlJs: ReturnType<typeof initSqlJs> | null = null

export async function openSqlJsDb(options: { migrated?: boolean } = {}): Promise<SqlDb> {
  const SQL = await (sqlJs ??= initSqlJs())
  const raw = new SQL.Database()
  raw.run('PRAGMA foreign_keys = ON')

  const driver: SqlDriver = {
    async query(sql, params = []) {
      const statement = raw.prepare(sql)
      try {
        statement.bind(params)
        const rows = []
        while (statement.step()) rows.push(statement.getAsObject())
        return rows as never[]
      } finally {
        statement.free()
      }
    },
    async run(sql, params = []) {
      raw.run(sql, params)
      return raw.getRowsModified()
    },
    async begin() {
      raw.run('BEGIN')
    },
    async commit() {
      raw.run('COMMIT')
    },
    async rollback() {
      raw.run('ROLLBACK')
    },
  }

  const db = serialize(driver)
  if (options.migrated !== false) await migrate(db, { essentialReads })
  return db
}
