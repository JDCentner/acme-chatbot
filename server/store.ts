import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {COMMUNITY_FACTS} from './facts.ts';
import {GREETING, PROMPT_VERSION, type RequestDetails, type TranscriptMessage} from './contracts.ts';
import {seedSlots} from './time.ts';

export interface Turn {
  id: string; conversation_id: string; request_id: string; input: string;
  decision: string | null; reply: string | null; audit: string; created_at: string;
}
export interface Pending {
  id: string; conversation_id: string; details: string; summary: string; presented: number;
  status: string; created_at: string;
}
export interface SavedRequest {
  id: string; conversation_id: string; pending_id: string; kind: string;
  details: string; slot: string | null; created_at: string;
}

export class Store {
  readonly database: DatabaseSync;
  constructor(path: string, readonly clock: () => Date = () => new Date()) {
    if (path !== ':memory:') mkdirSync(dirname(path), {recursive: true});
    this.database = new DatabaseSync(path);
    this.database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS facts (id INTEGER PRIMARY KEY CHECK(id=1), content TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, greeting TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS turns (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), request_id TEXT NOT NULL,
        input TEXT NOT NULL, decision TEXT, reply TEXT, audit TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(conversation_id, request_id)
      );
      CREATE TABLE IF NOT EXISTS slots (slot TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS pending_requests (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), details TEXT NOT NULL,
        summary TEXT NOT NULL, presented INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id), pending_id TEXT NOT NULL UNIQUE REFERENCES pending_requests(id),
        kind TEXT NOT NULL, details TEXT NOT NULL, slot TEXT UNIQUE, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS checked_slots (
        conversation_id TEXT NOT NULL REFERENCES conversations(id), slot TEXT NOT NULL, PRIMARY KEY(conversation_id, slot)
      );
      CREATE TABLE IF NOT EXISTS evaluation_cases (id TEXT PRIMARY KEY, content TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS evaluation_runs (id TEXT PRIMARY KEY, content TEXT NOT NULL, created_at TEXT NOT NULL);
    `);
    this.database.prepare('INSERT OR IGNORE INTO facts VALUES (1, ?)').run(JSON.stringify(COMMUNITY_FACTS));
    this.refreshSlots();
    // An interrupted turn must not execute a completed action again after a restart.
    this.database.prepare("UPDATE turns SET reply = ?, audit = json_set(audit, '$.error', ?) WHERE reply IS NULL")
      .run('This reply was interrupted. Check saved requests in the admin panel before you retry.', 'Server restarted during this turn.');
  }

  refreshSlots(): void {
    const insert = this.database.prepare('INSERT OR IGNORE INTO slots VALUES (?)');
    for (const slot of seedSlots(this.clock)) insert.run(slot);
  }

  facts(): Record<string, unknown> {
    const row = this.database.prepare('SELECT content FROM facts WHERE id=1').get() as {content: string};
    return JSON.parse(row.content);
  }

  createConversation(): {id: string; greeting: string} {
    const id = randomUUID();
    this.database.prepare('INSERT INTO conversations VALUES (?, ?, ?)').run(id, this.clock().toISOString(), GREETING);
    return {id, greeting: GREETING};
  }

  hasConversation(id: string): boolean {
    return Boolean(this.database.prepare('SELECT id FROM conversations WHERE id=?').get(id));
  }

  turns(id: string): Turn[] {
    return this.database.prepare('SELECT * FROM turns WHERE conversation_id=? ORDER BY rowid').all(id) as unknown as Turn[];
  }

  context(id: string): TranscriptMessage[] {
    const messages: TranscriptMessage[] = [{role: 'assistant', content: GREETING}];
    for (const turn of this.turns(id).filter(turn => turn.decision === 'allow')) {
      messages.push({role: 'user', content: turn.input});
      if (turn.reply) messages.push({role: 'assistant', content: turn.reply});
    }
    return messages;
  }

  findTurn(conversationId: string, requestId: string): Turn | undefined {
    return this.database.prepare('SELECT * FROM turns WHERE conversation_id=? AND request_id=?').get(conversationId, requestId) as Turn | undefined;
  }

  startTurn(input: {conversationId: string; requestId: string; message: string}): string {
    const id = randomUUID();
    this.database.prepare('INSERT INTO turns VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)')
      .run(id, input.conversationId, input.requestId, input.message, '{}', this.clock().toISOString());
    return id;
  }

  finishTurn(input: {id: string; decision: string | null; reply: string; audit: unknown}): void {
    this.database.prepare('UPDATE turns SET decision=?, reply=?, audit=? WHERE id=?')
      .run(input.decision, input.reply, JSON.stringify(input.audit), input.id);
  }

  checkpoint(id: string, audit: unknown): void {
    this.database.prepare('UPDATE turns SET audit=? WHERE id=?').run(JSON.stringify(audit), id);
  }

  pending(conversationId: string): Pending | undefined {
    return this.database.prepare("SELECT * FROM pending_requests WHERE conversation_id=? AND status='pending' ORDER BY rowid DESC LIMIT 1").get(conversationId) as Pending | undefined;
  }

  invalidatePending(conversationId: string): void {
    this.database.prepare("UPDATE pending_requests SET status='superseded' WHERE conversation_id=? AND status='pending'").run(conversationId);
  }

  prepareRequest(conversationId: string, details: RequestDetails): Pending {
    this.invalidatePending(conversationId);
    const id = randomUUID();
    const extra = details.kind === 'tour' ? `Tour: ${details.slot} (America/New_York)` : details.preferredTime || details.address;
    const summary = `Please confirm this ${details.kind} request.\nName: ${details.firstName} ${details.lastName}\nEmail: ${details.email}\nPhone: ${details.phone}\n${extra}\nThis saves a local demo record only. No staff are contacted and no material is sent.`;
    this.database.prepare('INSERT INTO pending_requests VALUES (?, ?, ?, ?, 0, ?, ?)')
      .run(id, conversationId, JSON.stringify(details), summary, 'pending', this.clock().toISOString());
    return this.pending(conversationId)!;
  }

  presentPending(id: string): void {
    this.database.prepare("UPDATE pending_requests SET presented=1 WHERE id=? AND status='pending'").run(id);
  }

  requests(): SavedRequest[] {
    return this.database.prepare('SELECT * FROM requests ORDER BY rowid DESC').all() as unknown as SavedRequest[];
  }

  conversations(): unknown[] {
    return this.database.prepare('SELECT c.*, COUNT(t.id) AS turn_count FROM conversations c LEFT JOIN turns t ON t.conversation_id=c.id GROUP BY c.id ORDER BY c.rowid DESC').all();
  }

  cases(): unknown[] {
    return this.database.prepare('SELECT content FROM evaluation_cases ORDER BY rowid').all().map(row => JSON.parse(String(row.content)));
  }

  saveCase(id: string, content: unknown): void {
    this.database.prepare('INSERT INTO evaluation_cases VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET content=excluded.content').run(id, JSON.stringify(content));
  }

  seedCase(id: string, content: unknown): void {
    this.database.prepare('INSERT OR IGNORE INTO evaluation_cases VALUES (?, ?)').run(id, JSON.stringify(content));
  }

  saveRun(content: Record<string, unknown>): Record<string, unknown> {
    const run = {...content, id: randomUUID(), createdAt: this.clock().toISOString()};
    this.database.prepare('INSERT INTO evaluation_runs VALUES (?, ?, ?)').run(run.id, JSON.stringify(run), run.createdAt);
    return run;
  }

  runs(): unknown[] {
    return this.database.prepare('SELECT content FROM evaluation_runs ORDER BY rowid DESC LIMIT 100').all().map(row => JSON.parse(String(row.content)));
  }

  close(): void { this.database.close(); }
}
