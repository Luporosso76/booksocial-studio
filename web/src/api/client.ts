// Tiny typed fetch wrapper around the /api contract.
// All requests are proxied to http://127.0.0.1:8770 by Vite in dev.

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const BASE = "/api";

let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

async function parseError(res: Response): Promise<never> {
  let message = `Errore ${res.status}`;
  try {
    const data = (await res.json()) as { error?: string };
    if (data && typeof data.error === "string" && data.error.trim()) {
      message = data.error;
    }
  } catch {
    // body was not JSON; keep the generic message
  }
  throw new ApiError(message, res.status);
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401) unauthorizedHandler?.();
    return parseError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

// Retry SOLO sui GET (idempotenti) per errori di RETE transitori: durante la generazione immagini
// l'iGPU satura la RAM e la macchina va in swap → il server può rifiutare qualche connessione per
// pochi istanti. Senza retry il frontend mostrava subito "Impossibile contattare il backend".
// NON si ritenta su: abort (richiesta annullata) né su errori HTTP veri (4xx/5xx li solleva handle()).
const GET_MAX_RETRIES = 3;
const GET_RETRY_BASE_MS = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
      });
    } catch (e) {
      // Errore di rete (fetch rifiuta con TypeError). Non ritentare se abortita o esauriti i tentativi.
      if ((e as Error)?.name === "AbortError" || attempt >= GET_MAX_RETRIES) throw e;
      await sleep(GET_RETRY_BASE_MS * (attempt + 1));
      continue;
    }
    return handle<T>(res); // gli errori HTTP NON vengono ritentati
  }
}

export async function apiSend<T>(
  method: "POST" | "PUT" | "DELETE" | "PATCH",
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { Accept: "application/json" },
    signal,
  };
  if (body !== undefined) {
    init.headers = {
      ...init.headers,
      "Content-Type": "application/json",
    };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, init);
  return handle<T>(res);
}

export function apiPost<T>(path: string, body?: unknown, signal?: AbortSignal) {
  return apiSend<T>("POST", path, body, signal);
}

export function apiPut<T>(path: string, body?: unknown, signal?: AbortSignal) {
  return apiSend<T>("PUT", path, body, signal);
}

export function apiDelete<T>(path: string, signal?: AbortSignal) {
  return apiSend<T>("DELETE", path, undefined, signal);
}

// Multipart upload (book import, media). Do NOT set Content-Type; the browser
// sets the multipart boundary automatically.
export async function apiUpload<T>(path: string, form: FormData, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
    signal,
  });
  return handle<T>(res);
}
