"use client";

import { useState } from "react";
import { Search, Wallet, History, Download, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [config, setConfig] = useState({
    minEth: 1.0,
    dormantYears: 2,
    rpcUrl: ""
  });

  const startScan = async () => {
    if (!config.rpcUrl) return alert("Please provide an RPC URL");
    setLoading(true);
    setResults([]);
    
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) setResults(data.data);
      else alert("Error: " + data.error);
    } catch (e) {
      alert("Failed to connect to API");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0b] text-white p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              Dormant Explorer
            </h1>
            <p className="text-gray-400 mt-2">Identify high-value, inactive EVM liquidity.</p>
          </div>
          <div className="flex gap-4">
            <div className="bg-[#161618] border border-gray-800 rounded-lg px-4 py-2 flex items-center gap-2">
              <ShieldCheck className="text-emerald-500 size-4" />
              <span className="text-sm text-gray-300">Dune Engine Connected</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Controls */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-[#161618] border border-gray-800 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Search className="size-4 text-blue-400" /> Filters
              </h2>
              
              <div className="space-y-2">
                <label className="text-xs text-gray-500 uppercase font-bold">Min ETH Balance</label>
                <input 
                  type="number" 
                  value={config.minEth}
                  onChange={(e) => setConfig({...config, minEth: parseFloat(e.target.value)})}
                  className="w-full bg-[#0a0a0b] border border-gray-700 rounded-lg px-4 py-2 focus:border-blue-500 outline-none transition"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-500 uppercase font-bold">Dormancy (Years)</label>
                <input 
                  type="range" min="1" max="10" 
                  value={config.dormantYears}
                  onChange={(e) => setConfig({...config, dormantYears: parseInt(e.target.value)})}
                  className="w-full accent-blue-500"
                />
                <div className="text-right text-sm text-blue-400">{config.dormantYears} Years</div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-500 uppercase font-bold">RPC URL</label>
                <input 
                  type="password" 
                  placeholder="Alchemy / Infura URL"
                  value={config.rpcUrl}
                  onChange={(e) => setConfig({...config, rpcUrl: e.target.value})}
                  className="w-full bg-[#0a0a0b] border border-gray-700 rounded-lg px-4 py-2 focus:border-blue-500 outline-none transition text-sm"
                />
              </div>

              <button 
                onClick={startScan}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white font-bold py-3 rounded-lg transition flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
              >
                {loading ? <Loader2 className="animate-spin size-5" /> : "Start Discovery"}
              </button>
            </div>
          </div>

          {/* Results Area */}
          <div className="lg:col-span-3 space-y-4">
            {results.length === 0 && !loading ? (
              <div className="h-64 border-2 border-dashed border-gray-800 rounded-xl flex flex-col items-center justify-center text-gray-600">
                <Wallet className="size-12 mb-4 opacity-20" />
                <p>No active scan results. Configure filters and start discovery.</p>
              </div>
            ) : null}

            {loading && (
              <div className="p-12 text-center space-y-4">
                <div className="inline-block p-4 bg-blue-500/10 rounded-full animate-pulse">
                  <Search className="size-8 text-blue-500" />
                </div>
                <h3 className="text-xl font-medium">Querying Dune Analytics...</h3>
                <p className="text-gray-500">Scanning indexed blockchain records & verifying balances.</p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4">
              {results.map((wallet, i) => (
                <div key={i} className="bg-[#161618] border border-gray-800 p-5 rounded-xl flex items-center justify-between group hover:border-blue-500/50 transition">
                  <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-gray-700 to-gray-800 p-3 rounded-lg">
                      <Wallet className="size-6 text-emerald-400" />
                    </div>
                    <div>
                      <div className="font-mono text-sm text-gray-300 flex items-center gap-2">
                        {wallet.address}
                        <button className="opacity-0 group-hover:opacity-100 transition text-blue-400 text-xs">Copy</button>
                      </div>
                      <div className="flex gap-4 mt-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><History className="size-3" /> Last Active: {new Date(wallet.lastSeen).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-white">{wallet.liveBalance.toFixed(2)} ETH</div>
                    <div className="text-xs text-emerald-500 font-medium">Verified Live</div>
                  </div>
                </div>
              ))}
            </div>

            {results.length > 0 && (
              <button className="w-full py-4 border border-gray-800 rounded-xl text-gray-400 hover:text-white hover:bg-[#161618] transition flex items-center justify-center gap-2">
                <Download className="size-4" /> Export Results (CSV)
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
