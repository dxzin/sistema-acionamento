export const FREE_DATABASE_BYTES = 500 * 1024 * 1024;

export function databaseUsage(metrics: string) {
  const sizes: number[] = [];
  const databases = new Set<string>();
  for (const line of metrics.split(/\r?\n/)) {
    const match = line.match(/^pg_database_size_bytes\{([^}]+)\}\s+(\S+)(?:\s+\d+)?$/);
    if (!match) continue;
    const database = match[1].match(/(?:^|,)datname="([^"]+)"/)?.[1];
    const size = Number(match[2]);
    if (!database || databases.has(database) || !Number.isFinite(size) || size < 0) continue;
    databases.add(database);
    sizes.push(size);
  }
  if (!sizes.length) throw new Error("Métrica do tamanho do banco indisponível.");
  const usedBytes = sizes.reduce((sum, value) => sum + value, 0);
  const percent = usedBytes / FREE_DATABASE_BYTES * 100;
  return { usedBytes, limitBytes: FREE_DATABASE_BYTES, percent, level: percent >= 100 ? "limit" : percent >= 90 ? "critical" : percent >= 80 ? "warning" : "normal" };
}

export type DatabaseUsage = ReturnType<typeof databaseUsage>;
