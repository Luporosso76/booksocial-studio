// Normalizzazione parametri di bind per better-sqlite3 (che accetta solo
// number | string | bigint | Buffer | null). Funzione PURA, senza I/O: estratta
// da pool.ts così da essere testabile senza aprire il database reale.
export function norm(params: unknown[]): unknown[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    return p;
  });
}
