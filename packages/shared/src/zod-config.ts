import { z } from 'zod';

// zod v4 probes `new Function` for its JIT, which the strict CSP (no 'unsafe-eval') reports.
// Imported first by index.ts: schemas read this flag when they are created.
z.config({ jitless: true });
