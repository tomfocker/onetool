use std::path::Path;

use crate::events::{LargestFile, ScanSummary, TreeNode};
use crate::ntfs::{EntryKind, ScanEntry, ScanSnapshot};

pub fn largest_files(snapshot: &ScanSnapshot, limit: usize) -> Vec<LargestFile> {
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

pub fn summary(snapshot: &ScanSnapshot, largest_files: &[LargestFile]) -> ScanSummary {
    ScanSummary {
        total_bytes: snapshot.root.size_bytes,
        scanned_files: snapshot.files_scanned,
        scanned_directories: count_directories(&snapshot.root),
        skipped_entries: 0,
        largest_file: largest_files.first().cloned(),
    }
}

pub fn tree(snapshot: &ScanSnapshot) -> TreeNode {
    map_tree_node(&snapshot.root)
}

fn collect_files(entry: &ScanEntry, files: &mut Vec<LargestFile>) {
    match entry.kind {
        EntryKind::File => files.push(LargestFile {
            path: entry.path.clone(),
            name: entry.name.clone(),
            size_bytes: entry.size_bytes,
            extension: path_extension(&entry.path),
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
    match entry.kind {
        EntryKind::File => TreeNode {
            id: entry.path.clone(),
            name: entry.name.clone(),
            path: entry.path.clone(),
            node_type: "file".to_owned(),
            size_bytes: entry.size_bytes,
            children_count: 0,
            file_count: 0,
            directory_count: 0,
            skipped_children: 0,
            extension: path_extension(&entry.path),
            children: Vec::new(),
        },
        EntryKind::Directory => {
            let mut children = entry.children.iter().map(map_tree_node).collect::<Vec<_>>();
            children.sort_by(|left, right| {
                right
                    .size_bytes
                    .cmp(&left.size_bytes)
                    .then_with(|| left.path.cmp(&right.path))
            });

            let file_count = children
                .iter()
                .map(|child| {
                    if child.node_type == "file" {
                        1
                    } else {
                        child.file_count
                    }
                })
                .sum();
            let directory_count = children
                .iter()
                .map(|child| {
                    if child.node_type == "directory" {
                        child.directory_count + 1
                    } else {
                        0
                    }
                })
                .sum();
            let skipped_children = children.iter().map(|child| child.skipped_children).sum();

            TreeNode {
                id: entry.path.clone(),
                name: entry.name.clone(),
                path: entry.path.clone(),
                node_type: "directory".to_owned(),
                size_bytes: entry.size_bytes,
                children_count: children.len() as u64,
                file_count,
                directory_count,
                skipped_children,
                extension: None,
                children,
            }
        }
    }
}

fn path_extension(path: &str) -> Option<String> {
    let extension = Path::new(path).extension()?.to_str()?;
    Some(format!(".{extension}"))
}
