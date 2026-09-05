import { DBSchema, openDB } from "idb";

export type SavedRecipe = {
  packId: string;
  selections: Record<string, string>;
  updatedAt: string;
};

export type SavedDesign = {
  id: string;
  packId: string;
  packTitle: string;
  selections: Record<string, string>;
  artwork: Blob;
  artworkSHA256: string;
  createdAt: string;
};

export type PendingVideo = {
  attemptId: string;
  designId: string;
  dedication: string;
  recipientName?: string;
  occasion?: string;
  localeIdentifier: "en-IN" | "hi-IN" | "mr-IN";
  requestState?: "submitting" | "accepted";
  createdAt: string;
};

export type SavedVideo = {
  attemptId: string;
  designId: string;
  personalizedMessage: string;
  movie: Blob;
  createdAt: string;
};

interface StudioDatabase extends DBSchema {
  recipes: {
    key: string;
    value: SavedRecipe;
  };
  designs: {
    key: string;
    value: SavedDesign;
    indexes: { "by-created": string };
  };
  pendingVideos: {
    key: string;
    value: PendingVideo;
  };
  videos: {
    key: string;
    value: SavedVideo;
    indexes: { "by-created": string };
  };
}

const database = openDB<StudioDatabase>("ganpati-studio", 1, {
  upgrade(db) {
    db.createObjectStore("recipes", { keyPath: "packId" });
    const designs = db.createObjectStore("designs", { keyPath: "id" });
    designs.createIndex("by-created", "createdAt");
    db.createObjectStore("pendingVideos", { keyPath: "attemptId" });
    const videos = db.createObjectStore("videos", { keyPath: "attemptId" });
    videos.createIndex("by-created", "createdAt");
  },
});

export async function saveRecipe(recipe: SavedRecipe): Promise<void> {
  await (await database).put("recipes", recipe);
}

export async function loadRecipe(packId: string): Promise<SavedRecipe | undefined> {
  return (await database).get("recipes", packId);
}

export async function saveDesign(design: SavedDesign): Promise<void> {
  await (await database).put("designs", design);
}

export async function loadDesign(id: string): Promise<SavedDesign | undefined> {
  return (await database).get("designs", id);
}

export async function listDesigns(): Promise<SavedDesign[]> {
  return (await (await database).getAllFromIndex("designs", "by-created")).reverse();
}

export async function savePendingVideo(pending: PendingVideo): Promise<void> {
  const db = await database;
  const transaction = db.transaction("pendingVideos", "readwrite");
  await transaction.store.put(pending);
  await transaction.done;
}

export async function loadPendingVideo(attemptId?: string): Promise<PendingVideo | undefined> {
  const db = await database;
  const pending = attemptId
    ? await db.get("pendingVideos", attemptId)
    : (await db.getAll("pendingVideos")).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (pending === undefined) return undefined;

  // Early web previews stored the backend movie id ("movie_<attempt id>") as the
  // local video key. Reconcile those records as well so a completed movie never
  // continues to appear as an in-progress job after an upgrade.
  const completed = await db.get("videos", pending.attemptId)
    ?? await db.get("videos", `movie_${pending.attemptId}`);
  if (completed !== undefined) {
    await db.delete("pendingVideos", pending.attemptId);
    return attemptId ? undefined : loadPendingVideo();
  }
  return pending;
}

export async function clearPendingVideo(attemptId: string): Promise<void> {
  await (await database).delete("pendingVideos", attemptId);
}

export async function saveVideo(video: SavedVideo): Promise<void> {
  const transaction = (await database).transaction(["videos", "pendingVideos"], "readwrite");
  await transaction.objectStore("videos").put(video);
  await transaction.objectStore("pendingVideos").delete(video.attemptId);
  await transaction.done;
}

export async function listVideos(): Promise<SavedVideo[]> {
  return (await (await database).getAllFromIndex("videos", "by-created")).reverse();
}

export async function removeVideo(attemptId: string): Promise<void> {
  await (await database).delete("videos", attemptId);
}

export async function clearLocalCreations(): Promise<void> {
  const db = await database;
  const transaction = db.transaction(
    ["recipes", "designs", "pendingVideos", "videos"],
    "readwrite",
  );
  await Promise.all([
    transaction.objectStore("recipes").clear(),
    transaction.objectStore("designs").clear(),
    transaction.objectStore("pendingVideos").clear(),
    transaction.objectStore("videos").clear(),
  ]);
  await transaction.done;
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
