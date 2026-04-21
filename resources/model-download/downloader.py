import argparse
import json
import os
import re
import sys

JSON_PREFIX = "__ONETOOL_JSON__"


def emit(event, message, **extra):
    payload = {"event": event, "message": message, **extra}
    print(f"{JSON_PREFIX}{json.dumps(payload, ensure_ascii=False)}", flush=True)


def sanitize_path(model_id):
    return re.sub(r'[\\/:*?"<>|]', "_", model_id)


def build_parser():
    parser = argparse.ArgumentParser(description="onetool model downloader")
    parser.add_argument("--platform", choices=["huggingface", "modelscope"], required=True)
    parser.add_argument("--repo-id", required=True)
    parser.add_argument("--save-path", required=True)
    parser.add_argument("--file-path", default="")
    parser.add_argument("--hf-token", default="")
    parser.add_argument("--hf-mirror", action="store_true")
    return parser


def main():
    args = build_parser().parse_args()

    if args.hf_mirror:
      os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
    else:
      os.environ.pop("HF_ENDPOINT", None)

    target_dir = os.path.join(args.save_path, sanitize_path(args.repo_id))
    os.makedirs(args.save_path, exist_ok=True)

    emit("log", f"准备下载到 {target_dir}", level="info")

    if args.platform == "huggingface":
        from huggingface_hub import hf_hub_download, snapshot_download

        if args.file_path:
            emit("log", f"开始下载 HuggingFace 单文件: {args.file_path}", level="info")
            hf_hub_download(
                repo_id=args.repo_id,
                filename=args.file_path,
                local_dir=target_dir,
                token=args.hf_token or None,
            )
        else:
            emit("log", "开始下载 HuggingFace 仓库快照", level="info")
            snapshot_download(
                repo_id=args.repo_id,
                local_dir=target_dir,
                token=args.hf_token or None,
            )
    else:
        from modelscope.hub.file_download import model_file_download
        from modelscope.hub.snapshot_download import snapshot_download

        if args.file_path:
            emit("log", f"开始下载 ModelScope 单文件: {args.file_path}", level="info")
            model_file_download(
                model_id=args.repo_id,
                file_path=args.file_path,
                local_dir=target_dir,
            )
        else:
            emit("log", "开始下载 ModelScope 仓库快照", level="info")
            snapshot_download(
                model_id=args.repo_id,
                local_dir=target_dir,
                cache_dir=os.path.join(args.save_path, ".modelscope-cache"),
            )

    emit("completed", "下载完成", outputPath=target_dir)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit("failed", str(error))
        raise
