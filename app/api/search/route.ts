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
              if (liveEth >= (minEth || 1)) {
                verifiedResults.push({
                  address: row.address,
                  liveBalance: liveEth,
                  lastSeen: row.last_active
                });
              }
            } catch (e) {}
          }
        }
        return Response.json({ success: true, state: "COMPLETED", data: verifiedResults });
      }
      return Response.json({ success: true, state: resultsData.state });
    }

    // --- ACTION: START ---
    // Validate inputs to prevent NaN in SQL
    const safeMinEth = isNaN(parseFloat(minEth)) ? 1.0 : parseFloat(minEth);
    const safeYears = isNaN(parseInt(dormantYears)) ? 2 : parseInt(dormantYears);

    // Super-optimized SQL for Dune (Trino engine)
    const querySql = `
      SELECT 
          address, 
          amount / 1e18 as eth_balance,
          last_transfer_block_time as last_active
      FROM erc20_ethereum.balances
      WHERE symbol = 'ETH'
      AND amount / 1e18 > ${safeMinEth}
      AND last_transfer_block_time < now() - interval '${safeYears}' year
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
