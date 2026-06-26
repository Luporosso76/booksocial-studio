import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { appConfig } from "./config.js";
import { dataDir } from "./paths.js";

export interface TlsMaterial {
  key: Buffer;
  cert: Buffer;
}

function certPaths(): { certPath: string; keyPath: string } {
  const dir = join(dataDir(), "certs");
  return {
    certPath: appConfig.tlsCertPath || join(dir, "cert.pem"),
    keyPath: appConfig.tlsKeyPath || join(dir, "key.pem"),
  };
}

function generateSelfSigned(certPath: string, keyPath: string): void {
  mkdirSync(dirname(certPath), { recursive: true });
  mkdirSync(dirname(keyPath), { recursive: true });
  const cn = appConfig.tlsCn;
  const san = `subjectAltName=DNS:${cn},DNS:localhost,IP:127.0.0.1`;
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "3650",
      "-subj",
      `/CN=${cn}`,
      "-addext",
      san,
    ],
    { stdio: "ignore" },
  );
}

export function loadTls(): TlsMaterial | null {
  const { certPath, keyPath } = certPaths();
  if (existsSync(certPath) && existsSync(keyPath)) {
    return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
  }
  try {
    console.log(`[tls] certificato assente: genero self-signed (CN=${appConfig.tlsCn}) in ${certPath}`);
    generateSelfSigned(certPath, keyPath);
    return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
  } catch {
    console.warn("[tls] nessun certificato e generazione self-signed non riuscita: avvio in HTTP");
    return null;
  }
}
