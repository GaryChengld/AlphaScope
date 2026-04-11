import path from 'path';
import { defineConfig } from 'prisma/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const DB_PATH = path.resolve(__dirname, 'prisma/dev.db');

export default defineConfig({
  earlyAccess: true,
  schema: 'prisma/schema.prisma',
  datasource: {
    url: `file:${DB_PATH}`,
  },
  migrate: {
    adapter: () => new PrismaBetterSqlite3({ url: DB_PATH }),
  },
});
