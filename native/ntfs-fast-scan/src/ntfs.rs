use std::fs;
use std::io;
use std::path::Path;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EntryKind {
    File,
    Directory,
}

#[derive(Clone, Debug)]
pub struct ScanEntry {
    pub path: String,
    pub name: String,
    pub kind: EntryKind,
    pub size_bytes: u64,
    pub children: Vec<ScanEntry>,
}

#[derive(Clone, Debug)]
pub struct ScanSnapshot {
    pub root_path: String,
    pub filesystem: String,
    pub root: ScanEntry,
    pub files_scanned: u64,
}

pub fn scan_volume(root: &Path) -> io::Result<ScanSnapshot> {
    if !root.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("root path is not a directory: {}", root.display()),
        ));
    }

    let canonical_root = root.canonicalize()?;
    let root_entry = scan_directory(&canonical_root, true)?;
    let files_scanned = count_files(&root_entry);

    Ok(ScanSnapshot {
        root_path: path_string(&canonical_root),
        filesystem: detect_filesystem(),
        root: root_entry,
        files_scanned,
    })
}

fn scan_directory(path: &Path, is_root: bool) -> io::Result<ScanEntry> {
    let mut children = Vec::new();

    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let file_type = entry.file_type()?;

        if file_type.is_symlink() {
            continue;
        }

        let child_path = entry.path();
        if file_type.is_dir() {
            children.push(scan_directory(&child_path, false)?);
        } else if file_type.is_file() {
            let metadata = entry.metadata()?;
            children.push(ScanEntry {
                path: path_string(&child_path),
                name: entry.file_name().to_string_lossy().into_owned(),
                kind: EntryKind::File,
                size_bytes: metadata.len(),
                children: Vec::new(),
            });
        }
    }

    children.sort_by(|left, right| {
        entry_rank(&left.kind)
            .cmp(&entry_rank(&right.kind))
            .then_with(|| left.name.cmp(&right.name))
    });

    let size_bytes = children.iter().map(|child| child.size_bytes).sum();

    Ok(ScanEntry {
        path: path_string(path),
        name: entry_name(path, is_root),
        kind: EntryKind::Directory,
        size_bytes,
        children,
    })
}

fn entry_name(path: &Path, is_root: bool) -> String {
    if is_root {
        path_string(path)
    } else {
        path.file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| path_string(path))
    }
}

fn path_string(path: &Path) -> String {
    normalize_windows_path(path.to_string_lossy().into_owned())
}

fn entry_rank(kind: &EntryKind) -> u8 {
    match kind {
        EntryKind::Directory => 0,
        EntryKind::File => 1,
    }
}

fn count_files(entry: &ScanEntry) -> u64 {
    match entry.kind {
        EntryKind::File => 1,
        EntryKind::Directory => entry.children.iter().map(count_files).sum(),
    }
}

fn detect_filesystem() -> String {
    if cfg!(target_os = "windows") {
        "NTFS".to_owned()
    } else {
        "unknown".to_owned()
    }
}

fn normalize_windows_path(path: String) -> String {
    if let Some(stripped) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{stripped}")
    } else if let Some(stripped) = path.strip_prefix(r"\\?\") {
        stripped.to_owned()
    } else {
        path
    }
}
