import argparse
import importlib.util
import json
import os
import re
import sys
import time
from pathlib import Path

JSON_PREFIX = "__ONETOOL_JSON__"
OUTPUT_EXTENSIONS = (".xlsx", ".html", ".json")


def emit(event, message, **extra):
    payload = {"event": event, "message": message, **extra}
    print(f"{JSON_PREFIX}{json.dumps(payload, ensure_ascii=False)}", flush=True)


def has_module(name):
    return importlib.util.find_spec(name) is not None


def check_runtime():
    has_paddlex = has_module("paddlex")
    has_paddleocr = has_module("paddleocr")
    has_openpyxl = has_module("openpyxl")
    missing = []

    if not has_paddlex and not has_paddleocr:
        missing.append("paddlex 或 paddleocr")
    if not has_openpyxl:
        missing.append("openpyxl")

    return {
        "ready": not missing,
        "missingPackages": missing,
    }


def sanitize_stem(name):
    stem = Path(name).stem if name else f"table-{int(time.time())}"
    cleaned = re.sub(r'[\\/:*?"<>|]+', "_", stem).strip(" ._")
    return cleaned or f"table-{int(time.time())}"


def list_outputs(output_dir):
    root = Path(output_dir)
    if not root.exists():
        return set()
    return {
        str(path.resolve())
        for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in OUTPUT_EXTENSIONS
    }


def newest_file(paths, extension):
    candidates = [Path(path) for path in paths if Path(path).suffix.lower() == extension]
    if not candidates:
        return None
    return str(max(candidates, key=lambda item: item.stat().st_mtime).resolve())


def call_save(result, method_name, output_dir):
    method = getattr(result, method_name, None)
    if method is None:
        return

    try:
        method(output_dir)
        return
    except TypeError:
        pass

    method(save_path=output_dir)


def simplify_json(value):
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        return {str(key): simplify_json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [simplify_json(item) for item in value]
    if hasattr(value, "tolist"):
        return simplify_json(value.tolist())
    return str(value)


def run_paddlex(input_path, output_dir):
    from paddlex import create_pipeline

    emit("log", "使用 PaddleX 表格识别管线", level="info")
    pipeline = create_pipeline(pipeline="table_recognition")
    results = pipeline.predict(input=input_path)

    saved_any = False
    for result in results:
        call_save(result, "save_to_xlsx", output_dir)
        call_save(result, "save_to_html", output_dir)
        call_save(result, "save_to_json", output_dir)
        saved_any = True

    if not saved_any:
        raise RuntimeError("PaddleX 未返回表格识别结果")


def run_paddleocr(input_path, output_dir, file_stem):
    from paddleocr import PPStructure, save_structure_res

    emit("log", "使用 PaddleOCR PP-Structure 表格识别管线", level="info")
    engine = PPStructure(show_log=False, table=True, ocr=True, layout=False)
    result = engine(input_path)
    save_structure_res(result, output_dir, file_stem)

    json_path = Path(output_dir) / f"{file_stem}.json"
    with json_path.open("w", encoding="utf-8") as handle:
        json.dump(simplify_json(result), handle, ensure_ascii=False, indent=2)


def recognize(input_path, output_dir, file_name):
    runtime = check_runtime()
    if not runtime["ready"]:
        emit("failed", f"表格 OCR 运行时缺少依赖: {', '.join(runtime['missingPackages'])}", **runtime)
        return 1

    input_file = Path(input_path)
    if not input_file.exists():
        emit("failed", f"图片不存在: {input_path}")
        return 1

    os.makedirs(output_dir, exist_ok=True)
    before = list_outputs(output_dir)
    file_stem = sanitize_stem(file_name or input_file.name)

    if has_module("paddlex"):
        run_paddlex(str(input_file), output_dir)
    else:
        run_paddleocr(str(input_file), output_dir, file_stem)

    after = list_outputs(output_dir)
    created = after - before
    output_path = newest_file(created, ".xlsx") or newest_file(after, ".xlsx")
    html_path = newest_file(created, ".html") or newest_file(after, ".html")
    json_path = newest_file(created, ".json") or newest_file(after, ".json")

    if not output_path:
        emit("failed", "表格识别完成，但没有生成 Excel 文件")
        return 1

    emit(
        "completed",
        "表格识别完成",
        outputPath=output_path,
        htmlPath=html_path,
        jsonPath=json_path,
    )
    return 0


def build_parser():
    parser = argparse.ArgumentParser(description="onetool local table OCR")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--input", default="")
    parser.add_argument("--output-dir", default="")
    parser.add_argument("--file-name", default="")
    return parser


def main():
    args = build_parser().parse_args()
    if args.check:
        runtime = check_runtime()
        emit("completed", "运行时检查完成", **runtime)
        return 0

    if not args.input:
        emit("failed", "请输入图片路径")
        return 1
    if not args.output_dir:
        emit("failed", "请选择输出目录")
        return 1

    return recognize(args.input, args.output_dir, args.file_name)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:
        emit("failed", str(error))
        raise
