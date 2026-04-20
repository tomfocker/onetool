use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn create_temp_directory(test_name: &str) -> std::path::PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time")
        .as_nanos();
    let root = std::env::temp_dir().join(format!("ntfs-fast-scan-{test_name}-{unique}"));
    fs::create_dir_all(&root).expect("create temp root");
    root
}

fn cleanup_temp_directory(path: &std::path::Path) {
    let _ = fs::remove_dir_all(path);
}

fn stdout_lines(output: std::process::Output) -> Vec<String> {
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    String::from_utf8(output.stdout)
        .expect("stdout utf8")
        .lines()
        .map(ToOwned::to_owned)
        .collect()
}

fn json_string_literal(value: &str) -> String {
    let mut output = String::from("\"");

    for character in value.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            normal => output.push(normal),
        }
    }

    output.push('"');
    output
}

#[test]
fn emits_bridge_compatible_json_lines() {
    let output = Command::new(env!("CARGO_BIN_EXE_ntfs-fast-scan"))
        .env("NTFS_FAST_SCAN_TEST_SNAPSHOT", "sample")
        .args(["scan", "--root", r"C:\"])
        .output()
        .expect("run scanner");

    let lines = stdout_lines(output);
    assert_eq!(lines.len(), 4, "expected four JSONL events, got: {lines:?}");

    assert_eq!(
        lines
            .iter()
            .map(|line| {
                line.split("\"type\":\"")
                    .nth(1)
                    .and_then(|rest| rest.split('"').next())
                    .expect("type field")
                    .to_owned()
            })
            .collect::<Vec<_>>(),
        vec![
            "volume-info".to_owned(),
            "top-level-summary".to_owned(),
            "largest-files".to_owned(),
            "complete".to_owned(),
        ]
    );

    assert!(lines[0].contains("\"mode\":\"ntfs-fast\""));
    assert!(lines[0].contains("\"rootPath\":\"C:\\\\\""));
    assert!(lines[0].contains("\"filesystem\":\"NTFS\""));

    assert!(lines[1].contains("\"summary\":{"));
    assert!(lines[1].contains("\"scannedFiles\":2"));
    assert!(lines[1].contains("\"scannedDirectories\":2"));
    assert!(lines[1].contains("\"skippedEntries\":0"));
    assert!(lines[1].contains("\"largestFile\":{"));

    assert!(lines[2].contains("\"largestFiles\":["));
    assert!(lines[2].contains("\"name\":\"game.bin\""));
    assert!(lines[2].contains("\"extension\":\".bin\""));
    assert!(lines[2].contains(&json_string_literal(r"C:\Games\game.bin")));

    assert!(lines[3].contains("\"summary\":{"));
    assert!(lines[3].contains("\"largestFiles\":["));
    assert!(lines[3].contains("\"tree\":{"));
    assert!(lines[3].contains("\"id\":\"C:\\\\\""));
    assert!(lines[3].contains("\"childrenCount\":2"));
    assert!(lines[3].contains("\"fileCount\":2"));
    assert!(lines[3].contains("\"directoryCount\":1"));
    assert!(lines[3].contains("\"skippedChildren\":0"));
}

#[test]
fn rejects_non_root_paths_with_clear_error() {
    let root = create_temp_directory("non-root");

    let output = Command::new(env!("CARGO_BIN_EXE_ntfs-fast-scan"))
        .args(["scan", "--root"])
        .arg(&root)
        .output()
        .expect("run scanner");

    cleanup_temp_directory(&root);

    assert!(
        !output.status.success(),
        "stdout: {}",
        String::from_utf8_lossy(&output.stdout)
    );

    let stderr = String::from_utf8(output.stderr).expect("stderr utf8");
    assert!(
        stderr.contains("root path"),
        "expected root-path validation error, got: {stderr}"
    );
    assert!(
        stderr.contains("NTFS") || stderr.contains("volume root"),
        "expected NTFS/root wording, got: {stderr}"
    );
}
