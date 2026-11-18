//! Cache hasil parse daily note, berdasarkan mtime + ukuran file. Pemindaian
//! "Overdue & due" berjalan setiap polling (2 detik), jadi file yang tidak
//! berubah cukup di-`stat`, tidak dibaca dan di-parse ulang.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;

use crate::tasks::{self, Task};

struct Entry {
    mtime: SystemTime,
    len: u64,
    tasks: Arc<Vec<Task>>,
}

#[derive(Default)]
pub struct NoteCache {
    entries: HashMap<PathBuf, Entry>,
    #[cfg(test)]
    reads: usize,
}

impl NoteCache {
    /// Task di file `path`, atau `None` kalau file tidak ada / tidak terbaca.
    pub fn tasks(&mut self, path: &Path) -> Option<Arc<Vec<Task>>> {
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
                return Some(e.tasks.clone());
            }
        }
        let content = std::fs::read_to_string(path).ok()?;
        #[cfg(test)]
        {
            self.reads += 1;
        }
        let tasks = Arc::new(tasks::parse_tasks(&content));
        match mtime {
            Some(mtime) => {
                let entry = Entry { mtime, len, tasks: tasks.clone() };
                self.entries.insert(path.to_path_buf(), entry);
            }
            // Tanpa mtime tidak bisa tahu kapan berubah: jangan di-cache.
            None => {
                self.entries.remove(path);
            }
        }
        Some(tasks)
    }

    /// Buang entri di luar jendela pemindaian supaya cache tidak terus membesar.
    pub fn retain(&mut self, keep: impl Fn(&Path) -> bool) {
        self.entries.retain(|p, _| keep(p));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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
        let mut cache = NoteCache::default();

        // Belum ada.
        assert!(cache.tasks(&file).is_none());
        assert_eq!(cache.reads, 0);

        std::fs::write(&file, "- [ ] a 📅 2026-11-12\n").unwrap();
        let t0 = SystemTime::now() - Duration::from_secs(60);
        set_mtime(&file, t0);
        assert_eq!(cache.tasks(&file).unwrap()[0].title, "a");
        assert_eq!(cache.reads, 1);

        // Tidak berubah: tidak dibaca lagi.
        for _ in 0..5 {
            assert_eq!(cache.tasks(&file).unwrap().len(), 1);
        }
        assert_eq!(cache.reads, 1);

        // Isi berubah, ukuran berbeda.
        std::fs::write(&file, "- [ ] a\n- [ ] b\n").unwrap();
        set_mtime(&file, t0);
        assert_eq!(cache.tasks(&file).unwrap().len(), 2);
        assert_eq!(cache.reads, 2);

        // Ukuran sama, mtime berbeda.
        std::fs::write(&file, "- [x] a\n- [ ] b\n").unwrap();
        set_mtime(&file, t0 + Duration::from_secs(5));
        assert!(cache.tasks(&file).unwrap()[0].done);
        assert_eq!(cache.reads, 3);

        // Dihapus: hilang dari cache juga.
        std::fs::remove_file(&file).unwrap();
        assert!(cache.tasks(&file).is_none());
        assert!(cache.entries.is_empty());

        // retain membuang entri di luar jendela.
        let other = dir.join("2026-11-11.md");
        std::fs::write(&other, "- [ ] x\n").unwrap();
        cache.tasks(&other);
        cache.retain(|p| p != other);
        assert!(cache.entries.is_empty());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
