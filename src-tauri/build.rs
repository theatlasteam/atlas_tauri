fn main() {
    // Desktop window icon is the FG mark only (see icons/logo-fg.png).
    println!("cargo:rerun-if-changed=icons/logo-fg.png");
    tauri_build::build()
}
