use std::io::{self, Write};

use crate::aggregate;
use crate::ntfs::ScanSnapshot;

#[derive(Clone, Debug)]
pub struct DirectorySummary {
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Clone, Debug)]
pub struct FileSummary {
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Clone, Debug)]
pub struct ScanSummary {
    pub total_bytes: u64,
    pub files_scanned: u64,
    pub directories_scanned: u64,
}

#[derive(Clone, Debug)]
pub struct TreeNode {
    pub path: String,
    pub name: String,
    pub node_type: String,
    pub size_bytes: u64,
    pub children: Vec<TreeNode>,
}

#[derive(Clone, Debug)]
pub enum ScanEvent {
    VolumeInfo {
        mode: String,
        root_path: String,
        filesystem: String,
    },
    TopLevelSummary {
        directories: Vec<DirectorySummary>,
        files_scanned: u64,
    },
    LargestFiles {
        items: Vec<FileSummary>,
    },
    Complete {
        summary: ScanSummary,
        tree: TreeNode,
    },
}

impl ScanEvent {
    pub fn event_type(&self) -> &'static str {
        match self {
            ScanEvent::VolumeInfo { .. } => "volume-info",
            ScanEvent::TopLevelSummary { .. } => "top-level-summary",
            ScanEvent::LargestFiles { .. } => "largest-files",
            ScanEvent::Complete { .. } => "complete",
        }
    }

    pub fn to_json_line(&self) -> String {
        match self {
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
            ScanEvent::TopLevelSummary {
                directories,
                files_scanned,
            } => json_object([
                ("type", json_string(self.event_type())),
                (
                    "directories",
                    json_array(directories.iter().map(DirectorySummary::to_json)),
                ),
                ("filesScanned", files_scanned.to_string()),
            ]),
            ScanEvent::LargestFiles { items } => json_object([
                ("type", json_string(self.event_type())),
                ("items", json_array(items.iter().map(FileSummary::to_json))),
            ]),
            ScanEvent::Complete { summary, tree } => json_object([
                ("type", json_string(self.event_type())),
                ("summary", summary.to_json()),
                ("tree", tree.to_json()),
            ]),
        }
    }
}

impl DirectorySummary {
    fn to_json(&self) -> String {
        json_object([
            ("path", json_string(&self.path)),
            ("sizeBytes", self.size_bytes.to_string()),
        ])
    }
}

impl FileSummary {
    fn to_json(&self) -> String {
        json_object([
            ("path", json_string(&self.path)),
            ("sizeBytes", self.size_bytes.to_string()),
        ])
    }
}

impl ScanSummary {
    fn to_json(&self) -> String {
        json_object([
            ("totalBytes", self.total_bytes.to_string()),
            ("filesScanned", self.files_scanned.to_string()),
            ("directoriesScanned", self.directories_scanned.to_string()),
        ])
    }
}

impl TreeNode {
    fn to_json(&self) -> String {
        json_object([
            ("path", json_string(&self.path)),
            ("name", json_string(&self.name)),
            ("type", json_string(&self.node_type)),
            ("sizeBytes", self.size_bytes.to_string()),
            (
                "children",
                json_array(self.children.iter().map(TreeNode::to_json)),
            ),
        ])
    }
}

pub fn build_scan_events(snapshot: &ScanSnapshot) -> Vec<ScanEvent> {
    vec![
        ScanEvent::VolumeInfo {
            mode: "ntfs-fast".to_owned(),
            root_path: snapshot.root_path.clone(),
            filesystem: snapshot.filesystem.clone(),
        },
        ScanEvent::TopLevelSummary {
            directories: aggregate::top_level_directories(snapshot),
            files_scanned: snapshot.files_scanned,
        },
        ScanEvent::LargestFiles {
            items: aggregate::largest_files(snapshot, 50),
        },
        ScanEvent::Complete {
            summary: aggregate::summary(snapshot),
            tree: aggregate::tree(snapshot),
        },
    ]
}

pub fn emit_event<W: Write>(writer: &mut W, event: &ScanEvent) -> io::Result<()> {
    writeln!(writer, "{}", event.to_json_line())?;
    writer.flush()
}

fn json_object<const N: usize>(fields: [(&str, String); N]) -> String {
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
