use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn write_file(path: &Path, bytes: usize) {
    fs::write(path, vec![b'x'; bytes]).expect("write test file");
}

fn create_temp_scan_root(test_name: &str) -> std::path::PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time")
        .as_nanos();
    let root = std::env::temp_dir().join(format!("ntfs-fast-scan-{test_name}-{unique}"));
    fs::create_dir_all(&root).expect("create temp root");
    root
}

fn cleanup_temp_scan_root(path: &Path) {
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
fn emits_events_in_expected_sequence() {
    let root = create_temp_scan_root("sequence");
    let games = root.join("Games");
    fs::create_dir(&games).expect("create directory");
    write_file(&games.join("game.bin"), 32);
    write_file(&root.join("notes.txt"), 8);

    let output = Command::new(env!("CARGO_BIN_EXE_ntfs-fast-scan"))
        .args(["scan", "--root"])
        .arg(&root)
        .output()
        .expect("run scanner");

    let lines = stdout_lines(output);
    cleanup_temp_scan_root(&root);

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
            "complete".to_owned()
        ]
    );
}

#[test]
fn serializes_summary_payloads_as_json_lines() {
    let root = create_temp_scan_root("payloads");
    let media = root.join("Media");
    fs::create_dir(&media).expect("create directory");
    write_file(&media.join("movie.mkv"), 64);
    write_file(&root.join("todo.txt"), 12);

    let output = Command::new(env!("CARGO_BIN_EXE_ntfs-fast-scan"))
        .args(["scan", "--root"])
        .arg(&root)
        .output()
        .expect("run scanner");

    let lines = stdout_lines(output);
    cleanup_temp_scan_root(&root);

    let top_level = &lines[1];
    let largest_files = &lines[2];
    let complete = &lines[3];

    assert!(top_level.contains("\"directories\":["));
    assert!(top_level.contains("\"filesScanned\":2"));
    assert!(largest_files.contains("\"items\":["));
    assert!(largest_files.contains(&json_string_literal(
        media.join("movie.mkv").to_string_lossy().as_ref()
    )));
    assert!(complete.contains("\"totalBytes\":76"));
    assert!(complete.contains("\"type\":\"directory\""));
}
