import pg from 'pg';

// int8 ids stay far below 2^53 at this catalog's size, so a plain number is safe and
// keeps ids comparable with ===.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

export function createPool(config: pg.PoolConfig): pg.Pool {
  return new pg.Pool(config);
}
