const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function findPython() {
  const bundledPython = path.resolve(__dirname, '../../../resources/model-download/python/python.exe')
  if (fs.existsSync(bundledPython)) {
    return bundledPython
  }
  return process.platform === 'win32' ? 'python' : 'python3'
}

test('install_runtime saves downloaded pip wheel with the original wheel filename', () => {
  const installScript = path.resolve(__dirname, '../../../resources/table-ocr/install_runtime.py')
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'onetool-install-runtime-test-'))
  const probeScript = path.join(tempRoot, 'probe.py')

  fs.writeFileSync(
    probeScript,
    [
      'import importlib.util',
      'from pathlib import Path',
      `spec = importlib.util.spec_from_file_location("install_runtime", ${JSON.stringify(installScript)})`,
      'module = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(module)',
      'module.PIP_SIMPLE_INDEX_URLS = ["https://mirror.example/simple/pip/"]',
      'module.find_latest_pip_wheel_url = lambda _: "https://mirror.example/packages/pip-26.0.1-py3-none-any.whl#sha256=abc"',
      'module.download_url = lambda _url, target_path: Path(target_path).write_bytes(b"wheel")',
      `print(module.download_pip_wheel(Path(${JSON.stringify(tempRoot)})).name)`,
    ].join('\n'),
    'utf8'
  )

  const result = spawnSync(findPython(), [probeScript], {
    encoding: 'utf8',
    windowsHide: true,
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(result.stdout.trim().split(/\r?\n/).at(-1), 'pip-26.0.1-py3-none-any.whl')
})

test('install_runtime emits JSON logs safely on non-UTF-8 consoles', () => {
  const installScript = path.resolve(__dirname, '../../../resources/table-ocr/install_runtime.py')
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'onetool-install-runtime-test-'))
  const probeScript = path.join(tempRoot, 'probe.py')

  fs.writeFileSync(
    probeScript,
    [
      'import importlib.util',
      `spec = importlib.util.spec_from_file_location("install_runtime", ${JSON.stringify(installScript)})`,
      'module = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(module)',
      'module.emit("log", "查询 pip 镜像", level="info")',
    ].join('\n'),
    'utf8'
  )

  const result = spawnSync(findPython(), [probeScript], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'cp1252' },
    windowsHide: true,
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const logLine = result.stdout.trim().split(/\r?\n/).at(-1).replace('__ONETOOL_JSON__', '')
  assert.equal(JSON.parse(logLine).message, '查询 pip 镜像')
})

test('install_runtime force-installs pip when bootstrapping from the pip wheel', () => {
  const installScript = path.resolve(__dirname, '../../../resources/table-ocr/install_runtime.py')
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'onetool-install-runtime-test-'))
  const probeScript = path.join(tempRoot, 'probe.py')

  fs.writeFileSync(
    probeScript,
    [
      'import importlib.util',
      'import json',
      'from pathlib import Path',
      `spec = importlib.util.spec_from_file_location("install_runtime", ${JSON.stringify(installScript)})`,
      'module = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(module)',
      'captured = {}',
      'module.has_pip = lambda: False',
      `module.download_pip_wheel = lambda _temp_dir: Path(${JSON.stringify(path.join(tempRoot, 'pip-26.0.1-py3-none-any.whl'))})`,
      'module.run_command = lambda command, description, extra_env=None: captured.update({"command": command, "description": description, "extra_env": extra_env})',
      'module.ensure_pip()',
      'print(json.dumps(captured, ensure_ascii=True))',
    ].join('\n'),
    'utf8'
  )

  const result = spawnSync(findPython(), [probeScript], {
    encoding: 'utf8',
    windowsHide: true,
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1))
  assert.ok(payload.command.includes('--force-reinstall'))
  assert.match(payload.extra_env.PYTHONPATH, /pip-26\.0\.1-py3-none-any\.whl$/)
})

test('install_runtime force-reinstalls setuptools and wheel before OCR packages', () => {
  const installScript = path.resolve(__dirname, '../../../resources/table-ocr/install_runtime.py')
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'onetool-install-runtime-test-'))
  const probeScript = path.join(tempRoot, 'probe.py')

  fs.writeFileSync(
    probeScript,
    [
      'import importlib.util',
      'import json',
      `spec = importlib.util.spec_from_file_location("install_runtime", ${JSON.stringify(installScript)})`,
      'module = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(module)',
      'commands = []',
      'module.run_command = lambda command, description, extra_env=None: commands.append({"command": command, "description": description})',
      'module.install_packages("cn")',
      'print(json.dumps(commands, ensure_ascii=True))',
    ].join('\n'),
    'utf8'
  )

  const result = spawnSync(findPython(), [probeScript], {
    encoding: 'utf8',
    windowsHide: true,
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const commands = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1))
  assert.ok(commands[0].command.includes('--force-reinstall'))
  assert.ok(commands[0].command.includes('setuptools>=67'))
  assert.ok(commands[0].command.includes('wheel>=0.40'))
  assert.ok(!commands[1].command.includes('--force-reinstall'))
})

test('install_runtime restores the embedded Python stdlib zip when unittest is missing', () => {
  const installScript = path.resolve(__dirname, '../../../resources/table-ocr/install_runtime.py')
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'onetool-install-runtime-test-'))
  const probeScript = path.join(tempRoot, 'probe.py')
  const fakePython = path.join(tempRoot, 'python.exe')

  fs.writeFileSync(
    probeScript,
    [
      'import importlib.util',
      'import zipfile',
      'from pathlib import Path',
      `spec = importlib.util.spec_from_file_location("install_runtime", ${JSON.stringify(installScript)})`,
      'module = importlib.util.module_from_spec(spec)',
      'spec.loader.exec_module(module)',
      'module.has_module = lambda name: False',
      `module.sys.executable = ${JSON.stringify(fakePython)}`,
      'def fake_download(_target_path):',
      '    with zipfile.ZipFile(_target_path, "w") as archive:',
      '        archive.writestr(module.embedded_stdlib_zip_name(), "stdlib")',
      'module.download_python_embed_zip = fake_download',
      'module.ensure_standard_library()',
      `print((Path(${JSON.stringify(tempRoot)}) / module.embedded_stdlib_zip_name()).read_text())`,
    ].join('\n'),
    'utf8'
  )

  const result = spawnSync(findPython(), [probeScript], {
    encoding: 'utf8',
    windowsHide: true,
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.equal(result.stdout.trim().split(/\r?\n/).at(-1), 'stdlib')
})
