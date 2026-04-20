use crate::events::{DirectorySummary, FileSummary, ScanSummary, TreeNode};
use crate::ntfs::{EntryKind, ScanEntry, ScanSnapshot};

pub fn top_level_directories(snapshot: &ScanSnapshot) -> Vec<DirectorySummary> {
    let mut directories = snapshot
        .root
        .children
        .iter()
        .filter(|entry| entry.kind == EntryKind::Directory)
        .map(|entry| DirectorySummary {
            path: entry.path.clone(),
            size_bytes: entry.size_bytes,
        })
        .collect::<Vec<_>>();

    directories.sort_by(|left, right| {
        right
            .size_bytes
            .cmp(&left.size_bytes)
            .then_with(|| left.path.cmp(&right.path))
    });

    directories
}

pub fn largest_files(snapshot: &ScanSnapshot, limit: usize) -> Vec<FileSummary> {
    let mut files = Vec::new();
    collect_files(&snapshot.root, &mut files);
    files.sort_by(|left, right| {
        right
            .size_bytes
            .cmp(&left.size_bytes)
            .then_with(|| left.path.cmp(&right.path))
    });
    files.truncate(limit);
    files
}

pub fn summary(snapshot: &ScanSnapshot) -> ScanSummary {
    ScanSummary {
        total_bytes: snapshot.root.size_bytes,
        files_scanned: snapshot.files_scanned,
        directories_scanned: count_directories(&snapshot.root),
    }
}

pub fn tree(snapshot: &ScanSnapshot) -> TreeNode {
    map_tree_node(&snapshot.root)
}

fn collect_files(entry: &ScanEntry, files: &mut Vec<FileSummary>) {
    match entry.kind {
        EntryKind::File => files.push(FileSummary {
            path: entry.path.clone(),
            size_bytes: entry.size_bytes,
        }),
        EntryKind::Directory => {
            for child in &entry.children {
                collect_files(child, files);
            }
        }
    }
}

fn count_directories(entry: &ScanEntry) -> u64 {
    match entry.kind {
        EntryKind::File => 0,
        EntryKind::Directory => 1 + entry.children.iter().map(count_directories).sum::<u64>(),
    }
}

fn map_tree_node(entry: &ScanEntry) -> TreeNode {
    TreeNode {
        path: entry.path.clone(),
        name: entry.name.clone(),
        node_type: match entry.kind {
            EntryKind::File => "file",
            EntryKind::Directory => "directory",
        }
        .to_owned(),
        size_bytes: entry.size_bytes,
        children: entry.children.iter().map(map_tree_node).collect(),
    }
}
