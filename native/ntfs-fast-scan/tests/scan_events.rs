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
