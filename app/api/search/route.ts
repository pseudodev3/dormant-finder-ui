import type { NextRequest } from 'next/server';
import { JsonRpcProvider, formatEther } from 'ethers';

export async function POST(req: NextRequest) {
  try {
    const { minEth, dormantYears, rpcUrl } = await req.json();
    const DUNE_API_KEY = process.env.DUNE_API_KEY;

    if (!DUNE_API_KEY) {
      return Response.json({ success: false, error: "DUNE_API_KEY is not set in Vercel. Go to Settings > Environment Variables." }, { status: 500 });
    }

    // Fixed SQL: Quoted "from" and "block_time" for Trino (Dune's engine) compatibility
    const querySql = `
      SELECT 
          b.address, 
          b.amount / 1e18 as eth_balance,
          MAX(t.block_time) as last_active
      FROM ethereum.balances_eth b
      JOIN ethereum.transactions t ON b.address = t."from"
      WHERE b.amount / 1e18 > ${minEth}
      GROUP BY 1, 2
      HAVING MAX(t.block_time) < now() - interval '${dormantYears}' year
      ORDER BY 2 DESC
      LIMIT 20
    `;

    console.log("Executing Dune Query...");

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
    if (!executeRes.ok) {
      console.error("Dune API Error:", execData);
      return Response.json({ success: false, error: `Dune API Error: ${execData.message || "Execution failed"}` }, { status: 500 });
    }

    const executionId = execData.execution_id;

    // 2. Poll for Results (Dune is async)
    let resultsData;
    let completed = false;
    for (let i = 0; i < 15; i++) { // Poll for up to 30 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));
      const statusRes = await fetch(`https://api.dune.com/api/v1/execution/${executionId}/results`, {
        headers: { "X-DUNE-API-KEY": DUNE_API_KEY }
      });
      resultsData = await statusRes.json();
      if (statusRes.ok && resultsData.state === "QUERY_STATE_COMPLETED") {
        completed = true;
        break;
      }
      if (resultsData.state === "QUERY_STATE_FAILED") {
        return Response.json({ success: false, error: `Query failed: ${resultsData.error}` }, { status: 500 });
      }
    }

    if (!completed) {
      return Response.json({ success: false, error: "Dune query is taking too long. Please try again in 30 seconds." }, { status: 500 });
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
    console.error("Server Error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
