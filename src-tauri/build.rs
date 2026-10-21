fn main() {
    #[cfg(all(windows, target_env = "gnu"))]
    {
        if let Ok(path) = std::env::var("PATH") {
            let mingw = std::path::Path::new(r"C:\msys64\mingw64\bin");
            if mingw.exists() && !path.starts_with(r"C:\msys64\mingw64\bin") {
                let new_path = format!(r"C:\msys64\mingw64\bin;{}", path);
                std::env::set_var("PATH", new_path);
            }
        }
    }
    tauri_build::build();
}
