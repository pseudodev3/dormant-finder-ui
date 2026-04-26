import type { NextRequest } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';
import { JsonRpcProvider, formatEther } from 'ethers';

export async function POST(req: NextRequest) {
  try {
    const { minEth, dormantYears, rpcUrl } = await req.json();

    // 1. Initialize BigQuery
    // Note: In production, set GOOGLE_APPLICATION_CREDENTIALS env var
    const bigquery = new BigQuery();
    
    const dormantDate = new Date();
    dormantDate.setFullYear(dormantDate.getFullYear() - dormantYears);
    const dateStr = dormantDate.toISOString().split('T')[0];

    const query = `
      SELECT 
        balances.address, 
        balances.eth_balance, 
        last_tx.last_seen
      FROM (
        SELECT address, sum(balance) / 1e18 as eth_balance
        FROM \`bigquery-public-data.crypto_ethereum.balances\`
        GROUP BY 1
        HAVING eth_balance > ${minEth}
      ) AS balances
      JOIN (
        SELECT from_address as address, MAX(block_timestamp) as last_seen
        FROM \`bigquery-public-data.crypto_ethereum.transactions\`
        GROUP BY 1
      ) AS last_tx ON balances.address = last_tx.address
      WHERE last_tx.last_seen < '${dateStr}'
      ORDER BY eth_balance DESC
      LIMIT 20
    `;

    const [rows] = await bigquery.query(query);
    
    // 2. Live Verification
    const provider = new JsonRpcProvider(rpcUrl);
    const verifiedResults = [];

    for (const row of rows) {
      try {
        const balanceWei = await provider.getBalance(row.address);
        const liveEth = parseFloat(formatEther(balanceWei));
        
        if (liveEth >= minEth) {
          verifiedResults.push({
            address: row.address,
            bqBalance: row.eth_balance,
            liveBalance: liveEth,
            lastSeen: row.last_seen.value
          });
        }
      } catch (e) {
        console.error(`Verification failed for ${row.address}`);
      }
    }

    return Response.json({ success: true, data: verifiedResults });
  } catch (error: any) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
