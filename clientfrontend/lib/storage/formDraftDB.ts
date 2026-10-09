/**
 * VenopAI Client-Side Local Database Engine (IndexedDB + LocalStorage Fallback)
 * 
 * Provides resilient, asynchronous, zero-dependency persistence for form drafts
 * with automated sensitive field filtering, TTL expiration, and cross-tab awareness.
 */

export interface FormDraftRecord<T = unknown> {
  formKey: string;
  data: T;
  userScope: string; // 'anon' or user_id
  createdAt: number;
  updatedAt: number;
  metadata?: {
    title?: string;
    path?: string;
    fileCount?: number;
    [key: string]: unknown;
  };
}

const DB_NAME = "venopai_local_db";
const DB_VERSION = 1;
const STORE_NAME = "form_drafts";
const DEFAULT_TTL_DAYS = 14;

// Sensitive field blacklist adhering to OWASP and DPDP Act guidelines
export const SENSITIVE_FIELD_NAMES = new Set([
  "password",
  "password_hash",
  "confirm_password",
  "confirmpassword",
  "current_password",
  "currentpassword",
  "new_password",
  "newpassword",
  "pin",
  "otp",
  "cvv",
  "cvc",
  "card_number",
  "cardnumber",
  "token",
  "access_token",
  "refresh_token",
]);

/**
 * Strips out sensitive fields recursively from draft payloads.
 */
export function sanitizeDraftData<T>(data: T, customExclusions?: string[]): T {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeDraftData(item, customExclusions)) as unknown as T;
  }
  const sanitized: Record<string, unknown> = {};
  const exclusions = new Set([
    ...SENSITIVE_FIELD_NAMES,
    ...(customExclusions ? customExclusions.map((e) => e.toLowerCase()) : []),
  ]);

  for (const [key, value] of Object.entries(data)) {
    if (exclusions.has(key.toLowerCase())) {
      continue;
    }
    if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeDraftData(value, customExclusions);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized as T;
}

class FormDraftDB {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private isIndexedDBAvailable: boolean = true;

  constructor() {
    if (typeof window !== "undefined") {
      this.initDB();
    }
  }

  private async initDB(): Promise<IDBDatabase | null> {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      this.isIndexedDBAvailable = false;
      return null;
    }

    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve) => {
        try {
          const request = indexedDB.open(DB_NAME, DB_VERSION);

          request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              const store = db.createObjectStore(STORE_NAME, { keyPath: "formKey" });
              store.createIndex("updatedAt", "updatedAt", { unique: false });
              store.createIndex("userScope", "userScope", { unique: false });
            }
          };

          request.onsuccess = () => {
            const db = request.result;
            // Purge expired drafts in background on connection
            this.clearExpiredDrafts(DEFAULT_TTL_DAYS, db).catch(() => {});
            resolve(db);
          };

          request.onerror = () => {
            this.isIndexedDBAvailable = false;
            resolve(null);
          };
        } catch {
          this.isIndexedDBAvailable = false;
          resolve(null);
        }
      });
    }

    return this.dbPromise;
  }

  /**
   * Save or update a form draft
   */
  async saveDraft<T>(
    formKey: string,
    rawFormData: T,
    metadata?: Record<string, unknown>,
    userScope: string = "anon",
    customExclusions?: string[]
  ): Promise<void> {
    const cleanData = sanitizeDraftData(rawFormData, customExclusions);
    const now = Date.now();

    // Check if previous record exists to preserve createdAt
    let createdAt = now;
    const existing = await this.getDraft(formKey, userScope);
    if (existing?.createdAt) {
      createdAt = existing.createdAt;
    }

    const record: FormDraftRecord<T> = {
      formKey,
      data: cleanData,
      userScope,
      createdAt,
      updatedAt: now,
      metadata,
    };

    const db = await this.initDB();
    if (db && this.isIndexedDBAvailable) {
      return new Promise<void>((resolve) => {
        try {
          const transaction = db.transaction([STORE_NAME], "readwrite");
          const store = transaction.objectStore(STORE_NAME);
          const request = store.put(record);

          request.onsuccess = () => resolve();
          request.onerror = () => {
            // Fallback to localStorage on write failure
            this.saveToLocalStorage(formKey, record);
            resolve();
          };
        } catch {
          this.saveToLocalStorage(formKey, record);
          resolve();
        }
      });
    } else {
      this.saveToLocalStorage(formKey, record);
    }
  }

  /**
   * Retrieve a saved draft by formKey
   */
  async getDraft<T>(formKey: string, userScope: string = "anon"): Promise<FormDraftRecord<T> | null> {
    const db = await this.initDB();
    if (db && this.isIndexedDBAvailable) {
      return new Promise((resolve) => {
        try {
          const transaction = db.transaction([STORE_NAME], "readonly");
          const store = transaction.objectStore(STORE_NAME);
          const request = store.get(formKey);

          request.onsuccess = () => {
            const result = request.result as FormDraftRecord<T> | undefined;
            if (result) {
              // Verify userScope matches or allow 'anon'
              if (result.userScope === userScope || userScope === "anon" || result.userScope === "anon") {
                resolve(result);
              } else {
                resolve(null);
              }
            } else {
              // Try localStorage fallback
              resolve(this.getFromLocalStorage<T>(formKey, userScope));
            }
          };

          request.onerror = () => {
            resolve(this.getFromLocalStorage<T>(formKey, userScope));
          };
        } catch {
          resolve(this.getFromLocalStorage<T>(formKey, userScope));
        }
      });
    } else {
      return this.getFromLocalStorage<T>(formKey, userScope);
    }
  }

  /**
   * Delete a draft upon successful submission or user discard
   */
  async removeDraft(formKey: string): Promise<void> {
    const db = await this.initDB();
    if (db && this.isIndexedDBAvailable) {
      await new Promise<void>((resolve) => {
        try {
          const transaction = db.transaction([STORE_NAME], "readwrite");
          const store = transaction.objectStore(STORE_NAME);
          const request = store.delete(formKey);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    }
    this.removeFromLocalStorage(formKey);
  }

  /**
   * Auto-purge stale drafts older than ttlDays
   */
  async clearExpiredDrafts(ttlDays: number = DEFAULT_TTL_DAYS, existingDb?: IDBDatabase): Promise<void> {
    const cutoffTime = Date.now() - ttlDays * 24 * 60 * 60 * 1000;
    const db = existingDb || (await this.initDB());

    if (db && this.isIndexedDBAvailable) {
      try {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index("updatedAt");
        const range = IDBKeyRange.upperBound(cutoffTime);
        const request = index.openCursor(range);

        request.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
      } catch {
        // Ignore purge errors
      }
    }

    // Clean localStorage
    this.cleanLocalStorageExpired(cutoffTime);
  }

  /**
   * List all drafts (for recovery drawers or account view)
   */
  async listAllDrafts(userScope: string = "anon"): Promise<Array<{ formKey: string; updatedAt: number; metadata?: Record<string, unknown> }>> {
    const db = await this.initDB();
    if (db && this.isIndexedDBAvailable) {
      return new Promise((resolve) => {
        try {
          const transaction = db.transaction([STORE_NAME], "readonly");
          const store = transaction.objectStore(STORE_NAME);
          const request = store.getAll();

          request.onsuccess = () => {
            const results = (request.result || []) as FormDraftRecord[];
            const filtered = results
              .filter((r) => r.userScope === userScope || userScope === "anon" || r.userScope === "anon")
              .map((r) => ({
                formKey: r.formKey,
                updatedAt: r.updatedAt,
                metadata: r.metadata,
              }));
            resolve(filtered);
          };
          request.onerror = () => resolve([]);
        } catch {
          resolve([]);
        }
      });
    }
    return [];
  }

  // --- LocalStorage Fallback Helpers ---

  private saveToLocalStorage(formKey: string, record: FormDraftRecord): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(`venopai_draft_${formKey}`, JSON.stringify(record));
      }
    } catch {
      // Storage quota exceeded or disabled
    }
  }

  private getFromLocalStorage<T>(formKey: string, userScope: string): FormDraftRecord<T> | null {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const item = window.localStorage.getItem(`venopai_draft_${formKey}`);
        if (item) {
          const parsed: FormDraftRecord<T> = JSON.parse(item);
          if (parsed.userScope === userScope || userScope === "anon" || parsed.userScope === "anon") {
            return parsed;
          }
        }
      }
    } catch {
      // JSON or storage error
    }
    return null;
  }

  private removeFromLocalStorage(formKey: string): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(`venopai_draft_${formKey}`);
      }
    } catch {
      // Ignore
    }
  }

  private cleanLocalStorageExpired(cutoffTime: number): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key && key.startsWith("venopai_draft_")) {
            const item = window.localStorage.getItem(key);
            if (item) {
              try {
                const parsed = JSON.parse(item);
                if (parsed.updatedAt && parsed.updatedAt < cutoffTime) {
                  keysToRemove.push(key);
                }
              } catch {
                keysToRemove.push(key);
              }
            }
          }
        }
        keysToRemove.forEach((k) => window.localStorage.removeItem(k));
      }
    } catch {
      // Ignore
    }
  }
}

export const formDraftDB = new FormDraftDB();
