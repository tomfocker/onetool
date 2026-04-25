import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path
from urllib.parse import unquote, urljoin, urldefrag, urlparse

JSON_PREFIX = "__ONETOOL_JSON__"
PIP_SIMPLE_INDEX_URLS = [
    "https://pypi.tuna.tsinghua.edu.cn/simple/pip/",
    "https://pypi.org/simple/pip/",
]
PYTHON_EMBED_URL_TEMPLATES = [
    "https://mirrors.huaweicloud.com/python/{version}/python-{version}-embed-amd64.zip",
    "https://mirrors.tuna.tsinghua.edu.cn/python/{version}/python-{version}-embed-amd64.zip",
    "https://www.python.org/ftp/python/{version}/python-{version}-embed-amd64.zip",
]

RUNTIME_PACKAGES = [
    "numpy<2",
    "protobuf>=3.20.2,<3.21",
    "openpyxl>=3.1,<4",
    "pillow>=10,<11",
    "paddlepaddle==2.6.2",
    "paddleocr==2.7.3",
]

CN_INDEX_ARGS = [
    "--index-url",
    "https://pypi.tuna.tsinghua.edu.cn/simple",
    "--extra-index-url",
    "https://www.paddlepaddle.org.cn/packages/stable/cpu/",
]
PIP_NETWORK_ARGS = ["--retries", "5", "--timeout", "120"]


def emit(event, message, **extra):
    payload = {"event": event, "message": message, **extra}
    print(f"{JSON_PREFIX}{json.dumps(payload, ensure_ascii=False)}", flush=True)


def run_command(command, description, extra_env=None):
    emit("log", description, level="info")
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        env={**os.environ, "PYTHONIOENCODING": "utf-8", **(extra_env or {})},
    )

    assert process.stdout is not None
    for line in process.stdout:
        stripped = line.strip()
        if stripped:
            emit("log", stripped, level="progress")

    code = process.wait()
    if code != 0:
        raise RuntimeError(f"{description}失败，退出码: {code}")


def has_module(name):
    return importlib.util.find_spec(name) is not None


def embedded_stdlib_zip_name():
    return f"python{sys.version_info.major}{sys.version_info.minor}.zip"


def embedded_python_version():
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"


def ensure_standard_library():
    if has_module("unittest"):
        emit("log", "Python 标准库已完整", level="info")
        return

    zip_name = embedded_stdlib_zip_name()
    target_zip = Path(sys.executable).with_name(zip_name)
    if target_zip.exists():
        emit("log", f"标准库 zip 已存在: {zip_name}", level="info")
        return

    emit("log", f"Python 标准库缺失，正在补齐 {zip_name}", level="info")
    with tempfile.TemporaryDirectory() as temp_dir:
        embed_zip = Path(temp_dir) / f"python-embed-{embedded_python_version()}.zip"
        download_python_embed_zip(embed_zip)
        with zipfile.ZipFile(embed_zip) as archive:
            try:
                archive.extract(zip_name, target_zip.parent)
            except KeyError as error:
                raise RuntimeError(f"Python embeddable 包中缺少 {zip_name}") from error


def download_python_embed_zip(target_path):
    last_error = None
    version = embedded_python_version()
    for template in PYTHON_EMBED_URL_TEMPLATES:
        url = template.format(version=version)
        try:
            emit("log", f"下载 Python 标准库: {url}", level="info")
            download_url(url, target_path, timeout=180)
            return target_path
        except Exception as error:
            last_error = error
            emit("log", f"Python 标准库镜像不可用，尝试下一个源: {error}", level="progress")

    raise RuntimeError(f"下载 Python 标准库失败: {last_error}")


def has_pip():
    result = subprocess.run(
        [sys.executable, "-m", "pip", "--version"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.returncode == 0


def ensure_pip():
    if has_pip():
        emit("log", "pip 已可用", level="info")
        return

    emit("log", "pip 不可用，正在从国内镜像下载 pip wheel", level="info")
    with tempfile.TemporaryDirectory() as temp_dir:
        pip_wheel_path = download_pip_wheel(Path(temp_dir))
        run_command(
            [
                sys.executable,
                "-m",
                "pip",
                "install",
                "--no-index",
                "--force-reinstall",
                "--no-warn-script-location",
                str(pip_wheel_path),
            ],
            "安装 pip",
            extra_env={"PYTHONPATH": str(pip_wheel_path)},
        )


def download_url(url, target_path, timeout=120):
    request = urllib.request.Request(url, headers={"User-Agent": "onetool-table-ocr-runtime"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        target_path.write_bytes(response.read())


def find_latest_pip_wheel_url(simple_index_url):
    request = urllib.request.Request(simple_index_url, headers={"User-Agent": "onetool-table-ocr-runtime"})
    with urllib.request.urlopen(request, timeout=60) as response:
        html = response.read().decode("utf-8", errors="ignore")

    links = re.findall(r'href=[\'"]([^\'"]+pip-[^\'"]+-py3-none-any\.whl[^\'"]*)[\'"]', html, flags=re.IGNORECASE)
    if not links:
        raise RuntimeError("未在 pip 镜像索引中找到 wheel")

    wheel_urls = [urldefrag(urljoin(simple_index_url, link))[0] for link in links]
    return wheel_urls[-1]


def wheel_filename_from_url(wheel_url):
    clean_url = urldefrag(wheel_url)[0]
    filename = unquote(Path(urlparse(clean_url).path).name)
    if not re.match(r"^pip-[^-]+-py3-none-any\.whl$", filename, flags=re.IGNORECASE):
        raise RuntimeError(f"pip wheel 文件名异常: {filename or wheel_url}")
    return filename


def download_pip_wheel(temp_dir):
    last_error = None

    for index_url in PIP_SIMPLE_INDEX_URLS:
        try:
            emit("log", f"查询 pip 镜像: {index_url}", level="info")
            wheel_url = find_latest_pip_wheel_url(index_url)
            target_path = temp_dir / wheel_filename_from_url(wheel_url)
            emit("log", f"下载 pip wheel: {wheel_url}", level="info")
            download_url(wheel_url, target_path)
            return target_path
        except Exception as error:
            last_error = error
            emit("log", f"pip 镜像不可用，尝试下一个源: {error}", level="progress")

    raise RuntimeError(f"下载 pip wheel 失败: {last_error}")


def build_pip_args(mirror):
    if mirror == "cn":
        return CN_INDEX_ARGS
    return []


def install_packages(mirror):
    index_args = build_pip_args(mirror)
    if mirror == "cn":
        emit("log", "使用国内镜像：清华 PyPI + 飞桨官方 CPU 包源", level="info")
    else:
        emit("log", "使用默认 PyPI 源", level="info")

    run_command(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "--no-warn-script-location",
            "--force-reinstall",
            "--prefer-binary",
            *PIP_NETWORK_ARGS,
            *index_args,
            "setuptools>=67",
            "wheel>=0.40",
        ],
        "更新安装基础组件",
    )
    run_command(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "--no-warn-script-location",
            "--prefer-binary",
            *PIP_NETWORK_ARGS,
            *index_args,
            *RUNTIME_PACKAGES,
        ],
        "安装表格 OCR 依赖",
    )


def verify_runtime():
    command = [
        sys.executable,
        "-c",
        "import openpyxl; from paddleocr import PPStructure, save_structure_res; PPStructure(show_log=False, table=True, ocr=True, layout=False); print('ok')",
    ]
    run_command(command, "校验并预热表格 OCR 模型")


def build_parser():
    parser = argparse.ArgumentParser(description="Prepare onetool local table OCR runtime")
    parser.add_argument("--mirror", choices=["cn", "default"], default="cn")
    return parser


def main():
    args = build_parser().parse_args()
    emit("log", f"Python: {sys.executable}", level="info")
    ensure_standard_library()
    ensure_pip()
    install_packages(args.mirror)
    verify_runtime()
    emit("completed", "本地表格 OCR 运行时已准备完成", level="success")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        emit("failed", str(error), level="error")
        raise
