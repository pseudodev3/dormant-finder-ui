import type { NextRequest } from 'next/server';
import { JsonRpcProvider, formatEther } from 'ethers';

export async function POST(req: NextRequest) {
  try {
    const { minEth, dormantYears, rpcUrl, executionId, action } = await req.json();
    const DUNE_API_KEY = process.env.DUNE_API_KEY;

    if (!DUNE_API_KEY) {
      return Response.json({ success: false, error: "DUNE_API_KEY is not set in Vercel." }, { status: 500 });
    }

    // --- MODE: CHECK RESULTS ---
    if (action === "check" && executionId) {
      const statusRes = await fetch(`https://api.dune.com/api/v1/execution/${executionId}/results`, {
        headers: { "X-DUNE-API-KEY": DUNE_API_KEY }
      });
      const resultsData = await statusRes.json();

      if (resultsData.state === "QUERY_STATE_COMPLETED") {
        const rows = resultsData.result.rows;
        
        // Live Verification via RPC
        const provider = new JsonRpcProvider(rpcUrl);
        const verifiedResults = [];

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
          } catch (e) {}
        }
        return Response.json({ success: true, state: "COMPLETED", data: verifiedResults });
      }

      return Response.json({ success: true, state: resultsData.state });
    }

    // --- MODE: START EXECUTION ---
    const querySql = `
      SELECT 
          b.address, 
          b.amount / 1e18 as eth_balance,
          MAX(t.block_time) as last_active
      FROM ethereum.balances_eth b
      JOIN ethereum.transactions t ON b.address = t."from"
      WHERE b.amount / 1e18 > ${minEth}
      AND t.block_time > now() - interval '10' year
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
    if (!executeRes.ok) throw new Error(execData.message || "Dune Execution Failed");

    return Response.json({ success: true, state: "STARTED", executionId: execData.execution_id });

  } catch (error: any) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
