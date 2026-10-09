// Drops and recreates the DEVELOPMENT database (all data is lost), then re-applies migrations.
// Refuses any database ending in "_test" and asks for confirmation first.
import { execSync } from 'node:child_process';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { loadDotEnv, rootEnvPath } from '../src/config/load-dotenv.js';
import { assertDevelopmentDatabaseUrl } from '../src/db/database-url.js';

loadDotEnv(rootEnvPath);

let target: { url: string; name: string };
try {
  target = assertDevelopmentDatabaseUrl(process.env.DATABASE_URL);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (!stdin.isTTY) {
  console.error('db:reset needs an interactive terminal to confirm. Nothing was changed.');
  process.exit(1);
}

const rl = createInterface({ input: stdin, output: stdout });
const answer = await rl.question(
  `This deletes ALL data in the development database "${target.name}".\n` +
    `Type the database name to confirm: `,
);
rl.close();

if (answer.trim() !== target.name) {
  console.log('Cancelled. Nothing was changed.');
  process.exit(1);
}

execSync('npx prisma migrate reset --force', {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  env: { ...process.env, DATABASE_URL: target.url },
  stdio: 'inherit',
});
