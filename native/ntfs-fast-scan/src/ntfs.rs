use std::collections::{HashMap, HashSet};
use std::io;
use std::path::{Path, PathBuf};

#[cfg(windows)]
use std::ffi::c_void;
#[cfg(windows)]
use std::ffi::OsStr;
#[cfg(windows)]
use std::mem::{size_of, zeroed};
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
#[cfg(windows)]
use std::ptr::{null, null_mut};

#[cfg(windows)]
use self::win32::{
    CloseHandle, CreateFileW, DeviceIoControl, FileIdInfo, FileIdType, FileStandardInfo,
    GetDriveTypeW, GetFileInformationByHandle, GetFileInformationByHandleEx,
    GetVolumeInformationW, OpenFileById, BY_HANDLE_FILE_INFORMATION, DRIVE_FIXED, DRIVE_RAMDISK,
    DRIVE_REMOVABLE, ERROR_HANDLE_EOF, ERROR_NO_MORE_FILES, FILE_ATTRIBUTE_DIRECTORY,
    FILE_FLAG_BACKUP_SEMANTICS, FILE_ID_128, FILE_ID_DESCRIPTOR, FILE_ID_INFO,
    FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, FILE_STANDARD_INFO,
    FILE_SUPPORTS_USN_JOURNAL, FSCTL_ENUM_USN_DATA, HANDLE, INVALID_HANDLE_VALUE,
    MFT_ENUM_DATA_V0, OPEN_EXISTING, USN_RECORD_V2, USN_RECORD_V3, ExtendedFileIdType,
};

const ROOT_PATH_ERROR: &str = "root path must be a local NTFS volume root like C:\\";
#[cfg(windows)]
const FILE_SHARES: u32 = FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE;
#[cfg(windows)]
const GENERIC_READ_ACCESS: u32 = 0x8000_0000;

#[cfg(windows)]
#[allow(non_camel_case_types, non_snake_case, non_upper_case_globals, dead_code)]
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

    pub const FileStandardInfo: u32 = 1;
    pub const FileIdInfo: u32 = 18;
    pub const FileIdType: u32 = 0;
    pub const ExtendedFileIdType: u32 = 2;

    pub const FSCTL_ENUM_USN_DATA: u32 = 590_003;

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
    pub struct FILE_STANDARD_INFO {
        pub AllocationSize: i64,
        pub EndOfFile: i64,
        pub NumberOfLinks: u32,
        pub DeletePending: u8,
        pub Directory: u8,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub union FILE_ID_DESCRIPTOR_0 {
        pub FileId: i64,
        pub ExtendedFileId: FILE_ID_128,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct FILE_ID_DESCRIPTOR {
        pub dwSize: u32,
        pub Type: u32,
        pub Anonymous: FILE_ID_DESCRIPTOR_0,
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
        pub fn OpenFileById(
            hvolumehint: HANDLE,
            lpfileid: *const FILE_ID_DESCRIPTOR,
            dwdesiredaccess: u32,
            dwsharemode: u32,
            lpsecurityattributes: *const c_void,
            dwflagsandattributes: u32,
        ) -> HANDLE;
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
    pub children: Vec<ScanEntry>,
}

#[derive(Clone, Debug)]
pub struct ScanSnapshot {
    pub root_path: String,
    pub filesystem: String,
    pub root: ScanEntry,
    pub files_scanned: u64,
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
}

#[derive(Clone, Debug)]
struct EnumeratedEntry {
    id: FileReference,
    parent_id: FileReference,
    name: String,
    kind: EntryKind,
    size_bytes: u64,
}

impl EnumeratedEntry {
    #[cfg(test)]
    fn file(id: u64, parent_id: u64, name: impl Into<String>, size_bytes: u64) -> Self {
        Self {
            id: FileReference::from_u64(id),
            parent_id: FileReference::from_u64(parent_id),
            name: name.into(),
            kind: EntryKind::File,
            size_bytes,
        }
    }

    #[cfg(test)]
    fn directory(id: u64, parent_id: u64, name: impl Into<String>) -> Self {
        Self {
            id: FileReference::from_u64(id),
            parent_id: FileReference::from_u64(parent_id),
            name: name.into(),
            kind: EntryKind::Directory,
            size_bytes: 0,
        }
    }

    #[cfg(windows)]
    fn from_parts(
        id: FileReference,
        parent_id: FileReference,
        name: String,
        kind: EntryKind,
        size_bytes: u64,
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

pub fn scan_volume(root: &Path) -> io::Result<ScanSnapshot> {
    #[cfg(windows)]
    {
        return scan_volume_windows(root);
    }

    #[cfg(not(windows))]
    {
        let _ = root;
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
    let mut built_children = Vec::with_capacity(root_children.len());

    for child_id in root_children {
        let entry = build_entry(
            child_id,
            Path::new(&root_path_string),
            &nodes,
            &mut visited,
            &mut files_scanned,
        )?;
        built_children.push(entry);
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
            children: built_children,
        },
        files_scanned,
    })
}

fn build_entry(
    node_id: FileReference,
    parent_path: &Path,
    nodes: &HashMap<FileReference, NodeRecord>,
    visited: &mut HashSet<FileReference>,
    files_scanned: &mut u64,
) -> io::Result<ScanEntry> {
    if !visited.insert(node_id) {
        return Err(io::Error::other("cycle detected while materializing NTFS tree"));
    }

    let node = nodes
        .get(&node_id)
        .ok_or_else(|| io::Error::other("missing node while materializing NTFS tree"))?;

    let mut absolute_path = PathBuf::from(parent_path);
    absolute_path.push(&node.name);
    let absolute_path_string = path_string(&absolute_path);

    let entry = match node.kind {
        EntryKind::File => {
            *files_scanned += 1;
            ScanEntry {
                path: absolute_path_string,
                name: node.name.clone(),
                kind: EntryKind::File,
                size_bytes: node.size_bytes,
                children: Vec::new(),
            }
        }
        EntryKind::Directory => {
            let mut child_ids = node.children.clone();
            sort_children(nodes, &mut child_ids);

            let mut children = Vec::with_capacity(child_ids.len());
            for child_id in child_ids {
                children.push(build_entry(
                    child_id,
                    Path::new(&absolute_path_string),
                    nodes,
                    visited,
                    files_scanned,
                )?);
            }

            let size_bytes = children.iter().map(|child| child.size_bytes).sum();

            ScanEntry {
                path: absolute_path_string,
                name: node.name.clone(),
                kind: EntryKind::Directory,
                size_bytes,
                children,
            }
        }
    };

    Ok(entry)
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
    size_bytes: u64,
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
    open_reference: OpenReference,
}

#[cfg(windows)]
#[derive(Clone, Copy, Debug)]
enum OpenReference {
    Legacy(u64),
    Extended([u8; 16]),
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
fn scan_volume_windows(root: &Path) -> io::Result<ScanSnapshot> {
    let validated_root = validate_root_path(root)?;
    let filesystem = query_volume_filesystem(&validated_root)?;
    let root_handle = open_root_handle(&validated_root)?;
    let root_identifiers = query_root_identifiers(root_handle.raw)?;
    let volume_handle = open_volume_handle(&validated_root)?;
    let (raw_records, id_format) = enumerate_mft_records(volume_handle.raw)?;

    let root_reference = match id_format {
        IdFormat::Legacy64 => FileReference::from_u64(root_identifiers.legacy_id),
        IdFormat::Extended128 => root_identifiers.extended_id,
    };

    let entries = raw_records
        .into_iter()
        .map(|record| {
            let size_bytes = match record.kind {
                EntryKind::File => query_file_size(root_handle.raw, record.open_reference),
                EntryKind::Directory => 0,
            };

            EnumeratedEntry::from_parts(
                record.id,
                record.parent_id,
                record.name,
                record.kind,
                size_bytes,
            )
        })
        .collect();

    build_snapshot_from_entries(
        Path::new(&validated_root.root_path),
        &filesystem,
        root_reference,
        entries,
    )
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
    if !matches!(drive_type, DRIVE_FIXED | DRIVE_REMOVABLE | DRIVE_RAMDISK) {
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
                Some(code) if code == ERROR_HANDLE_EOF as i32 || code == ERROR_NO_MORE_FILES as i32 => {
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
            let record = unsafe { std::ptr::read_unaligned(bytes.as_ptr() as *const USN_RECORD_V2) };
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
                    open_reference: OpenReference::Legacy(record.FileReferenceNumber),
                },
                record_length,
                IdFormat::Legacy64,
            ))
        }
        3 => {
            let record = unsafe { std::ptr::read_unaligned(bytes.as_ptr() as *const USN_RECORD_V3) };
            let name = parse_record_name(
                &bytes[..record_length],
                record.FileNameOffset as usize,
                record.FileNameLength as usize,
            )?;

            Ok((
                RawRecord {
                    id: FileReference::from_file_id_128(record.FileReferenceNumber),
                    parent_id: FileReference::from_file_id_128(record.ParentFileReferenceNumber),
                    name,
                    kind: entry_kind_from_attributes(record.FileAttributes),
                    open_reference: OpenReference::Extended(record.FileReferenceNumber.Identifier),
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
fn query_file_size(root_handle: HANDLE, open_reference: OpenReference) -> u64 {
    let file_handle = match open_file_by_id(root_handle, open_reference) {
        Ok(handle) => handle,
        Err(_) => return 0,
    };

    let mut file_info: FILE_STANDARD_INFO = unsafe { zeroed() };
    let ok = unsafe {
        GetFileInformationByHandleEx(
            file_handle.raw,
            FileStandardInfo,
            &mut file_info as *mut _ as *mut _,
            size_of::<FILE_STANDARD_INFO>() as u32,
        )
    };

    if ok == 0 || file_info.EndOfFile < 0 {
        0
    } else {
        file_info.EndOfFile as u64
    }
}

#[cfg(windows)]
fn open_file_by_id(root_handle: HANDLE, open_reference: OpenReference) -> io::Result<OwnedHandle> {
    let mut descriptor: FILE_ID_DESCRIPTOR = unsafe { zeroed() };
    descriptor.dwSize = size_of::<FILE_ID_DESCRIPTOR>() as u32;

    match open_reference {
        OpenReference::Legacy(file_id) => {
            descriptor.Type = FileIdType;
            descriptor.Anonymous.FileId = file_id as i64;
        }
        OpenReference::Extended(file_id) => {
            descriptor.Type = ExtendedFileIdType;
            descriptor.Anonymous.ExtendedFileId = FILE_ID_128 { Identifier: file_id };
        }
    }

    let handle = unsafe {
        OpenFileById(
            root_handle,
            &descriptor,
            0,
            FILE_SHARES,
            null(),
            FILE_FLAG_BACKUP_SEMANTICS,
        )
    };

    OwnedHandle::new(handle)
}

#[cfg(windows)]
fn wide_string(value: &str) -> Vec<u16> {
    OsStr::new(value).encode_wide().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn wide_buffer_to_string(buffer: &[u16]) -> String {
    let length = buffer.iter().position(|value| *value == 0).unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..length])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn validate_root_path_only_accepts_local_volume_roots() {
        assert_eq!(
            validate_root_path(Path::new(r"C:\")).expect("drive root").root_path,
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
        assert_eq!(snapshot.root.size_bytes, 40);
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
    }
}
