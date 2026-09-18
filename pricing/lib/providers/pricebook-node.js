/* Filesystem access for the price book. Node only — kept apart from
   pricebook.js so the comparison core bundles for a Worker. */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const BOOK_PATH = process.env.PRICEBOOK_PATH || resolve(HERE, '../../pricebook.json');

export async function load(path = BOOK_PATH) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    throw new Error(`pricebook at ${path} is not valid JSON: ${err.message}`);
  }
}

export async function save(book, path = BOOK_PATH) {
  await writeFile(path, JSON.stringify(book, null, 2) + '\n', 'utf8');
  return path;
}

export { lookup, put } from './pricebook.js';
