import React, { useState, useCallback, useEffect } from 'react'
import {
  Radar,
  RefreshCw,
  Globe,
  Activity,
  XCircle,
  Wifi,
  Monitor,
  ShieldCheck,
  Zap,
  Server
} from 'lucide-react'
import { useNetworkRadar } from '../hooks/useNetworkRadar'

const styles = `
  @keyframes radar-sweep {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @keyframes ping-dot {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.5); opacity: 0.5; }
  }

  @keyframes fade-in-up {
    0% { opacity: 0; transform: translateY(10px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  .radar-container {
    position: relative;
    width: 200px;
    height: 200px;
  }

  .radar-circle {
    position: absolute;
    border-radius: 50%;
    border: 1px solid rgba(59, 130, 246, 0.2);
  }

  .radar-sweep {
    position: absolute;
    width: 50%;
    height: 50%;
    top: 0;
    left: 50%;
    transform-origin: bottom left;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(59, 130, 246, 0.1),
      rgba(59, 130, 246, 0.3)
    );
    animation: radar-sweep 3s linear infinite;
    border-radius: 0 100% 0 0;
  }

  .radar-center {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 12px;
    height: 12px;
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    border-radius: 50%;
    box-shadow: 0 0 20px rgba(59, 130, 246, 0.5);
  }

  .radar-dot {
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    animation: ping-dot 2s ease-in-out infinite;
  }

  .fade-in-up {
    animation: fade-in-up 0.5s ease-out forwards;
  }
`

export const NetworkRadarTool: React.FC = () => {
  const {
    networkInfo,
    pingResults,
    lanDevices,
    isScanningLan,
    isPinging,
    runPingTest,
    scanLan,
    fetchNetworkInfo
  } = useNetworkRadar()

  useEffect(() => {
    const styleSheet = document.createElement('style')
    styleSheet.innerText = styles
    document.head.appendChild(styleSheet)
    return () => { document.head.removeChild(styleSheet) }
  }, [])

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-500 to-indigo-600 bg-clip-text text-transparent">
          网络雷达
        </h1>
        <p className="text-muted-foreground">实时监控网络延迟、查看网卡信息并扫描局域网设备</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card rounded-2xl p-6 border border-white/10 shadow-soft">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Globe className="text-blue-500" size={20} />
                全局延迟测试
              </h2>
              <button
                onClick={runPingTest}
                disabled={isPinging}
                className={`p-2 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-all ${isPinging ? 'animate-spin' : ''}`}
              >
                <RefreshCw size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {pingResults.map((result, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between hover:bg-white/10 transition-all">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${result.status === 'success' ? (result.latency! < 100 ? 'bg-green-500' : 'bg-yellow-500') :
                        result.status === 'error' ? 'bg-red-500' : 'bg-zinc-500 animate-pulse'
                      }`} />
                    <div>
                      <div className="text-sm font-medium">{result.name}</div>
                      <div className="text-[10px] text-muted-foreground">{result.host}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    {result.status === 'pending' ? (
                      <span className="text-xs text-muted-foreground">测试中...</span>
                    ) : (
                      <span className={`text-sm font-mono font-bold ${!result.latency ? 'text-red-500' :
                          result.latency < 100 ? 'text-green-500' :
                            result.latency < 300 ? 'text-yellow-500' : 'text-red-500'
                        }`}>
                        {result.latency ? `${result.latency}ms` : '超时'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-2xl p-6 border border-white/10 shadow-soft">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Radar className="text-indigo-500" size={20} />
                局域网扫描
              </h2>
              <button
                onClick={scanLan}
                disabled={isScanningLan || networkInfo.length === 0}
                className="px-4 py-2 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 transition-all text-sm font-medium flex items-center gap-2"
              >
                {isScanningLan ? <RefreshCw className="animate-spin" size={16} /> : <Zap size={16} />}
                开始扫描
              </button>
            </div>

            {isScanningLan ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-6">
                <div className="radar-container">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="radar-circle" style={{ inset: `${(i - 1) * 30}px`, opacity: 1 - i * 0.2 }} />
                  ))}
                  <div className="radar-sweep" />
                  <div className="radar-center" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-indigo-400 animate-pulse">正在扫描局域网设备...</p>
                  <p className="text-xs text-muted-foreground mt-1">这可能需要 5-10 秒时间</p>
                </div>
              </div>
            ) : lanDevices.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] text-muted-foreground uppercase tracking-widest border-b border-white/5">
                      <th className="pb-3 pl-2">设备名称</th>
                      <th className="pb-3">IP 地址</th>
                      <th className="pb-3">MAC 地址</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {lanDevices.map((device, idx) => (
                      <tr key={idx} className="group hover:bg-white/5 transition-all">
                        <td className="py-3 pl-2 flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-white/5 text-indigo-400">
                            {device.name.includes('Router') || device.name.includes('网关') ? <Server size={14} /> : <Monitor size={14} />}
                          </div>
                          <span className="font-medium">{device.name}</span>
                        </td>
                        <td className="py-3 font-mono text-xs">{device.ip}</td>
                        <td className="py-3 font-mono text-[10px] text-muted-foreground">{device.mac}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 bg-white/[0.02] rounded-xl border border-dashed border-white/10">
                <Monitor className="mx-auto text-zinc-600 mb-3" size={32} />
                <p className="text-sm text-muted-foreground">尚未进行局域网扫描</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-card rounded-2xl p-6 border border-white/10 shadow-soft">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <Activity className="text-emerald-500" size={20} />
              当前活跃网卡
            </h2>

            <div className="space-y-4">
              {networkInfo.length > 0 ? networkInfo.map((info, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {info.type === 'Wi-Fi' ? <Wifi size={16} className="text-emerald-500" /> : <Server size={16} className="text-emerald-500" />}
                      <span className="text-sm font-bold truncate max-w-[120px]">{info.name}</span>
                    </div>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-500 px-2 py-0.5 rounded-full font-bold uppercase">已连接</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">IPv4 地址</span>
                      <span className="font-mono text-emerald-400">{info.ip}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">链路速度</span>
                      <span className="font-medium">{info.speed}</span>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">获取网络信息中...</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-card rounded-2xl p-6 border border-white/10 shadow-soft space-y-4">
            <h2 className="text-sm font-bold flex items-center gap-2">
              <ShieldCheck className="text-blue-400" size={16} />
              网络安全提示
            </h2>
            <ul className="text-xs text-muted-foreground space-y-3 leading-relaxed">
              <li className="flex gap-2">
                <span className="text-blue-400">•</span>
                <span>局域网扫描会发送 ARP 探测包，这是正常的网络管理行为。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400">•</span>
                <span>请勿在公共 Wi-Fi 环境下频繁扫描，以免引起安全审计误报。</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400">•</span>
                <span>如果 Ping 测试全部超时，请检查您的防火墙设置。</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default NetworkRadarTool
