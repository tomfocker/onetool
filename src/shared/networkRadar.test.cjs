const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildLatencyProbeHosts,
  buildNetworkProbeHosts,
  formatPingLatency,
  parsePingOutput,
  pickPreferredLanInterface
} = require('./networkRadar.ts')

test('parsePingOutput extracts latency from successful ping output', () => {
  const output = `
Pinging 127.0.0.1 with 32 bytes of data:
Reply from 127.0.0.1: bytes=32 time<1ms TTL=128

Ping statistics for 127.0.0.1:
    Packets: Sent = 1, Received = 1, Lost = 0 (0% loss),
Approximate round trip times in milli-seconds:
    Minimum = 0ms, Maximum = 0ms, Average = 0ms
`

  assert.deepEqual(parsePingOutput(output), { alive: true, time: 1 })
})

test('parsePingOutput marks timed out ping output as unreachable', () => {
  const output = `
Pinging 114.114.114.114 with 32 bytes of data:
Request timed out.

Ping statistics for 114.114.114.114:
    Packets: Sent = 1, Received = 0, Lost = 1 (100% loss),
`

  assert.deepEqual(parsePingOutput(output), { alive: false, time: null })
})

test('pickPreferredLanInterface prefers physical adapters over virtual private networks', () => {
  const interfaces = [
    {
      name: 'VirtualBox Host-Only Network',
      description: 'VirtualBox Host-Only Ethernet Adapter',
      type: '以太网',
      speed: '1 Gbps',
      ip: '192.168.56.1'
    },
    {
      name: '以太网',
      description: 'Intel(R) Ethernet Controller I226-LM',
      type: '以太网',
      speed: '100 Mbps',
      ip: '10.10.158.165'
    },
    {
      name: 'vEthernet (WSL)',
      description: 'Hyper-V Virtual Ethernet Adapter',
      type: '以太网',
      speed: '10 Gbps',
      ip: '172.30.96.1'
    }
  ]

  assert.equal(pickPreferredLanInterface(interfaces)?.ip, '10.10.158.165')
})

test('buildNetworkProbeHosts includes loopback and the preferred interface address', () => {
  const interfaces = [
    {
      name: 'VMware Network Adapter VMnet1',
      description: 'VMware Virtual Ethernet Adapter for VMnet1',
      type: '以太网',
      speed: '100 Mbps',
      ip: '192.168.222.1'
    },
    {
      name: '以太网',
      description: 'Intel(R) Ethernet Controller I226-LM',
      type: '以太网',
      speed: '100 Mbps',
      ip: '10.10.158.165'
    }
  ]

  assert.deepEqual(buildNetworkProbeHosts(interfaces).slice(0, 2), [
    { host: '127.0.0.1', name: '本机回环' },
    { host: '10.10.158.165', name: '当前网卡' }
  ])
})

test('buildLatencyProbeHosts only returns external probe targets', () => {
  assert.deepEqual(buildLatencyProbeHosts(), [
    { host: '223.5.5.5', name: '阿里云 DNS' },
    { host: '119.29.29.29', name: '腾讯 DNS' },
    { host: '180.76.76.76', name: '百度 DNS' },
    { host: '1.1.1.1', name: 'Cloudflare DNS' },
    { host: '8.8.8.8', name: 'Google DNS' }
  ])
})

test('formatPingLatency preserves zero-millisecond results', () => {
  assert.equal(formatPingLatency(0), '0ms')
  assert.equal(formatPingLatency(null), '超时')
})
