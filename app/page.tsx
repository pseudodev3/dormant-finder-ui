"use client";

import { useState } from "react";
import { Search, Wallet, History, Download, ShieldCheck, Loader2 } from "lucide-react";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [config, setConfig] = useState({ minEth: 1.0, dormantYears: 2, rpcUrl: "" });

  const startScan = async () => {
    if (!config.rpcUrl) return alert("Please provide an RPC URL");
    setLoading(true);
    setResults([]);
    setStatus("Initiating Dune Query...");
    
    try {
      // 1. Start Execution
      const res = await fetch("/api/search", {
        method: "POST",
        body: JSON.stringify({ ...config, action: "start" }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const executionId = data.executionId;
      
      // 2. Poll for results
      let completed = false;
      while (!completed) {
        setStatus("Searching blockchain history... (this can take 10-20s)");
        await new Promise(r => setTimeout(r, 3000));
        
        const checkRes = await fetch("/api/search", {
          method: "POST",
          body: JSON.stringify({ ...config, action: "check", executionId }),
        });
        const checkData = await checkRes.json();
        
        if (checkData.state === "COMPLETED") {
          setResults(checkData.data);
          completed = true;
        } else if (checkData.state === "FAILED") {
          throw new Error("Dune query failed.");
        }
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0b] text-white p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              Dormant Explorer
            </h1>
            <p className="text-gray-400 mt-2">Identify high-value, inactive EVM liquidity.</p>
          </div>
          <div className="bg-[#161618] border border-gray-800 rounded-lg px-4 py-2 flex items-center gap-2">
            <ShieldCheck className="text-emerald-500 size-4" />
            <span className="text-sm text-gray-300">Dune Hybrid Engine</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 bg-[#161618] border border-gray-800 rounded-xl p-6 space-y-4 h-fit">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Search className="size-4 text-blue-400" /> Configuration
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 uppercase font-bold">Min ETH</label>
                <input type="number" value={config.minEth} onChange={(e) => setConfig({...config, minEth: parseFloat(e.target.value)})} className="w-full bg-[#0a0a0b] border border-gray-700 rounded-lg px-4 py-2" />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase font-bold">Dormancy (Years)</label>
                <input type="range" min="1" max="10" value={config.dormantYears} onChange={(e) => setConfig({...config, dormantYears: parseInt(e.target.value)})} className="w-full accent-blue-500" />
                <div className="text-right text-sm text-blue-400">{config.dormantYears} Years</div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase font-bold">RPC URL</label>
                <input type="password" placeholder="Alchemy URL" value={config.rpcUrl} onChange={(e) => setConfig({...config, rpcUrl: e.target.value})} className="w-full bg-[#0a0a0b] border border-gray-700 rounded-lg px-4 py-2 text-sm" />
              </div>
              <button onClick={startScan} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-bold transition flex items-center justify-center gap-2">
                {loading ? <Loader2 className="animate-spin size-5" /> : "Start Discovery"}
              </button>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-4">
            {loading && (
              <div className="p-12 text-center bg-[#161618] rounded-xl border border-blue-500/20">
                <Loader2 className="animate-spin size-8 text-blue-500 mx-auto mb-4" />
                <h3 className="text-xl font-medium">{status}</h3>
              </div>
            )}

            {!loading && results.length === 0 && (
              <div className="h-64 border-2 border-dashed border-gray-800 rounded-xl flex flex-col items-center justify-center text-gray-600">
                <Wallet className="size-12 mb-4 opacity-20" />
                <p>No active scan results.</p>
              </div>
            )}

            <div className="grid gap-4">
              {results.map((wallet, i) => (
                <div key={i} className="bg-[#161618] border border-gray-800 p-5 rounded-xl flex items-center justify-between hover:border-blue-500/50 transition">
                  <div className="flex items-center gap-4">
                    <Wallet className="size-6 text-emerald-400" />
                    <div>
                      <div className="font-mono text-sm text-gray-300">{wallet.address}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                        <History className="size-3" /> Last Outgoing: {new Date(wallet.lastSeen).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold">{wallet.liveBalance.toFixed(2)} ETH</div>
                    <div className="text-xs text-emerald-500">Verified Live</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
