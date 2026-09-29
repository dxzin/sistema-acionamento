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

function metricValues(metrics: string, metricName: string) {
  const values: number[] = [];
  const pattern = new RegExp(`^${metricName}(?:\\{[^}]*\\})?\\s+(\\S+)`);
  for (const line of metrics.split(/\r?\n/)) {
    const match = line.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value >= 0) values.push(value);
  }
  return values;
}

function metricTotal(metrics: string, metricName: string) {
  return metricValues(metrics, metricName).reduce((sum, value) => sum + value, 0);
}

export function performanceUsage(metrics: string) {
  const totalQueries = metricTotal(metrics, "pg_stat_statements_total_queries");
  const totalQuerySeconds = metricTotal(metrics, "pg_stat_statements_total_time_seconds");
  const activeConnections = metricTotal(metrics, "pg_stat_database_num_backends");
  const cacheHits = metricTotal(metrics, "pg_stat_database_blks_hit_total");
  const diskReads = metricTotal(metrics, "pg_stat_database_blks_read_total");
  if (!totalQueries && !activeConnections && !cacheHits && !diskReads) {
    throw new Error("Métricas de desempenho indisponíveis.");
  }
  const cacheRequests = cacheHits + diskReads;
  return {
    totalQueries,
    averageQueryMs: totalQueries > 0 ? totalQuerySeconds / totalQueries * 1000 : 0,
    activeConnections,
    cacheHitPercent: cacheRequests > 0 ? cacheHits / cacheRequests * 100 : 0,
  };
}

export type PerformanceUsage = ReturnType<typeof performanceUsage>;
