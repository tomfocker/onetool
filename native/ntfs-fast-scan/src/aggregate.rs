use std::cmp::Ordering;
use std::collections::BinaryHeap;
use std::path::Path;

use crate::events::{LargestFile, ScanSummary, TreeNode};
use crate::ntfs::{EntryKind, ScanEntry, ScanSnapshot};

pub fn largest_files(snapshot: &ScanSnapshot, limit: usize) -> Vec<LargestFile> {
    largest_file_candidates(&snapshot.root, limit)
        .into_iter()
        .map(LargestFileCandidate::into_owned)
        .collect()
}

pub fn summary(snapshot: &ScanSnapshot, largest_files: &[LargestFile]) -> ScanSummary {
    ScanSummary {
        total_bytes: snapshot.root.size_bytes,
        scanned_files: snapshot.files_scanned,
        scanned_directories: count_directories(&snapshot.root),
        skipped_entries: snapshot.skipped_entries,
        largest_file: largest_files.first().cloned(),
    }
}

pub fn tree(snapshot: &ScanSnapshot) -> TreeNode {
    map_tree_node(&snapshot.root)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct LargestFileCandidate<'a> {
    path: &'a str,
    name: &'a str,
    size_bytes: u64,
}

impl LargestFileCandidate<'_> {
    fn into_owned(self) -> LargestFile {
        LargestFile {
            path: self.path.to_owned(),
            name: self.name.to_owned(),
            size_bytes: self.size_bytes,
            extension: path_extension(self.path),
        }
    }
}

impl Ord for LargestFileCandidate<'_> {
    fn cmp(&self, other: &Self) -> Ordering {
        compare_largest_file_rank(self.size_bytes, self.path, other.size_bytes, other.path)
    }
}

impl PartialOrd for LargestFileCandidate<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

fn largest_file_candidates<'a>(
    entry: &'a ScanEntry,
    limit: usize,
) -> Vec<LargestFileCandidate<'a>> {
    if limit == 0 {
        return Vec::new();
    }

    let mut candidates = BinaryHeap::with_capacity(limit);
    collect_largest_file_candidates(entry, limit, &mut candidates);

    let mut candidates = candidates.into_vec();
    candidates.sort_by(|left, right| {
        compare_largest_file_rank(left.size_bytes, left.path, right.size_bytes, right.path)
    });
    candidates
}

fn collect_largest_file_candidates<'a>(
    entry: &'a ScanEntry,
    limit: usize,
    candidates: &mut BinaryHeap<LargestFileCandidate<'a>>,
) {
    match entry.kind {
        EntryKind::File => {
            let candidate = LargestFileCandidate {
                path: &entry.path,
                name: &entry.name,
                size_bytes: entry.size_bytes,
            };

            if candidates.len() < limit {
                candidates.push(candidate);
            } else if let Some(worst) = candidates.peek() {
                if compare_largest_file_rank(
                    candidate.size_bytes,
                    candidate.path,
                    worst.size_bytes,
                    worst.path,
                ) == Ordering::Less
                {
                    candidates.pop();
                    candidates.push(candidate);
                }
            }
        }
        EntryKind::Directory => {
            for child in &entry.children {
                collect_largest_file_candidates(child, limit, candidates);
            }
        }
    }
}

fn compare_largest_file_rank(
    left_size_bytes: u64,
    left_path: &str,
    right_size_bytes: u64,
    right_path: &str,
) -> Ordering {
    right_size_bytes
        .cmp(&left_size_bytes)
        .then_with(|| left_path.cmp(right_path))
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
            skipped_children: entry.skipped_children,
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
                skipped_children: entry.skipped_children.max(skipped_children),
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
                size_bytes: 51,
                skipped_children: 0,
                children: vec![
                    ScanEntry {
                        path: r"C:\zeta.bin".to_owned(),
                        name: "zeta.bin".to_owned(),
                        kind: EntryKind::File,
                        size_bytes: 10,
                        skipped_children: 0,
                        children: Vec::new(),
                    },
                    ScanEntry {
                        path: r"C:\alpha.bin".to_owned(),
                        name: "alpha.bin".to_owned(),
                        kind: EntryKind::File,
                        size_bytes: 10,
                        skipped_children: 0,
                        children: Vec::new(),
                    },
                    ScanEntry {
                        path: r"C:\nested".to_owned(),
                        name: "nested".to_owned(),
                        kind: EntryKind::Directory,
                        size_bytes: 31,
                        skipped_children: 0,
                        children: vec![
                            ScanEntry {
                                path: r"C:\nested\largest.iso".to_owned(),
                                name: "largest.iso".to_owned(),
                                kind: EntryKind::File,
                                size_bytes: 25,
                                skipped_children: 0,
                                children: Vec::new(),
                            },
                            ScanEntry {
                                path: r"C:\nested\middle.txt".to_owned(),
                                name: "middle.txt".to_owned(),
                                kind: EntryKind::File,
                                size_bytes: 6,
                                skipped_children: 0,
                                children: Vec::new(),
                            },
                        ],
                    },
                ],
            },
            files_scanned: 4,
            skipped_entries: 0,
        }
    }

    #[test]
    fn largest_files_returns_top_n_in_descending_size_order() {
        let snapshot = sample_snapshot();

        let largest = largest_files(&snapshot, 3);

        assert_eq!(largest.len(), 3);
        assert_eq!(largest[0].path, r"C:\nested\largest.iso");
        assert_eq!(largest[0].size_bytes, 25);
        assert_eq!(largest[0].extension.as_deref(), Some(".iso"));
        assert_eq!(largest[1].path, r"C:\alpha.bin");
        assert_eq!(largest[1].size_bytes, 10);
        assert_eq!(largest[2].path, r"C:\zeta.bin");
        assert_eq!(largest[2].size_bytes, 10);
    }

    #[test]
    fn largest_file_candidates_limits_heap_contents_to_requested_count() {
        let snapshot = sample_snapshot();

        let candidates = largest_file_candidates(&snapshot.root, 2);

        assert_eq!(candidates.len(), 2);
        assert_eq!(candidates[0].path, r"C:\nested\largest.iso");
        assert_eq!(candidates[1].path, r"C:\alpha.bin");
    }
}
