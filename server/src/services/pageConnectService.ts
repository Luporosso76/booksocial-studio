import { pages } from "../db/repositories.js";
import * as keyring from "../secrets/keyring.js";
import * as fb from "../facebook/client.js";
import * as ig from "../facebook/instagramClient.js";
import { pageSecretKeyFor, type FacebookPage } from "../domain.js";

// Connects the app to the user's Facebook pages. Given a (System User / long-lived)
// token, lists managed pages; when one is selected, saves the page row in the DB
// and the Page token in the keyring (key fb.page.<id>). Token never in the DB or logs.

// Lists pages managed from a user token (already long-lived / system-user).
export async function loadManagedPages(userToken: string): Promise<fb.ManagedPage[]> {
  return fb.fetchManagedPages(userToken);
}

// Saves a selected page: token in the keyring, metadata in the DB.
export async function savePage(p: fb.ManagedPage): Promise<void> {
  if (!p.accessToken || p.accessToken.trim() === "") {
    throw new Error(`La pagina '${p.name}' non ha un Page Token.`);
  }
  const secretKey = pageSecretKeyFor(p.id);
  await keyring.put(secretKey, p.accessToken);
  // Risolve subito l'Instagram Business account collegato (best-effort): se la Pagina ne ha uno,
  // il tab Instagram comparira' senza attendere il backfill lazy su GET /pages. Non blocca il
  // collegamento se IG non e' disponibile o il token non ha gli scope IG.
  let igUserId: string | null = null;
  try {
    igUserId = await ig.getIgUserId(p.id, p.accessToken);
  } catch {
    igUserId = null;
  }
  const row: FacebookPage = {
    pageId: p.id,
    name: p.name,
    category: p.category,
    tokenSecretKey: secretKey,
    bookId: null,
    addedAt: Date.now(),
    igUserId,
  };
  await pages.upsert(row);
}

export async function removePage(pageId: string): Promise<void> {
  const pg = await pages.find(pageId);
  if (pg) await keyring.remove(pg.tokenSecretKey);
  await pages.delete(pageId);
}

// Full logout: clears page tokens and removes page rows from the DB.
export async function disconnectAll(): Promise<void> {
  for (const p of await pages.all()) {
    await keyring.remove(p.tokenSecretKey);
    await pages.delete(p.pageId);
  }
}
