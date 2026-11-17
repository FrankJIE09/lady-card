import type { RoomStore, StoredRoom } from '../vendor/server/service';

export interface D1Result {
  success: boolean;
  meta: { changes?: number };
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<D1Result>;
}

export interface RoomDatabase {
  prepare(sql: string): D1Statement;
}

/** D1 compare-and-swap keeps two concurrent draws from consuming the same turn. */
export class D1RoomStore implements RoomStore {
  constructor(private readonly db: RoomDatabase) {}

  async get(code: string): Promise<StoredRoom | null> {
    const row = await this.db.prepare('SELECT payload FROM rooms WHERE code = ?')
      .bind(code).first<{ payload: string }>();
    return row ? JSON.parse(row.payload) as StoredRoom : null;
  }

  async insert(room: StoredRoom): Promise<boolean> {
    // Cleanup is bounded by the expiry index and runs only on new room creation.
    await this.db.prepare('DELETE FROM rooms WHERE code IN (SELECT code FROM rooms WHERE expires_at < ? LIMIT 100)')
      .bind(Date.now()).run();
    const result = await this.db.prepare('INSERT OR IGNORE INTO rooms (code, payload, revision, expires_at) VALUES (?, ?, ?, ?)')
      .bind(room.code, JSON.stringify(room), room.revision, room.expiresAt).run();
    return result.success && result.meta.changes === 1;
  }

  async compareAndSwap(room: StoredRoom, expectedRevision: number): Promise<boolean> {
    const result = await this.db.prepare('UPDATE rooms SET payload = ?, revision = ?, expires_at = ? WHERE code = ? AND revision = ?')
      .bind(JSON.stringify(room), room.revision, room.expiresAt, room.code, expectedRevision).run();
    return result.success && result.meta.changes === 1;
  }

  async remove(code: string): Promise<void> {
    await this.db.prepare('DELETE FROM rooms WHERE code = ?').bind(code).run();
  }
}
