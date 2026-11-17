import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RoomStore, StoredRoom } from "./service.ts";

export class MemoryRoomStore implements RoomStore {
  protected rooms = new Map<string, StoredRoom>();
  async get(code: string): Promise<StoredRoom | null> {
    const room = this.rooms.get(code);
    return room ? structuredClone(room) : null;
  }
  async insert(room: StoredRoom): Promise<boolean> {
    if (this.rooms.has(room.code)) return false;
    this.rooms.set(room.code, structuredClone(room));
    return true;
  }
  async compareAndSwap(
    room: StoredRoom,
    expectedRevision: number,
  ): Promise<boolean> {
    if (this.rooms.get(room.code)?.revision !== expectedRevision) return false;
    this.rooms.set(room.code, structuredClone(room));
    return true;
  }
  async remove(code: string): Promise<void> {
    this.rooms.delete(code);
  }
}

/** One Node server owns this store. Rename commits each snapshot atomically. */
export class FileRoomStore extends MemoryRoomStore {
  private ready: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();
  constructor(private file: string) {
    super();
    this.ready = this.restore();
  }
  private async restore() {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    try {
      const content = JSON.parse(await readFile(this.file, "utf8"));
      if (!Array.isArray(content))
        throw new Error("Room store is not an array");
      for (const room of content) {
        if (
          room &&
          /^\d{6}$/.test(room.code) &&
          typeof room.expiresAt === "number" &&
          room.expiresAt > Date.now()
        )
          this.rooms.set(room.code, room);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  private persist() {
    const snapshot = JSON.stringify(
      [...this.rooms.values()].filter((room) => room.expiresAt > Date.now()),
    );
    const write = this.writeQueue.then(async () => {
      const temporary = `${this.file}.tmp`;
      await writeFile(temporary, snapshot, { mode: 0o600 });
      await rename(temporary, this.file);
    });
    // Keep a failed disk write observable to its request, while allowing later retries.
    this.writeQueue = write.catch(() => {});
    return write;
  }
  override async get(code: string) {
    await this.ready;
    return super.get(code);
  }
  override async insert(room: StoredRoom) {
    await this.ready;
    const result = await super.insert(room);
    if (result) await this.persist();
    return result;
  }
  override async compareAndSwap(room: StoredRoom, expectedRevision: number) {
    await this.ready;
    const result = await super.compareAndSwap(room, expectedRevision);
    if (result) await this.persist();
    return result;
  }
  override async remove(code: string) {
    await this.ready;
    await super.remove(code);
    await this.persist();
  }
}
