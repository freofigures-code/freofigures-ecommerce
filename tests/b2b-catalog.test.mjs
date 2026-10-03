import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('B2B categories keep existing products in the store and reject unknown sections', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table public.products (
      id bigint primary key, created_at timestamptz default now(), is_active boolean default true
    ); insert into public.products(id) values (1);`);
    const migration = await readFile(new URL('../supabase/migrations/202610030001_b2b_categories.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const existing = await db.query('select b2b_category from public.products where id = 1');
    assert.equal(existing.rows[0].b2b_category, 'loja');
    await db.exec("insert into public.products(id,b2b_category) values (2,'eventos'),(3,'sob_medida')");
    await assert.rejects(db.exec("insert into public.products(id,b2b_category) values (4,'invalida')"));
  } finally {
    await db.close();
  }
});
