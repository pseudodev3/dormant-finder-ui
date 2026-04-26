"use client";

import { useState } from "react";
import { Search, Wallet, History, ShieldCheck, Loader2, AlertCircle } from "lucide-react";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [config, setConfig] = useState({ minEth: 1.0, dormantYears: 2, rpcUrl: "" });

  const startScan = async () => {
    // Basic validation
    if (!config.rpcUrl) return alert("Please provide an RPC URL (Alchemy/Infura)");
    if (isNaN(config.minEth) || config.minEth <= 0) return alert("Please enter a valid Min ETH balance");

    setLoading(true);
    setResults([]);
    setStatus("Initiating Dune Query...");
    
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, action: "start" }),
      });
      
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to start query");

      const executionId = data.executionId;
      
      let completed = false;
      let attempts = 0;
      while (!completed && attempts < 20) {
        setStatus(`Searching blockchain... (Attempt ${attempts + 1})`);
        await new Promise(r => setTimeout(r, 3000));
        
        const checkRes = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...config, action: "check", executionId }),
        });
        const checkData = await checkRes.json();
        
        if (checkData.state === "COMPLETED") {
          setResults(checkData.data);
          completed = true;
        } else if (checkData.state === "FAILED" || checkData.state === "CANCELLED") {
          throw new Error(`Dune query ${checkData.state.toLowerCase()}`);
        }
        attempts++;
      }
      
      if (!completed) throw new Error("Query timed out. Try a higher Min ETH balance.");

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
            <span className="text-sm text-gray-300">Dune v2 Engine</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 bg-[#161618] border border-gray-800 rounded-xl p-6 space-y-4 h-fit shadow-xl">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Search className="size-4 text-blue-400" /> Filters
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 uppercase font-bold mb-1 block">Min ETH Balance</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={isNaN(config.minEth) ? "" : config.minEth} 
                  onChange={(e) => setConfig({...config, minEth: parseFloat(e.target.value)})} 
                  className="w-full bg-[#0a0a0b] border border-gray-700 rounded-lg px-4 py-2 focus:border-blue-500 outline-none" 
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase font-bold mb-1 block">Dormancy (Years)</label>
                <input type="range" min="1" max="10" value={config.dormantYears} onChange={(e) => setConfig({...config, dormantYears: parseInt(e.target.value)})} className="w-full accent-blue-500" />
                <div className="text-right text-sm text-blue-400">{config.dormantYears} Years</div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase font-bold mb-1 block">RPC URL</label>
                <input type="password" placeholder="Alchemy/Infura URL" value={config.rpcUrl} onChange={(e) => setConfig({...config, rpcUrl: e.target.value})} className="w-full bg-[#0a0a0b] border border-gray-700 rounded-lg px-4 py-2 text-sm focus:border-blue-500 outline-none" />
              </div>
              <button onClick={startScan} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 py-3 rounded-lg font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20">
                {loading ? <Loader2 className="animate-spin size-5" /> : "Start Discovery"}
              </button>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-4">
            {loading && (
              <div className="p-12 text-center bg-[#161618] rounded-xl border border-blue-500/10">
                <Loader2 className="animate-spin size-10 text-blue-500 mx-auto mb-4" />
                <h3 className="text-xl font-medium">{status}</h3>
                <p className="text-gray-500 mt-2 text-sm">Large scans may take up to 60 seconds.</p>
              </div>
            )}

            {!loading && results.length === 0 && (
              <div className="h-64 border-2 border-dashed border-gray-800 rounded-xl flex flex-col items-center justify-center text-gray-600">
                <Wallet className="size-12 mb-4 opacity-20" />
                <p>No verified results. Try adjusting your filters.</p>
              </div>
            )}

            <div className="grid gap-4">
              {results.map((wallet, i) => (
                <div key={i} className="bg-[#161618] border border-gray-800 p-6 rounded-xl flex items-center justify-between hover:border-blue-500/50 transition-all shadow-md group">
                  <div className="flex items-center gap-5">
                    <div className="p-3 bg-gray-800/50 rounded-lg group-hover:bg-blue-500/10 transition">
                      <Wallet className="size-6 text-emerald-400" />
                    </div>
                    <div>
                      <div className="font-mono text-sm text-gray-300 select-all">{wallet.address}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-2 mt-2">
                        <History className="size-3" /> 
                        Last Active: {new Date(wallet.lastSeen).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">{wallet.liveBalance.toFixed(3)} ETH</div>
                    <div className="text-xs text-emerald-500 font-semibold tracking-wider uppercase">Live Verified</div>
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
