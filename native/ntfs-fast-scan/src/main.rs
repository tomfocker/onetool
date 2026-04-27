mod aggregate;
mod events;
mod ntfs;

use std::env;
use std::io;
use std::path::PathBuf;
use std::process;

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let root = parse_args(env::args().skip(1))?;
    let mut stdout = io::stdout().lock();

    events::emit_event(
        &mut stdout,
        &events::ScanEvent::Progress {
            stage: "reading-mft".to_owned(),
            message: "正在读取 NTFS 元数据并筛选大文件".to_owned(),
        },
    )
    .map_err(|error| format!("failed to write event: {error}"))?;

    let snapshot = ntfs::scan_volume(&root).map_err(|error| format!("scan failed: {error}"))?;

    events::emit_event(
        &mut stdout,
        &events::ScanEvent::Progress {
            stage: "aggregating".to_owned(),
            message: "正在整理目录占用和大文件列表".to_owned(),
        },
    )
    .map_err(|error| format!("failed to write event: {error}"))?;

    for event in events::build_scan_events(&snapshot) {
        events::emit_event(&mut stdout, &event)
            .map_err(|error| format!("failed to write event: {error}"))?;
    }

    Ok(())
}

fn parse_args<I>(args: I) -> Result<PathBuf, String>
where
    I: IntoIterator<Item = String>,
{
    let mut args = args.into_iter();

    match (args.next().as_deref(), args.next().as_deref(), args.next()) {
        (Some("scan"), Some("--root"), Some(root_path)) if args.next().is_none() => {
            Ok(PathBuf::from(root_path))
        }
        _ => Err("usage: ntfs-fast-scan scan --root <path>".to_owned()),
    }
}
