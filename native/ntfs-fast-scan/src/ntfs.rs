use std::collections::{HashMap, HashSet};
use std::io;
use std::path::{Path, PathBuf};

#[cfg(windows)]
use std::ffi::OsStr;
#[cfg(windows)]
use std::ffi::c_void;
#[cfg(windows)]
use std::mem::{size_of, zeroed};
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
#[cfg(windows)]
use std::ptr::{null, null_mut};

#[cfg(windows)]
use self::win32::{
    BY_HANDLE_FILE_INFORMATION, CloseHandle, CreateFileW, DRIVE_FIXED, DeviceIoControl,
    ERROR_HANDLE_EOF, ERROR_NO_MORE_FILES, FILE_ATTRIBUTE_DIRECTORY, FILE_FLAG_BACKUP_SEMANTICS,
    FILE_ID_128, FILE_ID_INFO, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
    FILE_SUPPORTS_USN_JOURNAL, FSCTL_ENUM_USN_DATA, FSCTL_GET_NTFS_FILE_RECORD, FileIdInfo,
    GetDriveTypeW, GetFileInformationByHandle, GetFileInformationByHandleEx, GetVolumeInformationW,
    HANDLE, INVALID_HANDLE_VALUE, MFT_ENUM_DATA_V0, NTFS_FILE_RECORD_INPUT_BUFFER, OPEN_EXISTING,
    USN_RECORD_V2, USN_RECORD_V3,
};

const ROOT_PATH_ERROR: &str = "root path must be a fixed local NTFS volume root like C:\\";
#[cfg(windows)]
const FILE_SHARES: u32 = FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE;
#[cfg(windows)]
const GENERIC_READ_ACCESS: u32 = 0x8000_0000;
#[cfg(windows)]
const FILE_RECORD_BUFFER_SIZE: usize = 64 * 1024;
#[cfg(windows)]
const FILE_RECORD_SEGMENT_MASK: u64 = 0x0000_FFFF_FFFF_FFFF;
#[cfg(windows)]
const PROGRESS_RECORD_INTERVAL: usize = 2048;

#[cfg(windows)]
#[allow(
    non_camel_case_types,
    non_snake_case,
    non_upper_case_globals,
    dead_code
)]
mod win32 {
    use super::c_void;

    pub type HANDLE = isize;

    pub const INVALID_HANDLE_VALUE: HANDLE = -1;
    pub const ERROR_NO_MORE_FILES: u32 = 18;
    pub const ERROR_HANDLE_EOF: u32 = 38;

    pub const FILE_SHARE_READ: u32 = 0x0000_0001;
    pub const FILE_SHARE_WRITE: u32 = 0x0000_0002;
    pub const FILE_SHARE_DELETE: u32 = 0x0000_0004;
    pub const OPEN_EXISTING: u32 = 3;
    pub const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
    pub const FILE_ATTRIBUTE_DIRECTORY: u32 = 0x0000_0010;
    pub const FILE_SUPPORTS_USN_JOURNAL: u32 = 0x0200_0000;

    pub const DRIVE_REMOVABLE: u32 = 2;
    pub const DRIVE_FIXED: u32 = 3;
    pub const DRIVE_REMOTE: u32 = 4;
    pub const DRIVE_CDROM: u32 = 5;
    pub const DRIVE_RAMDISK: u32 = 6;

    pub const FileIdInfo: u32 = 18;

    pub const FSCTL_ENUM_USN_DATA: u32 = 590_003;
    pub const FSCTL_GET_NTFS_FILE_RECORD: u32 = 589_928;

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct FILETIME {
        pub dwLowDateTime: u32,
        pub dwHighDateTime: u32,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct BY_HANDLE_FILE_INFORMATION {
        pub dwFileAttributes: u32,
        pub ftCreationTime: FILETIME,
        pub ftLastAccessTime: FILETIME,
        pub ftLastWriteTime: FILETIME,
        pub dwVolumeSerialNumber: u32,
        pub nFileSizeHigh: u32,
        pub nFileSizeLow: u32,
        pub nNumberOfLinks: u32,
        pub nFileIndexHigh: u32,
        pub nFileIndexLow: u32,
    }

    pub type ByHandleFileInformation = BY_HANDLE_FILE_INFORMATION;

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct FILE_ID_128 {
        pub Identifier: [u8; 16],
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct FILE_ID_INFO {
        pub VolumeSerialNumber: u64,
        pub FileId: FILE_ID_128,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct MFT_ENUM_DATA_V0 {
        pub StartFileReferenceNumber: u64,
        pub LowUsn: i64,
        pub HighUsn: i64,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct NTFS_FILE_RECORD_INPUT_BUFFER {
        pub FileReferenceNumber: i64,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct USN_RECORD_V2 {
        pub RecordLength: u32,
        pub MajorVersion: u16,
        pub MinorVersion: u16,
        pub FileReferenceNumber: u64,
        pub ParentFileReferenceNumber: u64,
        pub Usn: i64,
        pub TimeStamp: i64,
        pub Reason: u32,
        pub SourceInfo: u32,
        pub SecurityId: u32,
        pub FileAttributes: u32,
        pub FileNameLength: u16,
        pub FileNameOffset: u16,
        pub FileName: [u16; 1],
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct USN_RECORD_V3 {
        pub RecordLength: u32,
        pub MajorVersion: u16,
        pub MinorVersion: u16,
        pub FileReferenceNumber: FILE_ID_128,
        pub ParentFileReferenceNumber: FILE_ID_128,
        pub Usn: i64,
        pub TimeStamp: i64,
        pub Reason: u32,
        pub SourceInfo: u32,
        pub SecurityId: u32,
        pub FileAttributes: u32,
        pub FileNameLength: u16,
        pub FileNameOffset: u16,
        pub FileName: [u16; 1],
    }

    #[link(name = "Kernel32")]
    unsafe extern "system" {
        pub fn CloseHandle(hobject: HANDLE) -> i32;
        pub fn CreateFileW(
            lpfilename: *const u16,
            dwdesiredaccess: u32,
            dwsharemode: u32,
            lpsecurityattributes: *const c_void,
            dwcreationdisposition: u32,
            dwflagsandattributes: u32,
            htemplatefile: HANDLE,
        ) -> HANDLE;
        pub fn DeviceIoControl(
            hdevice: HANDLE,
            dwiocontrolcode: u32,
            lpinbuffer: *mut c_void,
            ninbuffersize: u32,
            lpoutbuffer: *mut c_void,
            noutbuffersize: u32,
            lpbytesreturned: *mut u32,
            lpoverlapped: *mut c_void,
        ) -> i32;
        pub fn GetDriveTypeW(lprootpathname: *const u16) -> u32;
        pub fn GetFileInformationByHandle(
            hfile: HANDLE,
            lpfileinformation: *mut BY_HANDLE_FILE_INFORMATION,
        ) -> i32;
        pub fn GetFileInformationByHandleEx(
            hfile: HANDLE,
            fileinformationclass: u32,
            lpfileinformation: *mut c_void,
            dwbuffersize: u32,
        ) -> i32;
        pub fn GetVolumeInformationW(
            lprootpathname: *const u16,
            lpvolumenamebuffer: *mut u16,
            nvolumenamesize: u32,
            lpvolumeserialnumber: *mut u32,
            lpmaximumcomponentlength: *mut u32,
            lpfilesystemflags: *mut u32,
            lpfilesystemnamebuffer: *mut u16,
            nfilesystemnamebuffersize: u32,
        ) -> i32;
    }
}

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
    pub skipped_children: u64,
    pub children: Vec<ScanEntry>,
}

#[derive(Clone, Debug)]
pub struct ScanSnapshot {
    pub root_path: String,
    pub filesystem: String,
    pub root: ScanEntry,
    pub files_scanned: u64,
    pub skipped_entries: u64,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
struct FileReference([u8; 16]);

impl FileReference {
    fn from_u64(value: u64) -> Self {
        let mut bytes = [0u8; 16];
        bytes[..8].copy_from_slice(&value.to_le_bytes());
        Self(bytes)
    }

    #[cfg(windows)]
    fn from_file_id_128(value: FILE_ID_128) -> Self {
        Self(value.Identifier)
    }

    #[cfg(windows)]
    fn legacy_part(self) -> u64 {
        u64::from_le_bytes(self.0[..8].try_into().expect("legacy file reference"))
    }
}

#[derive(Clone, Debug)]
struct EnumeratedEntry {
    id: FileReference,
    parent_id: FileReference,
    name: String,
    kind: EntryKind,
    size_bytes: Option<u64>,
}

impl EnumeratedEntry {
    #[cfg(test)]
    fn file(id: u64, parent_id: u64, name: impl Into<String>, size_bytes: u64) -> Self {
        Self {
            id: FileReference::from_u64(id),
            parent_id: FileReference::from_u64(parent_id),
            name: name.into(),
            kind: EntryKind::File,
            size_bytes: Some(size_bytes),
        }
    }

    #[cfg(test)]
    fn directory(id: u64, parent_id: u64, name: impl Into<String>) -> Self {
        Self {
            id: FileReference::from_u64(id),
            parent_id: FileReference::from_u64(parent_id),
            name: name.into(),
            kind: EntryKind::Directory,
            size_bytes: Some(0),
        }
    }

    #[cfg(test)]
    fn unresolved_file(id: u64, parent_id: u64, name: impl Into<String>) -> Self {
        Self {
            id: FileReference::from_u64(id),
            parent_id: FileReference::from_u64(parent_id),
            name: name.into(),
            kind: EntryKind::File,
            size_bytes: None,
        }
    }

    #[cfg(windows)]
    fn from_parts(
        id: FileReference,
        parent_id: FileReference,
        name: String,
        kind: EntryKind,
        size_bytes: Option<u64>,
    ) -> Self {
        Self {
            id,
            parent_id,
            name,
            kind,
            size_bytes,
        }
    }
}

#[allow(dead_code)]
pub fn scan_volume(root: &Path) -> io::Result<ScanSnapshot> {
    scan_volume_with_progress(root, |_| Ok(()))
}

pub fn scan_volume_with_progress<F>(root: &Path, mut progress: F) -> io::Result<ScanSnapshot>
where
    F: FnMut(&ScanSnapshot) -> io::Result<()>,
{
    #[cfg(windows)]
    {
        return scan_volume_windows(root, &mut progress);
    }

    #[cfg(not(windows))]
    {
        let _ = root;
        let _ = progress;
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "ntfs-fast-scan requires Windows NTFS volume access",
        ))
    }
}

fn build_snapshot_from_entries(
    root_path: &Path,
    filesystem: &str,
    root_reference: FileReference,
    entries: Vec<EnumeratedEntry>,
) -> io::Result<ScanSnapshot> {
    let root_path_string = path_string(root_path);
    let mut nodes = HashMap::<FileReference, NodeRecord>::new();

    for entry in entries {
        nodes.insert(
            entry.id,
            NodeRecord {
                parent_id: entry.parent_id,
                name: entry.name,
                kind: entry.kind,
                size_bytes: entry.size_bytes,
                children: Vec::new(),
            },
        );
    }

    let mut root_children = Vec::new();
    let node_ids = nodes.keys().copied().collect::<Vec<_>>();

    for node_id in node_ids {
        if node_id == root_reference {
            continue;
        }

        let parent_id = nodes
            .get(&node_id)
            .map(|node| node.parent_id)
            .ok_or_else(|| io::Error::other("missing node during snapshot build"))?;

        if parent_id == root_reference {
            root_children.push(node_id);
            continue;
        }

        if let Some(parent) = nodes.get_mut(&parent_id) {
            if parent.kind == EntryKind::Directory {
                parent.children.push(node_id);
            }
        }
    }

    sort_children(&nodes, &mut root_children);

    let mut visited = HashSet::new();
    let mut files_scanned = 0u64;
    let mut skipped_entries = 0u64;
    let mut root_skipped_children = 0u64;
    let mut built_children = Vec::with_capacity(root_children.len());

    for child_id in root_children {
        match build_entry(
            child_id,
            Path::new(&root_path_string),
            &nodes,
            &mut visited,
            &mut files_scanned,
            &mut skipped_entries,
        )? {
            Some(entry) => {
                root_skipped_children += entry.skipped_children;
                built_children.push(entry);
            }
            None => root_skipped_children += 1,
        }
    }

    let root_size = built_children.iter().map(|child| child.size_bytes).sum();

    Ok(ScanSnapshot {
        root_path: root_path_string.clone(),
        filesystem: filesystem.to_owned(),
        root: ScanEntry {
            path: root_path_string.clone(),
            name: root_path_string,
            kind: EntryKind::Directory,
            size_bytes: root_size,
            skipped_children: root_skipped_children,
            children: built_children,
        },
        files_scanned,
        skipped_entries,
    })
}

fn build_entry(
    node_id: FileReference,
    parent_path: &Path,
    nodes: &HashMap<FileReference, NodeRecord>,
    visited: &mut HashSet<FileReference>,
    files_scanned: &mut u64,
    skipped_entries: &mut u64,
) -> io::Result<Option<ScanEntry>> {
    if !visited.insert(node_id) {
        return Err(io::Error::other(
            "cycle detected while materializing NTFS tree",
        ));
    }

    let node = nodes
        .get(&node_id)
        .ok_or_else(|| io::Error::other("missing node while materializing NTFS tree"))?;

    let mut absolute_path = PathBuf::from(parent_path);
    absolute_path.push(&node.name);
    let absolute_path_string = path_string(&absolute_path);

    let entry = match node.kind {
        EntryKind::File => {
            let Some(size_bytes) = node.size_bytes else {
                *skipped_entries += 1;
                return Ok(None);
            };

            *files_scanned += 1;
            ScanEntry {
                path: absolute_path_string,
                name: node.name.clone(),
                kind: EntryKind::File,
                size_bytes,
                skipped_children: 0,
                children: Vec::new(),
            }
        }
        EntryKind::Directory => {
            let mut child_ids = node.children.clone();
            sort_children(nodes, &mut child_ids);

            let mut children = Vec::with_capacity(child_ids.len());
            let mut skipped_children = 0u64;
            for child_id in child_ids {
                match build_entry(
                    child_id,
                    Path::new(&absolute_path_string),
                    nodes,
                    visited,
                    files_scanned,
                    skipped_entries,
                )? {
                    Some(child) => {
                        skipped_children += child.skipped_children;
                        children.push(child);
                    }
                    None => skipped_children += 1,
                }
            }

            let size_bytes = children.iter().map(|child| child.size_bytes).sum();

            ScanEntry {
                path: absolute_path_string,
                name: node.name.clone(),
                kind: EntryKind::Directory,
                size_bytes,
                skipped_children,
                children,
            }
        }
    };

    Ok(Some(entry))
}

fn sort_children(nodes: &HashMap<FileReference, NodeRecord>, children: &mut [FileReference]) {
    children.sort_by(|left, right| {
        let left_node = nodes.get(left).expect("sort left node");
        let right_node = nodes.get(right).expect("sort right node");

        entry_rank(&left_node.kind)
            .cmp(&entry_rank(&right_node.kind))
            .then_with(|| left_node.name.cmp(&right_node.name))
    });
}

fn path_string(path: &Path) -> String {
    normalize_windows_path(path.to_string_lossy().into_owned())
}

#[cfg(windows)]
fn file_record_segment_number(file_reference_number: u64) -> u64 {
    file_reference_number & FILE_RECORD_SEGMENT_MASK
}

fn entry_rank(kind: &EntryKind) -> u8 {
    match kind {
        EntryKind::Directory => 0,
        EntryKind::File => 1,
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

#[derive(Clone, Debug)]
struct NodeRecord {
    parent_id: FileReference,
    name: String,
    kind: EntryKind,
    size_bytes: Option<u64>,
    children: Vec<FileReference>,
}

#[cfg(windows)]
#[derive(Clone, Debug, Eq, PartialEq)]
struct ValidatedRoot {
    root_path: String,
    drive_letter: char,
}

#[cfg(windows)]
#[derive(Clone, Copy, Debug)]
struct RootIdentifiers {
    legacy_id: u64,
    extended_id: FileReference,
}

#[cfg(windows)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum IdFormat {
    Legacy64,
    Extended128,
}

#[cfg(windows)]
#[derive(Clone, Debug)]
struct RawRecord {
    id: FileReference,
    parent_id: FileReference,
    name: String,
    kind: EntryKind,
    file_reference_number: u64,
}

#[cfg(windows)]
#[derive(Clone, Debug)]
struct RawRecordDescriptor {
    parent_id: FileReference,
    name: String,
}

#[cfg(windows)]
#[derive(Clone, Debug)]
struct PartialNodeState {
    id: FileReference,
    parent_id: FileReference,
    name: String,
    kind: EntryKind,
    path: String,
    depth: usize,
    size_bytes: u64,
    children_count: u64,
    skipped_children: u64,
}

#[cfg(windows)]
#[derive(Debug)]
struct TopLevelProgressBuilder {
    root_path: String,
    filesystem: String,
    root_reference: FileReference,
    records: HashMap<FileReference, RawRecordDescriptor>,
    states: HashMap<FileReference, PartialNodeState>,
    files_scanned: u64,
    skipped_entries: u64,
    total_bytes: u64,
}

#[cfg(windows)]
#[derive(Debug)]
struct FileRecordQueryBuffer {
    output: Vec<u8>,
}

#[cfg(windows)]
impl FileRecordQueryBuffer {
    fn new() -> Self {
        Self {
            output: vec![0u8; FILE_RECORD_BUFFER_SIZE],
        }
    }
}

#[cfg(windows)]
#[derive(Debug)]
struct OwnedHandle {
    raw: HANDLE,
}

#[cfg(windows)]
impl OwnedHandle {
    fn new(raw: HANDLE) -> io::Result<Self> {
        if raw == 0 || raw == INVALID_HANDLE_VALUE {
            Err(io::Error::last_os_error())
        } else {
            Ok(Self { raw })
        }
    }
}

#[cfg(windows)]
impl Drop for OwnedHandle {
    fn drop(&mut self) {
        if self.raw != 0 && self.raw != INVALID_HANDLE_VALUE {
            unsafe {
                CloseHandle(self.raw);
            }
        }
    }
}

#[cfg(windows)]
fn scan_volume_windows<F>(root: &Path, progress: &mut F) -> io::Result<ScanSnapshot>
where
    F: FnMut(&ScanSnapshot) -> io::Result<()>,
{
    let validated_root = validate_root_path(root)?;
    let filesystem = query_volume_filesystem(&validated_root)?;
    let root_handle = open_root_handle(&validated_root)?;
    let root_identifiers = query_root_identifiers(root_handle.raw)?;
    let volume_handle = open_volume_handle(&validated_root)?;
    let (raw_records, id_format) = enumerate_mft_records(volume_handle.raw)?;
    let mut file_record_buffer = FileRecordQueryBuffer::new();

    let root_reference = match id_format {
        IdFormat::Legacy64 => FileReference::from_u64(root_identifiers.legacy_id),
        IdFormat::Extended128 => root_identifiers.extended_id,
    };
    let mut progress_builder = TopLevelProgressBuilder::new(
        &validated_root.root_path,
        &filesystem,
        root_reference,
        &raw_records,
    );

    let mut entries = Vec::with_capacity(raw_records.len());
    for (index, record) in raw_records.into_iter().enumerate() {
        let size_bytes = match record.kind {
            EntryKind::File => resolve_file_size(
                volume_handle.raw,
                record.file_reference_number,
                &mut file_record_buffer,
            ),
            EntryKind::Directory => Some(0),
        };
        progress_builder.observe(&record, size_bytes);

        entries.push(EnumeratedEntry::from_parts(
            record.id,
            record.parent_id,
            record.name,
            record.kind,
            size_bytes,
        ));

        if (index + 1) % PROGRESS_RECORD_INTERVAL == 0 {
            progress(&progress_builder.to_snapshot())?;
        }
    }

    build_snapshot_from_entries(
        Path::new(&validated_root.root_path),
        &filesystem,
        root_reference,
        entries,
    )
}

#[cfg(windows)]
impl TopLevelProgressBuilder {
    fn new(
        root_path: &str,
        filesystem: &str,
        root_reference: FileReference,
        raw_records: &[RawRecord],
    ) -> Self {
        let records = raw_records
            .iter()
            .map(|record| {
                (
                    record.id,
                    RawRecordDescriptor {
                        parent_id: record.parent_id,
                        name: record.name.clone(),
                    },
                )
            })
            .collect::<HashMap<_, _>>();
        let child_counts = raw_records.iter().fold(
            HashMap::<FileReference, u64>::new(),
            |mut counts, record| {
                *counts.entry(record.parent_id).or_insert(0) += 1;
                counts
            },
        );
        let mut states = HashMap::new();

        for record in raw_records {
            let Some(chain) = chain_to_root(record.id, root_reference, &records) else {
                continue;
            };
            let depth = chain.len();
            if !(1..=3).contains(&depth) {
                continue;
            }

            let path = build_path_from_chain(root_path, &chain, &records);
            states.insert(
                record.id,
                PartialNodeState {
                    id: record.id,
                    parent_id: record.parent_id,
                    name: record.name.clone(),
                    kind: record.kind.clone(),
                    path,
                    depth,
                    size_bytes: 0,
                    children_count: *child_counts.get(&record.id).unwrap_or(&0),
                    skipped_children: 0,
                },
            );
        }

        Self {
            root_path: root_path.to_owned(),
            filesystem: filesystem.to_owned(),
            root_reference,
            records,
            states,
            files_scanned: 0,
            skipped_entries: 0,
            total_bytes: 0,
        }
    }

    fn observe(&mut self, record: &RawRecord, size_bytes: Option<u64>) {
        if record.id == self.root_reference {
            return;
        }

        let Some(chain) = chain_to_root(record.id, self.root_reference, &self.records) else {
            return;
        };
        let ancestors = chain.iter().take(3).copied().collect::<Vec<_>>();

        match record.kind {
            EntryKind::File => {
                if let Some(size) = size_bytes {
                    self.files_scanned += 1;
                    self.total_bytes += size;
                    for ancestor_id in ancestors {
                        if let Some(state) = self.states.get_mut(&ancestor_id) {
                            state.size_bytes += size;
                        }
                    }
                } else {
                    self.skipped_entries += 1;
                    for ancestor_id in ancestors {
                        if let Some(state) = self.states.get_mut(&ancestor_id) {
                            state.skipped_children += 1;
                        }
                    }
                }
            }
            EntryKind::Directory => {}
        }
    }

    fn to_snapshot(&self) -> ScanSnapshot {
        let mut root_children = self
            .states
            .values()
            .filter(|state| state.depth == 1)
            .map(|state| self.to_scan_entry(state))
            .collect::<Vec<_>>();
        root_children.sort_by(|left, right| {
            right
                .size_bytes
                .cmp(&left.size_bytes)
                .then_with(|| left.path.cmp(&right.path))
        });

        ScanSnapshot {
            root_path: self.root_path.clone(),
            filesystem: self.filesystem.clone(),
            root: ScanEntry {
                path: self.root_path.clone(),
                name: self.root_path.clone(),
                kind: EntryKind::Directory,
                size_bytes: self.total_bytes,
                skipped_children: root_children
                    .iter()
                    .map(|child| child.skipped_children)
                    .sum(),
                children: root_children,
            },
            files_scanned: self.files_scanned,
            skipped_entries: self.skipped_entries,
        }
    }

    fn to_scan_entry(&self, state: &PartialNodeState) -> ScanEntry {
        let mut children = if state.kind == EntryKind::Directory {
            self.states
                .values()
                .filter(|child| child.depth == state.depth + 1 && child.parent_id == state.id)
                .map(|child| self.to_scan_entry(child))
                .collect::<Vec<_>>()
        } else {
            Vec::new()
        };
        children.sort_by(|left, right| {
            right
                .size_bytes
                .cmp(&left.size_bytes)
                .then_with(|| left.path.cmp(&right.path))
        });

        let skipped_children = state.skipped_children
            + children
                .iter()
                .map(|child| child.skipped_children)
                .sum::<u64>();

        ScanEntry {
            path: state.path.clone(),
            name: state.name.clone(),
            kind: state.kind.clone(),
            size_bytes: state.size_bytes,
            skipped_children: skipped_children
                + state.children_count.saturating_sub(children.len() as u64),
            children,
        }
    }
}

#[cfg(windows)]
fn chain_to_root(
    node_id: FileReference,
    root_reference: FileReference,
    records: &HashMap<FileReference, RawRecordDescriptor>,
) -> Option<Vec<FileReference>> {
    let mut chain = Vec::new();
    let mut current = node_id;
    let mut visited = HashSet::new();

    loop {
        if current == root_reference {
            chain.reverse();
            return Some(chain);
        }

        if !visited.insert(current) {
            return None;
        }

        let record = records.get(&current)?;
        chain.push(current);
        current = record.parent_id;
    }
}

#[cfg(windows)]
fn build_path_from_chain(
    root_path: &str,
    chain: &[FileReference],
    records: &HashMap<FileReference, RawRecordDescriptor>,
) -> String {
    let mut path = PathBuf::from(root_path);
    for node_id in chain {
        if let Some(record) = records.get(node_id) {
            path.push(&record.name);
        }
    }
    path_string(&path)
}

#[cfg(windows)]
fn validate_root_path(root: &Path) -> io::Result<ValidatedRoot> {
    use std::path::{Component, Prefix};

    let mut components = root.components();
    let drive_letter = match (components.next(), components.next(), components.next()) {
        (Some(Component::Prefix(prefix)), Some(Component::RootDir), None) => match prefix.kind() {
            Prefix::Disk(letter) | Prefix::VerbatimDisk(letter) => {
                char::from(letter).to_ascii_uppercase()
            }
            _ => return Err(invalid_root_path(root)),
        },
        _ => return Err(invalid_root_path(root)),
    };

    Ok(ValidatedRoot {
        root_path: format!("{drive_letter}:\\"),
        drive_letter,
    })
}

#[cfg(windows)]
fn invalid_root_path(root: &Path) -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidInput,
        format!("{ROOT_PATH_ERROR}; received {}", root.display()),
    )
}

#[cfg(windows)]
fn query_volume_filesystem(root: &ValidatedRoot) -> io::Result<String> {
    let root_wide = wide_string(&root.root_path);
    let drive_type = unsafe { GetDriveTypeW(root_wide.as_ptr()) };
    if !supports_fast_ntfs_drive_type(drive_type) {
        return Err(invalid_root_path(Path::new(&root.root_path)));
    }

    let mut filesystem_name = [0u16; 64];
    let mut flags = 0u32;
    let succeeded = unsafe {
        GetVolumeInformationW(
            root_wide.as_ptr(),
            null_mut(),
            0,
            null_mut(),
            null_mut(),
            &mut flags,
            filesystem_name.as_mut_ptr(),
            filesystem_name.len() as u32,
        )
    };

    if succeeded == 0 {
        return Err(io::Error::new(
            io::ErrorKind::Other,
            format!(
                "failed to query volume information for {}: {}",
                root.root_path,
                io::Error::last_os_error()
            ),
        ));
    }

    let filesystem = wide_buffer_to_string(&filesystem_name);
    if !filesystem.eq_ignore_ascii_case("NTFS") {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!(
                "root path must be on an NTFS volume root; {} is {}",
                root.root_path, filesystem
            ),
        ));
    }

    if flags & FILE_SUPPORTS_USN_JOURNAL == 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!(
                "NTFS volume {} does not expose the USN journal required for ntfs-fast mode",
                root.root_path
            ),
        ));
    }

    Ok(filesystem)
}

#[cfg(windows)]
fn supports_fast_ntfs_drive_type(drive_type: u32) -> bool {
    drive_type == DRIVE_FIXED
}

#[cfg(windows)]
fn open_root_handle(root: &ValidatedRoot) -> io::Result<OwnedHandle> {
    let root_wide = wide_string(&root.root_path);
    let handle = unsafe {
        CreateFileW(
            root_wide.as_ptr(),
            0,
            FILE_SHARES,
            null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            0,
        )
    };

    OwnedHandle::new(handle).map_err(|error| {
        io::Error::new(
            error.kind(),
            format!("failed to open root directory {}: {error}", root.root_path),
        )
    })
}

#[cfg(windows)]
fn open_volume_handle(root: &ValidatedRoot) -> io::Result<OwnedHandle> {
    let volume_path = format!(r"\\.\{}:", root.drive_letter);
    let volume_wide = wide_string(&volume_path);
    let handle = unsafe {
        CreateFileW(
            volume_wide.as_ptr(),
            GENERIC_READ_ACCESS,
            FILE_SHARES,
            null(),
            OPEN_EXISTING,
            0,
            0,
        )
    };

    OwnedHandle::new(handle).map_err(|error| {
        io::Error::new(
            error.kind(),
            format!("failed to open NTFS volume {volume_path}: {error}"),
        )
    })
}

#[cfg(windows)]
fn query_root_identifiers(root_handle: HANDLE) -> io::Result<RootIdentifiers> {
    let mut file_id_info: FILE_ID_INFO = unsafe { zeroed() };
    let id_ok = unsafe {
        GetFileInformationByHandleEx(
            root_handle,
            FileIdInfo,
            &mut file_id_info as *mut _ as *mut _,
            size_of::<FILE_ID_INFO>() as u32,
        )
    };

    if id_ok == 0 {
        return Err(io::Error::new(
            io::ErrorKind::Other,
            format!(
                "failed to query root file identifier: {}",
                io::Error::last_os_error()
            ),
        ));
    }

    let mut by_handle_info: BY_HANDLE_FILE_INFORMATION = unsafe { zeroed() };
    let legacy_ok = unsafe { GetFileInformationByHandle(root_handle, &mut by_handle_info) };
    if legacy_ok == 0 {
        return Err(io::Error::new(
            io::ErrorKind::Other,
            format!(
                "failed to query root legacy file identifier: {}",
                io::Error::last_os_error()
            ),
        ));
    }

    Ok(RootIdentifiers {
        legacy_id: ((by_handle_info.nFileIndexHigh as u64) << 32)
            | by_handle_info.nFileIndexLow as u64,
        extended_id: FileReference::from_file_id_128(file_id_info.FileId),
    })
}

#[cfg(windows)]
fn enumerate_mft_records(volume_handle: HANDLE) -> io::Result<(Vec<RawRecord>, IdFormat)> {
    let mut records = Vec::new();
    let mut id_format = None;
    let mut enum_state = MFT_ENUM_DATA_V0 {
        StartFileReferenceNumber: 0,
        LowUsn: 0,
        HighUsn: i64::MAX,
    };
    let mut buffer = vec![0u8; 1024 * 1024];

    loop {
        let mut bytes_returned = 0u32;
        let succeeded = unsafe {
            DeviceIoControl(
                volume_handle,
                FSCTL_ENUM_USN_DATA,
                &mut enum_state as *mut _ as *mut _,
                size_of::<MFT_ENUM_DATA_V0>() as u32,
                buffer.as_mut_ptr() as *mut _,
                buffer.len() as u32,
                &mut bytes_returned,
                null_mut(),
            )
        };

        if succeeded == 0 {
            let error = io::Error::last_os_error();
            match error.raw_os_error() {
                Some(code)
                    if code == ERROR_HANDLE_EOF as i32 || code == ERROR_NO_MORE_FILES as i32 =>
                {
                    break;
                }
                _ => {
                    return Err(io::Error::new(
                        error.kind(),
                        format!("FSCTL_ENUM_USN_DATA failed: {error}"),
                    ));
                }
            }
        }

        if bytes_returned as usize <= size_of::<u64>() {
            break;
        }

        enum_state.StartFileReferenceNumber =
            u64::from_le_bytes(buffer[..8].try_into().expect("next file reference number"));

        let mut offset = size_of::<u64>();
        while offset < bytes_returned as usize {
            let (record, record_length, record_format) =
                parse_raw_record(&buffer[offset..bytes_returned as usize])?;

            if let Some(existing) = id_format {
                if existing != record_format {
                    return Err(io::Error::other(
                        "volume returned mixed USN record formats during enumeration",
                    ));
                }
            } else {
                id_format = Some(record_format);
            }

            records.push(record);
            offset += record_length;
        }
    }

    Ok((records, id_format.unwrap_or(IdFormat::Legacy64)))
}

#[cfg(windows)]
fn parse_raw_record(bytes: &[u8]) -> io::Result<(RawRecord, usize, IdFormat)> {
    if bytes.len() < 8 {
        return Err(io::Error::other("truncated USN record header"));
    }

    let record_length = u32::from_le_bytes(bytes[..4].try_into().expect("record length")) as usize;
    let major_version = u16::from_le_bytes(bytes[4..6].try_into().expect("record version"));

    if record_length == 0 || record_length > bytes.len() {
        return Err(io::Error::other("invalid USN record length"));
    }

    match major_version {
        2 => {
            let record =
                unsafe { std::ptr::read_unaligned(bytes.as_ptr() as *const USN_RECORD_V2) };
            let name = parse_record_name(
                &bytes[..record_length],
                record.FileNameOffset as usize,
                record.FileNameLength as usize,
            )?;

            Ok((
                RawRecord {
                    id: FileReference::from_u64(record.FileReferenceNumber),
                    parent_id: FileReference::from_u64(record.ParentFileReferenceNumber),
                    name,
                    kind: entry_kind_from_attributes(record.FileAttributes),
                    file_reference_number: record.FileReferenceNumber,
                },
                record_length,
                IdFormat::Legacy64,
            ))
        }
        3 => {
            let record =
                unsafe { std::ptr::read_unaligned(bytes.as_ptr() as *const USN_RECORD_V3) };
            let name = parse_record_name(
                &bytes[..record_length],
                record.FileNameOffset as usize,
                record.FileNameLength as usize,
            )?;

            let id = FileReference::from_file_id_128(record.FileReferenceNumber);

            Ok((
                RawRecord {
                    id,
                    parent_id: FileReference::from_file_id_128(record.ParentFileReferenceNumber),
                    name,
                    kind: entry_kind_from_attributes(record.FileAttributes),
                    file_reference_number: id.legacy_part(),
                },
                record_length,
                IdFormat::Extended128,
            ))
        }
        _ => Err(io::Error::other(format!(
            "unsupported USN record version {major_version}"
        ))),
    }
}

#[cfg(windows)]
fn parse_record_name(bytes: &[u8], offset: usize, length: usize) -> io::Result<String> {
    if length % 2 != 0 || offset > bytes.len() || offset + length > bytes.len() {
        return Err(io::Error::other("invalid USN file name bounds"));
    }

    let mut utf16 = Vec::with_capacity(length / 2);
    for chunk in bytes[offset..offset + length].chunks_exact(2) {
        utf16.push(u16::from_le_bytes([chunk[0], chunk[1]]));
    }

    Ok(String::from_utf16_lossy(&utf16))
}

#[cfg(windows)]
fn entry_kind_from_attributes(attributes: u32) -> EntryKind {
    if attributes & FILE_ATTRIBUTE_DIRECTORY != 0 {
        EntryKind::Directory
    } else {
        EntryKind::File
    }
}

#[cfg(windows)]
fn resolve_file_size(
    volume_handle: HANDLE,
    file_reference_number: u64,
    file_record_buffer: &mut FileRecordQueryBuffer,
) -> Option<u64> {
    query_file_size_from_file_record(volume_handle, file_reference_number, file_record_buffer).ok()
}

#[cfg(windows)]
fn query_file_size_from_file_record(
    volume_handle: HANDLE,
    file_reference_number: u64,
    file_record_buffer: &mut FileRecordQueryBuffer,
) -> io::Result<u64> {
    let requested_segment_number = file_record_segment_number(file_reference_number);
    let mut input = NTFS_FILE_RECORD_INPUT_BUFFER {
        FileReferenceNumber: requested_segment_number as i64,
    };
    let mut bytes_returned = 0u32;
    let ok = unsafe {
        DeviceIoControl(
            volume_handle,
            FSCTL_GET_NTFS_FILE_RECORD,
            &mut input as *mut _ as *mut _,
            size_of::<NTFS_FILE_RECORD_INPUT_BUFFER>() as u32,
            file_record_buffer.output.as_mut_ptr() as *mut _,
            file_record_buffer.output.len() as u32,
            &mut bytes_returned,
            null_mut(),
        )
    };

    if ok == 0 {
        return Err(io::Error::new(
            io::ErrorKind::Other,
            format!(
                "FSCTL_GET_NTFS_FILE_RECORD failed for file reference {file_reference_number}: {}",
                io::Error::last_os_error()
            ),
        ));
    }

    parse_file_record_output(
        file_reference_number,
        &file_record_buffer.output[..bytes_returned as usize],
    )
}

#[cfg(windows)]
fn parse_file_record_output(requested_file_reference_number: u64, bytes: &[u8]) -> io::Result<u64> {
    const OUTPUT_HEADER_SIZE: usize = size_of::<i64>() + size_of::<u32>();
    if bytes.len() < OUTPUT_HEADER_SIZE {
        return Err(io::Error::other("truncated NTFS file record output"));
    }

    let returned_file_reference_number = i64::from_le_bytes(
        bytes[..size_of::<i64>()]
            .try_into()
            .expect("file reference number"),
    ) as u64;
    if file_record_segment_number(returned_file_reference_number)
        != file_record_segment_number(requested_file_reference_number)
    {
        return Err(io::Error::other(format!(
            "returned file reference {returned_file_reference_number} did not match requested {requested_file_reference_number}"
        )));
    }

    let file_record_length = u32::from_le_bytes(
        bytes[size_of::<i64>()..OUTPUT_HEADER_SIZE]
            .try_into()
            .expect("file record length"),
    ) as usize;
    if bytes.len() < OUTPUT_HEADER_SIZE + file_record_length {
        return Err(io::Error::other("incomplete NTFS file record payload"));
    }

    parse_file_record_size(&bytes[OUTPUT_HEADER_SIZE..OUTPUT_HEADER_SIZE + file_record_length])
}

#[cfg(windows)]
fn parse_file_record_size(record: &[u8]) -> io::Result<u64> {
    const ATTR_TYPE_ATTRIBUTE_LIST: u32 = 0x20;
    const ATTR_TYPE_FILE_NAME: u32 = 0x30;
    const ATTR_TYPE_DATA: u32 = 0x80;
    const ATTR_TYPE_END: u32 = 0xFFFF_FFFF;
    const FILE_RECORD_SIGNATURE: &[u8; 4] = b"FILE";

    if record.len() < 24 {
        return Err(io::Error::other("truncated file record header"));
    }
    if &record[..4] != FILE_RECORD_SIGNATURE {
        return Err(io::Error::other("invalid file record signature"));
    }

    let first_attribute_offset =
        u16::from_le_bytes(record[20..22].try_into().expect("first attribute offset")) as usize;
    if first_attribute_offset >= record.len() {
        return Err(io::Error::other("invalid first attribute offset"));
    }

    let mut attribute_list_present = false;
    let mut unnamed_data_size = None::<u64>;
    let mut file_name_size = None::<u64>;
    let mut offset = first_attribute_offset;

    while offset + 16 <= record.len() {
        let attribute_type = u32::from_le_bytes(
            record[offset..offset + 4]
                .try_into()
                .expect("attribute type"),
        );
        if attribute_type == ATTR_TYPE_END {
            break;
        }

        let record_length = u32::from_le_bytes(
            record[offset + 4..offset + 8]
                .try_into()
                .expect("attribute length"),
        ) as usize;
        if record_length == 0 || offset + record_length > record.len() {
            return Err(io::Error::other("invalid attribute record length"));
        }

        let non_resident = record[offset + 8] != 0;
        let name_length = record[offset + 9];

        match attribute_type {
            ATTR_TYPE_ATTRIBUTE_LIST => attribute_list_present = true,
            ATTR_TYPE_FILE_NAME if !non_resident => {
                if let Some(size) = parse_file_name_attribute(record, offset, record_length)? {
                    file_name_size = Some(size);
                }
            }
            ATTR_TYPE_DATA if name_length == 0 => {
                if let Some(size) =
                    parse_data_attribute(record, offset, record_length, non_resident)?
                {
                    unnamed_data_size =
                        Some(unnamed_data_size.map_or(size, |existing| existing.max(size)));
                }
            }
            _ => {}
        }

        offset += record_length;
    }

    unnamed_data_size.or(file_name_size).ok_or_else(|| {
        let detail = if attribute_list_present {
            "file record size lives outside the base record"
        } else {
            "file record did not expose a usable size attribute"
        };
        io::Error::other(detail)
    })
}

#[cfg(windows)]
fn parse_data_attribute(
    record: &[u8],
    offset: usize,
    record_length: usize,
    non_resident: bool,
) -> io::Result<Option<u64>> {
    if non_resident {
        if record_length < 56 {
            return Err(io::Error::other("truncated non-resident data attribute"));
        }

        let file_size_offset = offset + 48;
        let file_size = i64::from_le_bytes(
            record[file_size_offset..file_size_offset + 8]
                .try_into()
                .expect("file size"),
        );
        return Ok(Some(file_size.max(0) as u64));
    }

    if record_length < 24 {
        return Err(io::Error::other("truncated resident data attribute"));
    }

    let value_length = u32::from_le_bytes(
        record[offset + 16..offset + 20]
            .try_into()
            .expect("resident value length"),
    );
    Ok(Some(value_length as u64))
}

#[cfg(windows)]
fn parse_file_name_attribute(
    record: &[u8],
    offset: usize,
    record_length: usize,
) -> io::Result<Option<u64>> {
    if record_length < 24 {
        return Err(io::Error::other("truncated file-name attribute"));
    }

    let value_length = u32::from_le_bytes(
        record[offset + 16..offset + 20]
            .try_into()
            .expect("file-name value length"),
    ) as usize;
    let value_offset = u16::from_le_bytes(
        record[offset + 20..offset + 22]
            .try_into()
            .expect("file-name value offset"),
    ) as usize;
    let value_start = offset + value_offset;
    let real_size_offset = value_start + 48;

    if value_offset >= record_length
        || value_length < 56
        || real_size_offset + 8 > offset + record_length
    {
        return Ok(None);
    }

    let real_size = i64::from_le_bytes(
        record[real_size_offset..real_size_offset + 8]
            .try_into()
            .expect("file-name real size"),
    );
    Ok(Some(real_size.max(0) as u64))
}

#[cfg(windows)]
fn wide_string(value: &str) -> Vec<u16> {
    OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(windows)]
fn wide_buffer_to_string(buffer: &[u16]) -> String {
    let length = buffer
        .iter()
        .position(|value| *value == 0)
        .unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..length])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn validate_root_path_only_accepts_local_volume_roots() {
        assert_eq!(
            validate_root_path(Path::new(r"C:\"))
                .expect("drive root")
                .root_path,
            r"C:\"
        );
        assert_eq!(
            validate_root_path(Path::new(r"\\?\C:\"))
                .expect("verbatim drive root")
                .root_path,
            r"C:\"
        );

        assert!(validate_root_path(Path::new(r"C:\Windows")).is_err());
        assert!(validate_root_path(Path::new(r"\\server\share\")).is_err());
        assert!(validate_root_path(Path::new("relative")).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn ntfs_fast_mode_only_accepts_fixed_drive_types() {
        assert!(supports_fast_ntfs_drive_type(DRIVE_FIXED));
        assert!(!supports_fast_ntfs_drive_type(
            super::win32::DRIVE_REMOVABLE
        ));
        assert!(!supports_fast_ntfs_drive_type(super::win32::DRIVE_RAMDISK));
    }

    #[test]
    fn build_snapshot_from_entries_aggregates_tree_sizes_and_counts() {
        let snapshot = build_snapshot_from_entries(
            Path::new(r"C:\"),
            "NTFS",
            FileReference::from_u64(5),
            vec![
                EnumeratedEntry::directory(10, 5, "Games"),
                EnumeratedEntry::file(11, 10, "game.bin", 32),
                EnumeratedEntry::file(12, 5, "notes.txt", 8),
            ],
        )
        .expect("snapshot");

        assert_eq!(snapshot.root_path, r"C:\");
        assert_eq!(snapshot.filesystem, "NTFS");
        assert_eq!(snapshot.files_scanned, 2);
        assert_eq!(snapshot.skipped_entries, 0);
        assert_eq!(snapshot.root.size_bytes, 40);
        assert_eq!(snapshot.root.skipped_children, 0);
        assert_eq!(snapshot.root.name, r"C:\");
        assert_eq!(snapshot.root.children.len(), 2);

        let games = &snapshot.root.children[0];
        assert_eq!(games.kind, EntryKind::Directory);
        assert_eq!(games.path, r"C:\Games");
        assert_eq!(games.size_bytes, 32);
        assert_eq!(games.children.len(), 1);
        assert_eq!(games.children[0].path, r"C:\Games\game.bin");

        let notes = &snapshot.root.children[1];
        assert_eq!(notes.kind, EntryKind::File);
        assert_eq!(notes.path, r"C:\notes.txt");
        assert_eq!(notes.size_bytes, 8);
        assert_eq!(notes.skipped_children, 0);
    }

    #[test]
    fn build_snapshot_counts_unresolved_files_as_skipped() {
        let snapshot = build_snapshot_from_entries(
            Path::new(r"C:\"),
            "NTFS",
            FileReference::from_u64(5),
            vec![
                EnumeratedEntry::file(10, 5, "notes.txt", 8),
                EnumeratedEntry::unresolved_file(11, 5, "unknown.bin"),
            ],
        )
        .expect("snapshot");

        assert_eq!(snapshot.files_scanned, 1);
        assert_eq!(snapshot.skipped_entries, 1);
        assert_eq!(snapshot.root.size_bytes, 8);
        assert_eq!(snapshot.root.skipped_children, 1);
        assert_eq!(snapshot.root.children.len(), 1);
        assert_eq!(snapshot.root.children[0].path, r"C:\notes.txt");
    }

    #[cfg(windows)]
    #[test]
    fn progress_builder_streams_three_level_directory_sizes() {
        let root = FileReference::from_u64(5);
        let users = FileReference::from_u64(10);
        let admin = FileReference::from_u64(11);
        let cache = FileReference::from_u64(12);
        let pagefile = FileReference::from_u64(13);
        let records = vec![
            RawRecord {
                id: users,
                parent_id: root,
                name: "Users".to_owned(),
                kind: EntryKind::Directory,
                file_reference_number: 10,
            },
            RawRecord {
                id: admin,
                parent_id: users,
                name: "Admin".to_owned(),
                kind: EntryKind::Directory,
                file_reference_number: 11,
            },
            RawRecord {
                id: cache,
                parent_id: admin,
                name: "cache.bin".to_owned(),
                kind: EntryKind::File,
                file_reference_number: 12,
            },
            RawRecord {
                id: pagefile,
                parent_id: root,
                name: "pagefile.sys".to_owned(),
                kind: EntryKind::File,
                file_reference_number: 13,
            },
        ];
        let mut builder = TopLevelProgressBuilder::new(r"C:\", "NTFS", root, &records);

        builder.observe(&records[2], Some(100));
        builder.observe(&records[3], Some(50));

        let snapshot = builder.to_snapshot();
        assert_eq!(snapshot.root.size_bytes, 150);
        assert_eq!(snapshot.files_scanned, 2);

        let users_entry = snapshot
            .root
            .children
            .iter()
            .find(|entry| entry.path == r"C:\Users")
            .expect("Users entry");
        assert_eq!(users_entry.size_bytes, 100);

        let admin_entry = users_entry
            .children
            .iter()
            .find(|entry| entry.path == r"C:\Users\Admin")
            .expect("Admin entry");
        assert_eq!(admin_entry.size_bytes, 100);
        assert_eq!(admin_entry.skipped_children, 0);
        assert_eq!(admin_entry.children.len(), 1);
        assert_eq!(admin_entry.children[0].path, r"C:\Users\Admin\cache.bin");
        assert_eq!(admin_entry.children[0].size_bytes, 100);

        let pagefile_entry = snapshot
            .root
            .children
            .iter()
            .find(|entry| entry.path == r"C:\pagefile.sys")
            .expect("root file entry");
        assert_eq!(pagefile_entry.size_bytes, 50);
    }

    #[cfg(windows)]
    #[test]
    fn parse_file_record_uses_file_name_real_size_when_present() {
        let mut record = vec![0u8; 160];
        record[..4].copy_from_slice(b"FILE");
        record[20..22].copy_from_slice(&(48u16).to_le_bytes());

        let attribute_offset = 48usize;
        let attribute_length = 88usize;
        record[attribute_offset..attribute_offset + 4].copy_from_slice(&(0x30u32).to_le_bytes());
        record[attribute_offset + 4..attribute_offset + 8]
            .copy_from_slice(&(attribute_length as u32).to_le_bytes());
        record[attribute_offset + 8] = 0;
        record[attribute_offset + 16..attribute_offset + 20]
            .copy_from_slice(&(64u32).to_le_bytes());
        record[attribute_offset + 20..attribute_offset + 22]
            .copy_from_slice(&(24u16).to_le_bytes());

        let value_start = attribute_offset + 24;
        record[value_start + 48..value_start + 56].copy_from_slice(&(1234i64).to_le_bytes());
        let end_offset = attribute_offset + attribute_length;
        record[end_offset..end_offset + 4].copy_from_slice(&0xFFFF_FFFFu32.to_le_bytes());

        assert_eq!(
            parse_file_record_size(&record).expect("file record size"),
            1234
        );
    }

    #[cfg(windows)]
    fn build_test_file_record_output(returned_file_reference_number: u64) -> Vec<u8> {
        let mut record = vec![0u8; 160];
        record[..4].copy_from_slice(b"FILE");
        record[20..22].copy_from_slice(&(48u16).to_le_bytes());

        let attribute_offset = 48usize;
        let attribute_length = 88usize;
        record[attribute_offset..attribute_offset + 4].copy_from_slice(&(0x30u32).to_le_bytes());
        record[attribute_offset + 4..attribute_offset + 8]
            .copy_from_slice(&(attribute_length as u32).to_le_bytes());
        record[attribute_offset + 8] = 0;
        record[attribute_offset + 16..attribute_offset + 20]
            .copy_from_slice(&(64u32).to_le_bytes());
        record[attribute_offset + 20..attribute_offset + 22]
            .copy_from_slice(&(24u16).to_le_bytes());

        let value_start = attribute_offset + 24;
        record[value_start + 48..value_start + 56].copy_from_slice(&(1234i64).to_le_bytes());
        let end_offset = attribute_offset + attribute_length;
        record[end_offset..end_offset + 4].copy_from_slice(&0xFFFF_FFFFu32.to_le_bytes());

        let mut output = Vec::with_capacity(size_of::<i64>() + size_of::<u32>() + record.len());
        output.extend_from_slice(&(returned_file_reference_number as i64).to_le_bytes());
        output.extend_from_slice(&(record.len() as u32).to_le_bytes());
        output.extend_from_slice(&record);
        output
    }

    #[cfg(windows)]
    #[test]
    fn parse_file_record_output_accepts_exact_requested_reference() {
        let output = build_test_file_record_output(42);

        assert_eq!(
            parse_file_record_output(42, &output).expect("matched file record output"),
            1234
        );
    }

    #[cfg(windows)]
    #[test]
    fn parse_file_record_output_accepts_sequence_number_differences_for_the_same_segment() {
        let requested = 0x0001_0000_0000_002A_u64;
        let returned = 0x0002_0000_0000_002A_u64;
        let output = build_test_file_record_output(returned);

        assert_eq!(
            parse_file_record_output(requested, &output)
                .expect("matched file record output with different sequence number"),
            1234
        );
    }

    #[cfg(windows)]
    #[test]
    fn parse_file_record_output_rejects_mismatched_returned_reference() {
        let requested = 0x0001_0000_0000_002A_u64;
        let returned = 0x0001_0000_0000_002B_u64;
        let output = build_test_file_record_output(returned);

        let error = parse_file_record_output(requested, &output)
            .expect_err("mismatched file record output");
        assert!(
            error.to_string().contains(&format!(
                "returned file reference {returned} did not match requested {requested}"
            )),
            "unexpected error: {error}"
        );
    }
}
