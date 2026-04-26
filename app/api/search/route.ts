import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, formatEther } from 'ethers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { minEth, dormantYears, rpcUrl, executionId, action } = body;
    const DUNE_API_KEY = process.env.DUNE_API_KEY;

    if (!DUNE_API_KEY) {
      return NextResponse.json({ success: false, error: "DUNE_API_KEY is missing in Vercel." });
    }

    // --- ACTION: CHECK ---
    if (action === "check" && executionId) {
      const statusRes = await fetch(`https://api.dune.com/api/v1/execution/${executionId}/results`, {
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
              if (liveEth >= (parseFloat(minEth) || 1.0)) {
                verifiedResults.push({
                  address: row.address,
                  liveBalance: liveEth,
                  lastSeen: row.last_active
                });
              }
            } catch (e) {}
          }
        }
        return NextResponse.json({ success: true, state: "COMPLETED", data: verifiedResults });
      }
      
      if (resultsData.state === "QUERY_STATE_FAILED") {
        return NextResponse.json({ success: false, error: "Dune Execution Failed: " + JSON.stringify(resultsData.error) });
      }

      return NextResponse.json({ success: true, state: resultsData.state });
    }

    // --- ACTION: START ---
    const safeMinEth = parseFloat(minEth) || 1.0;
    const safeYears = parseInt(dormantYears) || 2;

    // Standard Query using the most high-performance ETH balance table
    const querySql = `
      SELECT 
        address, 
        amount / 1e18 as eth_balance, 
        last_transfer_block_time as last_active
      FROM ethereum.balances_eth
      WHERE amount / 1e18 > ${safeMinEth}
      AND last_transfer_block_time < now() - interval '${safeYears}' year
      ORDER BY 2 DESC
      LIMIT 10
    `;

    // FIXED ENDPOINT: /api/v1/sql/execute
    // FIXED PAYLOAD: "query_sql" -> "sql"
    const executeRes = await fetch("https://api.dune.com/api/v1/sql/execute", {
      method: "POST",
      headers: {
        "X-DUNE-API-KEY": DUNE_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        sql: querySql,
        performance: "medium" 
      })
    });

    const execData = await executeRes.json();
    
    if (!executeRes.ok) {
        return NextResponse.json({ 
          success: false, 
          error: `Dune Error (${executeRes.status}): ${execData.message || JSON.stringify(execData)}` 
        });
    }

    return NextResponse.json({ success: true, state: "STARTED", executionId: execData.execution_id });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: "Server Error: " + error.message });
  }
}
