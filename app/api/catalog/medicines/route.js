import { handle } from '@/lib/server/auth';
import { catalogueMedicines } from '@/lib/server/admin-mock';

/* GET /api/catalog/medicines — the medicine catalogue (names, pictures,
   pharmacy availability) that the medicine search and details pages
   read. It is used internally by search and pharmacy workflows. */
export const GET = handle(async () => Response.json({ data: await catalogueMedicines() }));
