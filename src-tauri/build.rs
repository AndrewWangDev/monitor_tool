fn main() {
    #[cfg(all(windows, target_env = "gnu"))]
    {
        if let Ok(path) = std::env::var("PATH") {
            let candidates = [
                r"C:\msys64\mingw64\bin",
                r"C:\msys64\ucrt64\bin",
                r"C:\msys64\clang64\bin",
                r"D:\msys64\mingw64\bin",
                r"D:\msys64\ucrt64\bin",
            ];
            for candidate in candidates {
                let p = std::path::Path::new(candidate);
                if p.exists() && !path.starts_with(candidate) {
                    let new_path = format!("{};{}", candidate, path);
                    std::env::set_var("PATH", new_path);
                    break;
                }
            }
        }
    }
    tauri_build::build();
}
