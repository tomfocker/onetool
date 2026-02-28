const { spawn } = require('child_process');

function execPowerShell(script) {
  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-Command', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })

    const stdoutChunks = []
    const stderrChunks = []

    ps.stdout.on('data', (chunk) => stdoutChunks.push(chunk))
    ps.stderr.on('data', (chunk) => stderrChunks.push(chunk))

    ps.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8').trim()
      if (code !== 0 && !stdout) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8')
        console.error('Error:', stderr)
        resolve('')
      } else {
        console.log('Code:', code)
        resolve(stdout)
      }
    })

    const robustScript = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${script}`

    ps.stdin.write(robustScript)
    ps.stdin.end()
  })
}

async function test() {
  const winScript = `Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | ForEach-Object { @{ id = $_.Id; title = $_.MainWindowTitle; processName = $_.ProcessName; hwnd = $_.MainWindowHandle.ToInt64(); type = 'window' } } | ConvertTo-Json -Compress`;
  console.log("Running win script...");
  const res = await execPowerShell(winScript);
  console.log("Win Result Length:", res.length);
  // console.log("Win Result Snippet:", res.substring(0, 200));
  try {
    const parsed = JSON.parse(res);
    console.log("Parsed win results:", parsed.length);
  } catch (e) {
    console.error("Parse error:", e.message);
  }
}

test();
