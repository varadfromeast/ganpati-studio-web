import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Firestore } from "@google-cloud/firestore";
import { DailySpendLimitError } from "../src/devotional-movie/errors.js";
import {
  FirestorePaidGenerationGuard,
  NoGenerationCreditsError,
} from "../src/economy/GenerationEconomy.js";

describe("FirestorePaidGenerationGuard", () => {
  it("does not consume a daily slot when the account has no credit", async () => {
    const firestore = new FakeFirestore();
    firestore.seed("generationCreditAccounts/owner", { credits: 0, freeCreditsRemaining: 0 });
    const guard = new FirestorePaidGenerationGuard(
      1,
      firestore as unknown as Firestore,
      () => new Date("2026-08-24T12:00:00Z"),
    );

    await assert.rejects(guard.reserve("owner", "attempt"), NoGenerationCreditsError);

    assert.equal(firestore.has("devotionalMovieUsage/global_2026-08-24"), false);
    assert.equal(firestore.paths("devotionalMoviePaidReservations/").length, 0);
  });

  it("does not consume a credit when the daily provider limit is exhausted", async () => {
    const firestore = new FakeFirestore();
    firestore.seed("generationCreditAccounts/owner", { credits: 2, freeCreditsRemaining: 2 });
    firestore.seed("devotionalMovieUsage/global_2026-08-24", {
      day: "2026-08-24",
      acceptedCount: 1,
    });
    const guard = new FirestorePaidGenerationGuard(
      1,
      firestore as unknown as Firestore,
      () => new Date("2026-08-24T12:00:00Z"),
    );

    await assert.rejects(guard.reserve("owner", "attempt"), DailySpendLimitError);

    assert.equal(firestore.read("generationCreditAccounts/owner")?.["credits"], 2);
    assert.equal(firestore.paths("generationCreditReservations/").length, 0);
  });

  it("creates both reservations atomically and remains idempotent", async () => {
    const firestore = new FakeFirestore();
    const guard = new FirestorePaidGenerationGuard(
      1,
      firestore as unknown as Firestore,
      () => new Date("2026-08-24T12:00:00Z"),
    );

    await guard.reserve("owner", "attempt");
    await guard.reserve("owner", "attempt");

    assert.equal(firestore.read("generationCreditAccounts/owner")?.["credits"], 1);
    assert.equal(
      firestore.read("devotionalMovieUsage/global_2026-08-24")?.["acceptedCount"],
      1,
    );
    assert.equal(firestore.paths("generationCreditReservations/").length, 1);
    assert.equal(firestore.paths("devotionalMoviePaidReservations/").length, 1);
  });
});

class FakeFirestore {
  private readonly documents = new Map<string, Record<string, unknown>>();

  collection(name: string) { return new FakeCollection(this, name); }

  async runTransaction<T>(body: (transaction: FakeTransaction) => Promise<T>): Promise<T> {
    const staged = new Map(this.documents);
    const result = await body(new FakeTransaction(staged));
    this.documents.clear();
    for (const [path, value] of staged) this.documents.set(path, value);
    return result;
  }

  seed(path: string, value: Record<string, unknown>) { this.documents.set(path, value); }
  has(path: string) { return this.documents.has(path); }
  read(path: string) { return this.documents.get(path); }
  paths(prefix: string) { return [...this.documents.keys()].filter((path) => path.startsWith(prefix)); }
}

class FakeCollection {
  constructor(private readonly firestore: FakeFirestore, private readonly path: string) {}
  doc(id: string) { return new FakeDocument(this.firestore, `${this.path}/${id}`); }
}

class FakeDocument {
  constructor(readonly firestore: FakeFirestore, readonly path: string) {}
  collection(name: string) { return new FakeCollection(this.firestore, `${this.path}/${name}`); }
}

class FakeSnapshot {
  constructor(private readonly value: Record<string, unknown> | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
  get(field: string) { return this.value?.[field]; }
}

class FakeTransaction {
  constructor(private readonly staged: Map<string, Record<string, unknown>>) {}
  async get(reference: FakeDocument) { return new FakeSnapshot(this.staged.get(reference.path)); }
  set(reference: FakeDocument, value: Record<string, unknown>) { this.staged.set(reference.path, value); }
  create(reference: FakeDocument, value: Record<string, unknown>) {
    if (this.staged.has(reference.path)) throw new Error("Document already exists.");
    this.staged.set(reference.path, value);
  }
}
