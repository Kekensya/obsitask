//! Cache hasil parse daily note, berdasarkan mtime + ukuran file. Pemindaian
//! "Overdue & due" berjalan setiap polling (2 detik), jadi file yang tidak
//! berubah cukup di-`stat`, tidak dibaca dan di-parse ulang.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;

struct Entry<T> {
    mtime: SystemTime,
    len: u64,
    parsed: Arc<T>,
}

/// Cache hasil `parse` per file. `T` = hasil parse (mis. daftar task daily
/// note, atau list-list di Tasks.md).
pub struct NoteCache<T> {
    entries: HashMap<PathBuf, Entry<T>>,
    #[cfg(test)]
    reads: usize,
}

impl<T> Default for NoteCache<T> {
    fn default() -> Self {
        Self {
            entries: HashMap::new(),
            #[cfg(test)]
            reads: 0,
        }
    }
}

impl<T> NoteCache<T> {
    /// Hasil `parse` isi file `path`, atau `None` kalau file tidak ada / tidak
    /// terbaca. File hanya dibaca ulang kalau mtime atau ukurannya berubah.
    pub fn get(&mut self, path: &Path, parse: impl FnOnce(&str) -> T) -> Option<Arc<T>> {
        let meta = match std::fs::metadata(path) {
            Ok(m) if m.is_file() => m,
            _ => {
                self.entries.remove(path);
                return None;
            }
        };
        let (mtime, len) = (meta.modified().ok(), meta.len());
        if let (Some(e), Some(mtime)) = (self.entries.get(path), mtime) {
            if e.mtime == mtime && e.len == len {
                return Some(e.parsed.clone());
            }
        }
        let content = std::fs::read_to_string(path).ok()?;
        #[cfg(test)]
        {
            self.reads += 1;
        }
        let parsed = Arc::new(parse(&content));
        match mtime {
            Some(mtime) => {
                let entry = Entry { mtime, len, parsed: parsed.clone() };
                self.entries.insert(path.to_path_buf(), entry);
            }
            // Tanpa mtime tidak bisa tahu kapan berubah: jangan di-cache.
            None => {
                self.entries.remove(path);
            }
        }
        Some(parsed)
    }

    /// Buang entri di luar jendela pemindaian supaya cache tidak terus membesar.
    pub fn retain(&mut self, keep: impl Fn(&Path) -> bool) {
        self.entries.retain(|p, _| keep(p));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tasks::{parse_lists, parse_tasks, Task, TaskList};
    use std::time::Duration;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("obsitask-test-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn set_mtime(path: &Path, t: SystemTime) {
        std::fs::File::options().write(true).open(path).unwrap().set_modified(t).unwrap();
    }

    #[test]
    fn rereads_only_when_file_changes() {
        let dir = temp_dir("cache");
        let file = dir.join("2026-11-10.md");
        let mut cache: NoteCache<Vec<Task>> = NoteCache::default();

        // Belum ada.
        assert!(cache.get(&file, parse_tasks).is_none());
        assert_eq!(cache.reads, 0);

        std::fs::write(&file, "- [ ] a 📅 2026-11-12\n").unwrap();
        let t0 = SystemTime::now() - Duration::from_secs(60);
        set_mtime(&file, t0);
        assert_eq!(cache.get(&file, parse_tasks).unwrap()[0].title, "a");
        assert_eq!(cache.reads, 1);

        // Tidak berubah: tidak dibaca lagi.
        for _ in 0..5 {
            assert_eq!(cache.get(&file, parse_tasks).unwrap().len(), 1);
        }
        assert_eq!(cache.reads, 1);

        // Isi berubah, ukuran berbeda.
        std::fs::write(&file, "- [ ] a\n- [ ] b\n").unwrap();
        set_mtime(&file, t0);
        assert_eq!(cache.get(&file, parse_tasks).unwrap().len(), 2);
        assert_eq!(cache.reads, 2);

        // Ukuran sama, mtime berbeda.
        std::fs::write(&file, "- [x] a\n- [ ] b\n").unwrap();
        set_mtime(&file, t0 + Duration::from_secs(5));
        assert!(cache.get(&file, parse_tasks).unwrap()[0].done);
        assert_eq!(cache.reads, 3);

        // Dihapus: hilang dari cache juga.
        std::fs::remove_file(&file).unwrap();
        assert!(cache.get(&file, parse_tasks).is_none());
        assert!(cache.entries.is_empty());

        // retain membuang entri di luar jendela.
        let other = dir.join("2026-11-11.md");
        std::fs::write(&other, "- [ ] x\n").unwrap();
        cache.get(&other, parse_tasks);
        cache.retain(|p| p != other);
        assert!(cache.entries.is_empty());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn caches_any_parse_result() {
        let dir = temp_dir("lists");
        let file = dir.join("Tasks.md");
        let mut cache: NoteCache<Vec<TaskList>> = NoteCache::default();
        assert!(cache.get(&file, parse_lists).is_none());
        std::fs::write(&file, "## Inbox
- [ ] a
## Kuliah
").unwrap();
        let lists = cache.get(&file, parse_lists).unwrap();
        assert_eq!(lists.iter().map(|l| l.name.as_str()).collect::<Vec<_>>(), ["Inbox", "Kuliah"]);
        cache.get(&file, parse_lists);
        assert_eq!(cache.reads, 1);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
