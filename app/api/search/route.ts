import type { NextRequest } from 'next/server';
import { JsonRpcProvider, formatEther } from 'ethers';

export async function POST(req: NextRequest) {
  try {
    const { minEth, dormantYears, rpcUrl } = await req.json();
    const DUNE_API_KEY = process.env.DUNE_API_KEY;

    if (!DUNE_API_KEY) {
      return Response.json({ success: false, error: "DUNE_API_KEY is not set in Vercel environment variables." }, { status: 500 });
    }

    // Dune SQL Query: Find addresses with ETH balance > minEth and NO outgoing txs for X years
    const querySql = `
      WITH last_outgoing AS (
          SELECT from as address, MAX(block_time) as last_active
          FROM ethereum.transactions
          GROUP BY 1
      )
      SELECT 
          b.address, 
          b.amount / 1e18 as eth_balance,
          l.last_active
      FROM ethereum.balances_eth b
      JOIN last_outgoing l ON b.address = l.address
      WHERE b.amount / 1e18 > ${minEth}
      AND l.last_active < now() - interval '${dormantYears}' year
      ORDER BY 2 DESC
      LIMIT 20
    `;

    // 1. Execute Query on Dune
    const executeRes = await fetch("https://api.dune.com/api/v1/dune/query/execute/sql", {
      method: "POST",
      headers: {
        "X-DUNE-API-KEY": DUNE_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query_sql: querySql })
    });

    const execData = await executeRes.json();
    if (!executeRes.ok) throw new Error(execData.message || "Dune execution failed");

    const executionId = execData.execution_id;

    // 2. Poll for Results (Dune is async)
    let resultsData;
    for (let i = 0; i < 10; i++) { // Poll 10 times
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
      const statusRes = await fetch(`https://api.dune.com/api/v1/execution/${executionId}/results`, {
        headers: { "X-DUNE-API-KEY": DUNE_API_KEY }
      });
      resultsData = await statusRes.json();
      if (statusRes.ok && resultsData.state === "QUERY_STATE_COMPLETED") break;
    }

    if (!resultsData || resultsData.state !== "QUERY_STATE_COMPLETED") {
      throw new Error("Dune query timed out or failed. Try again in a moment.");
    }

    const rows = resultsData.result.rows;

    // 3. Live Verification via RPC
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
            lastSeen: row.last_active
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
