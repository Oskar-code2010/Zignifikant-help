import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

/**
 * File storage abstraction. Keys look like "<organizationId>/<clientId>/<random>.<ext>".
 * The local implementation writes below STORAGE_DIR; an S3 implementation can use the key as object key.
 */
export interface FileStorage {
  put(input: { organizationId: string; clientId: string; extension: string; bytes: Buffer }): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  deleteClient(organizationId: string, clientId: string): Promise<void>;
}

const ID = /^[a-z0-9]{10,40}$/i;
const KEY = /^[a-z0-9]{10,40}\/[a-z0-9]{10,40}\/[a-f0-9]{32}\.(pdf|png|jpg)$/i;

export class InvalidStorageKeyError extends Error {}

export class LocalFileStorage implements FileStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!KEY.test(key)) throw new InvalidStorageKeyError("Invalid storage key");
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) {
      throw new InvalidStorageKeyError("Invalid storage key");
    }
    return full;
  }

  async put({ organizationId, clientId, extension, bytes }: Parameters<FileStorage["put"]>[0]) {
    if (!ID.test(organizationId) || !ID.test(clientId)) throw new InvalidStorageKeyError("Invalid id");
    const key = `${organizationId}/${clientId}/${randomBytes(16).toString("hex")}.${extension}`;
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, bytes, { flag: "wx" });
    return key;
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  async deleteClient(organizationId: string, clientId: string): Promise<void> {
    if (!ID.test(organizationId) || !ID.test(clientId)) throw new InvalidStorageKeyError("Invalid id");
    await fs.rm(path.resolve(this.root, organizationId, clientId), { recursive: true, force: true });
  }
}

export function getStorage(): FileStorage {
  // The storage root is configurable at runtime; exclude it from build-time file tracing.
  return new LocalFileStorage(path.resolve(/*turbopackIgnore: true*/ process.cwd(), env().STORAGE_DIR ?? "./storage/uploads"));
}
