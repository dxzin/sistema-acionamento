import assert from "node:assert/strict";
import test from "node:test";
import { databaseUsage, FREE_DATABASE_BYTES, performanceUsage } from "../src/lib/supabase/usage";

test("soma bancos internos sem contar séries duplicadas ou métricas de disco e tráfego", () => {
  const usage = databaseUsage('pg_database_size_bytes{datname="postgres"} 3e7\npg_database_size_bytes{datname="template0"} 7000000\npg_database_size_bytes{datname="postgres"} 3e7\npg_database_size_mb{server="localhost"} 45\npg_database_size_bytes{datname="invalid"} NaN');
  assert.equal(usage.usedBytes, 37000000);
  assert.equal(usage.level, "normal");
  assert.throws(() => databaseUsage("# metrics unavailable"));
});

test("avisos respeitam os limites e exibem consumo acima de 100%", () => {
  for (const [percent, level] of [[79, "normal"], [80, "warning"], [90, "critical"], [100, "limit"], [110, "limit"]] as const) {
    const usage = databaseUsage(`pg_database_size_bytes{datname="postgres"} ${FREE_DATABASE_BYTES * percent / 100}`);
    assert.equal(usage.level, level);
    assert.ok(Math.abs(usage.percent - percent) < 0.001);
  }
});

test("resume consultas, conexões e acerto do cache sem contar comentários", () => {
  const metrics = [
    "# HELP pg_stat_statements_total_queries Total",
    'pg_stat_statements_total_queries{server="localhost"} 2000',
    'pg_stat_statements_total_time_seconds{server="localhost"} 5',
    'pg_stat_database_num_backends{server="localhost"} 12',
    'pg_stat_database_blks_hit_total{server="localhost"} 9900',
    'pg_stat_database_blks_read_total{server="localhost"} 100',
  ].join("\n");
  const usage = performanceUsage(metrics);
  assert.equal(usage.totalQueries, 2000);
  assert.equal(usage.averageQueryMs, 2.5);
  assert.equal(usage.activeConnections, 12);
  assert.equal(usage.cacheHitPercent, 99);
  assert.throws(() => performanceUsage("# metrics unavailable"));
});
