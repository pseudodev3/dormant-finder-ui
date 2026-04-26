import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, formatEther } from 'ethers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { minEth, dormantYears, rpcUrl, executionId, action } = body;
    const DUNE_API_KEY = process.env.DUNE_API_KEY;

    if (!DUNE_API_KEY) {
      return NextResponse.json({ success: false, error: "DUNE_API_KEY is missing. Add it to Vercel Environment Variables." });
    }

    // --- ACTION: CHECK ---
    if (action === "check" && executionId) {
      const statusRes = await fetch(`https://api.dune.com/api/v1/execution/${executionId}/results`, {
        headers: { "X-DUNE-API-KEY": DUNE_API_KEY }
      });
      
      if (!statusRes.ok) {
        const err = await statusRes.json();
        return NextResponse.json({ success: false, error: err.message || "Failed to fetch Dune results" });
      }

      const resultsData = await statusRes.json();

      if (resultsData.state === "QUERY_STATE_COMPLETED") {
        const rows = resultsData.result?.rows || [];
        const verifiedResults = [];

        // Only verify if RPC URL is provided
        if (rpcUrl && rpcUrl.startsWith('http')) {
          try {
            const provider = new JsonRpcProvider(rpcUrl);
            for (const row of rows) {
              const balanceWei = await provider.getBalance(row.address);
              const liveEth = parseFloat(formatEther(balanceWei));
              if (liveEth >= (parseFloat(minEth) || 1.0)) {
                verifiedResults.push({
                  address: row.address,
                  liveBalance: liveEth,
                  lastSeen: row.last_active || row.last_transfer_block_time
                });
              }
            }
          } catch (rpcErr) {
            console.error("RPC Verification failed:", rpcErr);
          }
        }
        return NextResponse.json({ success: true, state: "COMPLETED", data: verifiedResults });
      }
      return NextResponse.json({ success: true, state: resultsData.state });
    }

    // --- ACTION: START ---
    const safeMinEth = parseFloat(minEth) || 1.0;
    const safeYears = parseInt(dormantYears) || 2;

    // Use a more standard Dune SQL query for ETH balances
    const querySql = `
      SELECT 
          address, 
          amount / 1e18 as eth_balance,
          last_transfer_block_time as last_active
      FROM ethereum.balances_eth
      WHERE amount / 1e18 > ${safeMinEth}
      AND last_transfer_block_time < now() - interval '${safeYears}' year
      ORDER BY 2 DESC
      LIMIT 15
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
      return NextResponse.json({ success: false, error: execData.message || "Dune rejected the query" });
    }

    return NextResponse.json({ success: true, state: "STARTED", executionId: execData.execution_id });

  } catch (error: any) {
    console.error("Critical API Error:", error);
    return NextResponse.json({ success: false, error: error.message || "An unexpected server error occurred" });
  }
}
