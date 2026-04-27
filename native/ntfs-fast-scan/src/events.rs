use std::io::{self, Write};

use crate::aggregate;
use crate::ntfs::ScanSnapshot;

#[derive(Clone, Debug)]
pub struct LargestFile {
    pub path: String,
    pub name: String,
    pub size_bytes: u64,
    pub extension: Option<String>,
}

#[derive(Clone, Debug)]
pub struct ScanSummary {
    pub total_bytes: u64,
    pub scanned_files: u64,
    pub scanned_directories: u64,
    pub skipped_entries: u64,
    pub largest_file: Option<LargestFile>,
}

#[derive(Clone, Debug)]
pub struct TreeNode {
    pub id: String,
    pub name: String,
    pub path: String,
    pub node_type: String,
    pub size_bytes: u64,
    pub children_count: u64,
    pub file_count: u64,
    pub directory_count: u64,
    pub skipped_children: u64,
    pub extension: Option<String>,
    pub children: Vec<TreeNode>,
}

#[derive(Clone, Debug)]
pub enum ScanEvent {
    Progress {
        stage: String,
        message: String,
    },
    VolumeInfo {
        mode: String,
        root_path: String,
        filesystem: String,
    },
    TopLevelSummary {
        summary: ScanSummary,
    },
    LargestFiles {
        largest_files: Vec<LargestFile>,
    },
    TreeUpdate {
        summary: ScanSummary,
        tree: TreeNode,
    },
    Complete {
        summary: ScanSummary,
        largest_files: Vec<LargestFile>,
        tree: TreeNode,
    },
}

impl ScanEvent {
    pub fn event_type(&self) -> &'static str {
        match self {
            ScanEvent::Progress { .. } => "scan-progress",
            ScanEvent::VolumeInfo { .. } => "volume-info",
            ScanEvent::TopLevelSummary { .. } => "top-level-summary",
            ScanEvent::LargestFiles { .. } => "largest-files",
            ScanEvent::TreeUpdate { .. } => "tree-update",
            ScanEvent::Complete { .. } => "complete",
        }
    }

    pub fn to_json_line(&self) -> String {
        match self {
            ScanEvent::Progress { stage, message } => json_object([
                ("type", json_string(self.event_type())),
                ("stage", json_string(stage)),
                ("message", json_string(message)),
            ]),
            ScanEvent::VolumeInfo {
                mode,
                root_path,
                filesystem,
            } => json_object([
                ("type", json_string(self.event_type())),
                ("mode", json_string(mode)),
                ("rootPath", json_string(root_path)),
                ("filesystem", json_string(filesystem)),
            ]),
            ScanEvent::TopLevelSummary { summary } => json_object([
                ("type", json_string(self.event_type())),
                ("summary", summary.to_json()),
            ]),
            ScanEvent::LargestFiles { largest_files } => json_object([
                ("type", json_string(self.event_type())),
                (
                    "largestFiles",
                    json_array(largest_files.iter().map(LargestFile::to_json)),
                ),
            ]),
            ScanEvent::TreeUpdate { summary, tree } => json_object([
                ("type", json_string(self.event_type())),
                ("summary", summary.to_json()),
                ("tree", tree.to_json()),
            ]),
            ScanEvent::Complete {
                summary,
                largest_files,
                tree,
            } => json_object([
                ("type", json_string(self.event_type())),
                ("summary", summary.to_json()),
                (
                    "largestFiles",
                    json_array(largest_files.iter().map(LargestFile::to_json)),
                ),
                ("tree", tree.to_json()),
            ]),
        }
    }
}

impl LargestFile {
    fn to_json(&self) -> String {
        json_object([
            ("path", json_string(&self.path)),
            ("name", json_string(&self.name)),
            ("sizeBytes", self.size_bytes.to_string()),
            ("extension", json_nullable_string(self.extension.as_deref())),
        ])
    }
}

impl ScanSummary {
    fn to_json(&self) -> String {
        json_object([
            ("totalBytes", self.total_bytes.to_string()),
            ("scannedFiles", self.scanned_files.to_string()),
            ("scannedDirectories", self.scanned_directories.to_string()),
            ("skippedEntries", self.skipped_entries.to_string()),
            (
                "largestFile",
                self.largest_file
                    .as_ref()
                    .map(LargestFile::to_json)
                    .unwrap_or_else(|| "null".to_owned()),
            ),
        ])
    }
}

impl TreeNode {
    fn to_json(&self) -> String {
        let mut fields = vec![
            ("id", json_string(&self.id)),
            ("name", json_string(&self.name)),
            ("path", json_string(&self.path)),
            ("type", json_string(&self.node_type)),
            ("sizeBytes", self.size_bytes.to_string()),
            ("childrenCount", self.children_count.to_string()),
            ("fileCount", self.file_count.to_string()),
            ("directoryCount", self.directory_count.to_string()),
            ("skippedChildren", self.skipped_children.to_string()),
        ];

        if self.node_type == "file" || self.extension.is_some() {
            fields.push(("extension", json_nullable_string(self.extension.as_deref())));
        }

        if self.node_type == "directory" {
            fields.push((
                "children",
                json_array(self.children.iter().map(TreeNode::to_json)),
            ));
        }

        json_object_dynamic(fields)
    }
}

pub fn build_scan_events(snapshot: &ScanSnapshot) -> Vec<ScanEvent> {
    let largest_files = aggregate::largest_files(snapshot, 50);
    let summary = aggregate::summary(snapshot, &largest_files);
    let tree = aggregate::tree(snapshot);

    vec![
        ScanEvent::VolumeInfo {
            mode: "ntfs-fast".to_owned(),
            root_path: snapshot.root_path.clone(),
            filesystem: snapshot.filesystem.clone(),
        },
        ScanEvent::TopLevelSummary {
            summary: summary.clone(),
        },
        ScanEvent::LargestFiles {
            largest_files: largest_files.clone(),
        },
        ScanEvent::Complete {
            summary,
            largest_files,
            tree,
        },
    ]
}

pub fn build_tree_update_event(snapshot: &ScanSnapshot) -> ScanEvent {
    let largest_files = aggregate::largest_files(snapshot, 20);
    let summary = aggregate::summary(snapshot, &largest_files);
    let tree = aggregate::tree(snapshot);

    ScanEvent::TreeUpdate { summary, tree }
}

pub fn emit_event<W: Write>(writer: &mut W, event: &ScanEvent) -> io::Result<()> {
    writeln!(writer, "{}", event.to_json_line())?;
    writer.flush()
}

fn json_object<const N: usize>(fields: [(&str, String); N]) -> String {
    json_object_dynamic(fields.into_iter().collect())
}

fn json_object_dynamic(fields: Vec<(&str, String)>) -> String {
    let mut output = String::from("{");

    for (index, (key, value)) in fields.into_iter().enumerate() {
        if index > 0 {
            output.push(',');
        }

        output.push('"');
        output.push_str(key);
        output.push_str("\":");
        output.push_str(&value);
    }

    output.push('}');
    output
}

fn json_array<I>(items: I) -> String
where
    I: IntoIterator<Item = String>,
{
    let mut output = String::from("[");

    for (index, item) in items.into_iter().enumerate() {
        if index > 0 {
            output.push(',');
        }

        output.push_str(&item);
    }

    output.push(']');
    output
}

fn json_nullable_string(value: Option<&str>) -> String {
    value.map(json_string).unwrap_or_else(|| "null".to_owned())
}

fn json_string(value: &str) -> String {
    let mut output = String::with_capacity(value.len() + 2);
    output.push('"');

    for character in value.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            control if control.is_control() => {
                output.push_str(&format!("\\u{:04x}", control as u32));
            }
            normal => output.push(normal),
        }
    }

    output.push('"');
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ntfs::{EntryKind, ScanEntry, ScanSnapshot};

    fn sample_snapshot() -> ScanSnapshot {
        ScanSnapshot {
            root_path: r"C:\".to_owned(),
            filesystem: "NTFS".to_owned(),
            root: ScanEntry {
                path: r"C:\".to_owned(),
                name: r"C:\".to_owned(),
                kind: EntryKind::Directory,
                size_bytes: 40,
                skipped_children: 0,
                children: vec![
                    ScanEntry {
                        path: r"C:\Games".to_owned(),
                        name: "Games".to_owned(),
                        kind: EntryKind::Directory,
                        size_bytes: 32,
                        skipped_children: 0,
                        children: vec![ScanEntry {
                            path: r"C:\Games\game.bin".to_owned(),
                            name: "game.bin".to_owned(),
                            kind: EntryKind::File,
                            size_bytes: 32,
                            skipped_children: 0,
                            children: Vec::new(),
                        }],
                    },
                    ScanEntry {
                        path: r"C:\notes.txt".to_owned(),
                        name: "notes.txt".to_owned(),
                        kind: EntryKind::File,
                        size_bytes: 8,
                        skipped_children: 0,
                        children: Vec::new(),
                    },
                ],
            },
            files_scanned: 2,
            skipped_entries: 0,
        }
    }

    fn partial_snapshot() -> ScanSnapshot {
        ScanSnapshot {
            root_path: r"C:\".to_owned(),
            filesystem: "NTFS".to_owned(),
            root: ScanEntry {
                path: r"C:\".to_owned(),
                name: r"C:\".to_owned(),
                kind: EntryKind::Directory,
                size_bytes: 8,
                skipped_children: 1,
                children: vec![ScanEntry {
                    path: r"C:\notes.txt".to_owned(),
                    name: "notes.txt".to_owned(),
                    kind: EntryKind::File,
                    size_bytes: 8,
                    skipped_children: 0,
                    children: Vec::new(),
                }],
            },
            files_scanned: 1,
            skipped_entries: 1,
        }
    }

    #[test]
    fn serializes_scan_progress_stage_events() {
        let event = ScanEvent::Progress {
            stage: "reading-mft".to_owned(),
            message: "正在读取 NTFS 元数据并筛选大文件".to_owned(),
        };

        assert_eq!(event.event_type(), "scan-progress");
        assert_eq!(
            event.to_json_line(),
            r#"{"type":"scan-progress","stage":"reading-mft","message":"正在读取 NTFS 元数据并筛选大文件"}"#
        );
    }

    #[test]
    fn serializes_tree_update_events_for_progressive_rendering() {
        let event = build_tree_update_event(&sample_snapshot());

        assert_eq!(event.event_type(), "tree-update");
        let line = event.to_json_line();
        assert!(line.contains(r#""type":"tree-update""#));
        assert!(line.contains(r#""summary":{"#));
        assert!(line.contains(r#""tree":{"#));
        assert!(line.contains(r#""children":["#));
    }

    #[test]
    fn emits_events_in_expected_sequence() {
        let event_types = build_scan_events(&sample_snapshot())
            .into_iter()
            .map(|event| event.event_type().to_owned())
            .collect::<Vec<_>>();

        assert_eq!(
            event_types,
            vec![
                "volume-info".to_owned(),
                "top-level-summary".to_owned(),
                "largest-files".to_owned(),
                "complete".to_owned(),
            ]
        );
    }

    #[test]
    fn serializes_session_compatible_payloads_as_json_lines() {
        let events = build_scan_events(&sample_snapshot());
        let top_level = events[1].to_json_line();
        let largest_files = events[2].to_json_line();
        let complete = events[3].to_json_line();

        assert!(top_level.contains("\"summary\":{"));
        assert!(top_level.contains("\"scannedFiles\":2"));
        assert!(top_level.contains("\"scannedDirectories\":2"));
        assert!(top_level.contains("\"skippedEntries\":0"));
        assert!(top_level.contains("\"largestFile\":{"));

        assert!(largest_files.contains("\"largestFiles\":["));
        assert!(largest_files.contains(&json_string(r"C:\Games\game.bin")));
        assert!(largest_files.contains("\"name\":\"game.bin\""));
        assert!(largest_files.contains("\"extension\":\".bin\""));

        assert!(complete.contains("\"totalBytes\":40"));
        assert!(complete.contains("\"largestFiles\":["));
        assert!(complete.contains("\"id\":\"C:\\\\\""));
        assert!(complete.contains("\"type\":\"directory\""));
        assert!(complete.contains("\"childrenCount\":2"));
        assert!(complete.contains("\"fileCount\":2"));
        assert!(complete.contains("\"directoryCount\":1"));
        assert!(complete.contains("\"skippedChildren\":0"));
    }

    #[test]
    fn emit_event_writes_newline_delimited_json_output() {
        let events = build_scan_events(&sample_snapshot());
        let mut output = Vec::new();

        for event in &events {
            emit_event(&mut output, event).expect("emit event");
        }

        let output = String::from_utf8(output).expect("utf8 output");
        let lines = output.lines().collect::<Vec<_>>();

        assert_eq!(lines.len(), 4);
        assert!(lines[0].contains("\"type\":\"volume-info\""));
        assert!(lines[1].contains("\"summary\":{"));
        assert!(lines[2].contains("\"largestFiles\":["));
        assert!(lines[3].contains("\"tree\":{"));
    }

    #[test]
    fn serializes_partial_results_when_entries_are_unresolved() {
        let events = build_scan_events(&partial_snapshot());
        let top_level = events[1].to_json_line();
        let complete = events[3].to_json_line();

        assert_eq!(
            top_level,
            r#"{"type":"top-level-summary","summary":{"totalBytes":8,"scannedFiles":1,"scannedDirectories":1,"skippedEntries":1,"largestFile":{"path":"C:\\notes.txt","name":"notes.txt","sizeBytes":8,"extension":".txt"}}}"#
        );
        assert_eq!(
            complete,
            r#"{"type":"complete","summary":{"totalBytes":8,"scannedFiles":1,"scannedDirectories":1,"skippedEntries":1,"largestFile":{"path":"C:\\notes.txt","name":"notes.txt","sizeBytes":8,"extension":".txt"}},"largestFiles":[{"path":"C:\\notes.txt","name":"notes.txt","sizeBytes":8,"extension":".txt"}],"tree":{"id":"C:\\","name":"C:\\","path":"C:\\","type":"directory","sizeBytes":8,"childrenCount":1,"fileCount":1,"directoryCount":0,"skippedChildren":1,"children":[{"id":"C:\\notes.txt","name":"notes.txt","path":"C:\\notes.txt","type":"file","sizeBytes":8,"childrenCount":0,"fileCount":0,"directoryCount":0,"skippedChildren":0,"extension":".txt"}]}}"#
        );
        assert!(!complete.contains("unresolved.bin"));
    }
}
