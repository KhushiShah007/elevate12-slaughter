import { getDb } from '../db/client';
import { refreshCostIndex } from '../budget';

// npm run refresh:cost-index — rebuild the destination cost index. With a Numbeo key this
// is where live prices would be pulled; without one it uses the curated daily costs.
const { db, close } = await getDb();
if (process.env.NUMBEO_API_KEY) console.log('NUMBEO_API_KEY is set, but the Numbeo pull is not implemented yet: using curated costs.');
console.log(`cost index rows: ${await refreshCostIndex(db)}`);
await close();
