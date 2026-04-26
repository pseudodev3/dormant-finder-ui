import type { NextRequest } from 'next/server';
import { JsonRpcProvider, formatEther } from 'ethers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { minEth, dormantYears, rpcUrl, executionId, action } = body;
    const DUNE_API_KEY = process.env.DUNE_API_KEY;

    if (!DUNE_API_KEY) {
      return Response.json({ success: false, error: "DUNE_API_KEY missing in Vercel settings." }, { status: 500 });
    }

    // --- ACTION: CHECK ---
    if (action === "check" && executionId) {
      const statusRes = await fetch(`https://api.dune.com/api/v1/execution/${executionId}/results?limit=20`, {
        headers: { "X-DUNE-API-KEY": DUNE_API_KEY }
      });
      const resultsData = await statusRes.json();

      if (resultsData.state === "QUERY_STATE_COMPLETED") {
        const rows = resultsData.result?.rows || [];
        const verifiedResults = [];

        if (rpcUrl && rpcUrl.startsWith('http')) {
          const provider = new JsonRpcProvider(rpcUrl);
          for (const row of rows) {
            try {
              const balanceWei = await provider.getBalance(row.address);
              const liveEth = parseFloat(formatEther(balanceWei));
              if (liveEth >= minEth) {
                verifiedResults.push({
                  address: row.address,
                  liveBalance: liveEth,
                  lastSeen: row.last_active
                });
              }
            } catch (e) { console.error("RPC Error:", e); }
          }
        }
        return Response.json({ success: true, state: "COMPLETED", data: verifiedResults });
      }
      return Response.json({ success: true, state: resultsData.state });
    }

    // --- ACTION: START ---
    // Optimized Query: Filter top balance addresses FIRST to avoid massive join
    const querySql = `
      WITH top_wallets AS (
          SELECT address, amount / 1e18 as balance
          FROM ethereum.balances_eth
          WHERE amount / 1e18 > ${minEth}
          ORDER BY amount DESC
          LIMIT 1000
      )
      SELECT 
          w.address, 
          w.balance as eth_balance,
          MAX(t.block_time) as last_active
      FROM top_wallets w
      JOIN ethereum.transactions t ON w.address = t."from"
      WHERE t.block_time > now() - interval '10' year
      GROUP BY 1, 2
      HAVING MAX(t.block_time) < now() - interval '${dormantYears}' year
      ORDER BY 2 DESC
      LIMIT 20
    `;

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
        return Response.json({ success: false, error: execData.message || "Dune Start Failed" }, { status: 500 });
    }

    return Response.json({ success: true, state: "STARTED", executionId: execData.execution_id });

  } catch (error: any) {
    return Response.json({ success: false, error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
