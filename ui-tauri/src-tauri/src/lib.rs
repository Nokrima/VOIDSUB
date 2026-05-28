use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::SystemTime,
};

#[cfg(target_os = "windows")]
use std::sync::Arc;
use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, Wry,
};

#[cfg(target_os = "windows")]
use windows_sys::Win32::Graphics::Dwm::DwmSetWindowAttribute;
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::Threading::GetCurrentThreadId;
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, UnregisterHotKey, MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, MOD_SHIFT, VK_DELETE,
    VK_DOWN, VK_END, VK_F1, VK_F10, VK_F11, VK_F12, VK_F2, VK_F3, VK_F4, VK_F5, VK_F6, VK_F7,
    VK_F8, VK_F9, VK_HOME, VK_INSERT, VK_LEFT, VK_NEXT, VK_NUMPAD0, VK_NUMPAD1, VK_NUMPAD2,
    VK_NUMPAD3, VK_NUMPAD4, VK_NUMPAD5, VK_NUMPAD6, VK_NUMPAD7, VK_NUMPAD8, VK_NUMPAD9, VK_PAUSE,
    VK_PRIOR, VK_RIGHT, VK_SCROLL, VK_UP,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetMessageW, PostThreadMessageW, MSG, WM_HOTKEY, WM_USER,
};

#[cfg(target_os = "windows")]
use window_vibrancy::apply_mica;
#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[cfg(target_os = "windows")]
const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
#[cfg(target_os = "windows")]
const DWMWCP_ROUND: u32 = 2;

struct TrayState {
    _icon: Mutex<Option<tauri::tray::TrayIcon<Wry>>>,
}

struct BackendState {
    port: Mutex<Option<String>>,
}

#[cfg(target_os = "windows")]
fn apply_rounded_corners(window: &tauri::WebviewWindow) {
    if let Ok(hwnd) = window.hwnd() {
        let preference = DWMWCP_ROUND;
        unsafe {
            let _ = DwmSetWindowAttribute(
                hwnd.0 as _,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                &preference as *const _ as _,
                std::mem::size_of::<u32>() as u32,
            );
        }
    }
}

#[derive(Serialize)]
struct UserProfileInfo {
    display_name: String,
    avatar_data_url: Option<String>,
}

fn current_display_name() -> String {
    env::var("USERNAME")
        .or_else(|_| env::var("USER"))
        .unwrap_or_else(|_| "S".to_string())
}

fn avatar_mime(path: &Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
    {
        Some(ext) if ext == "png" => Some("image/png"),
        Some(ext) if ext == "jpg" || ext == "jpeg" => Some("image/jpeg"),
        Some(ext) if ext == "webp" => Some("image/webp"),
        Some(ext) if ext == "bmp" => Some("image/bmp"),
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn candidate_avatar_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(appdata) = env::var("APPDATA") {
        dirs.push(
            PathBuf::from(appdata)
                .join("Microsoft")
                .join("Windows")
                .join("AccountPictures"),
        );
    }
    if let Ok(userprofile) = env::var("USERPROFILE") {
        dirs.push(
            PathBuf::from(userprofile)
                .join("AppData")
                .join("Roaming")
                .join("Microsoft")
                .join("Windows")
                .join("AccountPictures"),
        );
    }
    dirs
}

#[cfg(not(target_os = "windows"))]
fn candidate_avatar_dirs() -> Vec<PathBuf> {
    Vec::new()
}

fn latest_avatar_file() -> Option<PathBuf> {
    let mut latest: Option<(SystemTime, PathBuf)> = None;
    for dir in candidate_avatar_dirs() {
        let Ok(entries) = fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() || avatar_mime(&path).is_none() {
                continue;
            }
            let modified = entry
                .metadata()
                .ok()
                .and_then(|meta| meta.modified().ok())
                .unwrap_or(SystemTime::UNIX_EPOCH);
            match &latest {
                Some((current, _)) if &modified <= current => {}
                _ => latest = Some((modified, path)),
            }
        }
    }
    latest.map(|(_, path)| path)
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn restore_main_window(app: AppHandle) {
    show_main_window(&app);
}

#[derive(Deserialize, Clone)]
pub struct ShortcutsMap {
    start_stop: String,
    select_region: String,
    hide_overlay: String,
    temporary_region: String,
}

/// WM_USER mesaj kodlari — hotkey thread'e gonderilir.
#[cfg(target_os = "windows")]
const WM_HOTKEY_UPDATE: u32 = WM_USER + 1;
#[cfg(target_os = "windows")]
const WM_HOTKEY_SUSPEND: u32 = WM_USER + 2;
#[cfg(target_os = "windows")]
const WM_HOTKEY_RESUME: u32 = WM_USER + 3;

/// Hotkey thread ile guvenli iletisim icin paylasilan durum.
#[cfg(target_os = "windows")]
struct HotkeyState {
    thread_id: Mutex<u32>,
    pending_shortcuts: Arc<Mutex<Option<ShortcutsMap>>>,
    /// Suspend oncesi tuslari saklar, resume'da geri yukler.
    suspended_shortcuts: Arc<Mutex<Option<ShortcutsMap>>>,
}

/// Shortcut string'i → (modifiers, vk_code) ciftine donusturur.
/// "Ctrl+Shift+F5" gibi combo tuslari da destekler.
#[cfg(target_os = "windows")]
fn parse_shortcut_string(s: &str) -> Option<(u32, u32)> {
    let parts: Vec<&str> = s.split('+').collect();
    let mut modifiers: u32 = MOD_NOREPEAT;
    let mut key_part = "";

    for part in &parts {
        match part.trim().to_uppercase().as_str() {
            "CTRL" | "CONTROL" => modifiers |= MOD_CONTROL,
            "SHIFT" => modifiers |= MOD_SHIFT,
            "ALT" => modifiers |= MOD_ALT,
            _ => key_part = part.trim(),
        }
    }

    let vk = match key_part.to_uppercase().as_str() {
        "F1" => Some(VK_F1 as u32),
        "F2" => Some(VK_F2 as u32),
        "F3" => Some(VK_F3 as u32),
        "F4" => Some(VK_F4 as u32),
        "F5" => Some(VK_F5 as u32),
        "F6" => Some(VK_F6 as u32),
        "F7" => Some(VK_F7 as u32),
        "F8" => Some(VK_F8 as u32),
        "F9" => Some(VK_F9 as u32),
        "F10" => Some(VK_F10 as u32),
        "F11" => Some(VK_F11 as u32),
        "F12" => Some(VK_F12 as u32),
        "ARROWLEFT" | "LEFT" => Some(VK_LEFT as u32),
        "ARROWRIGHT" | "RIGHT" => Some(VK_RIGHT as u32),
        "ARROWUP" | "UP" => Some(VK_UP as u32),
        "ARROWDOWN" | "DOWN" => Some(VK_DOWN as u32),
        "INSERT" => Some(VK_INSERT as u32),
        "DELETE" => Some(VK_DELETE as u32),
        "HOME" => Some(VK_HOME as u32),
        "END" => Some(VK_END as u32),
        "PAGEUP" => Some(VK_PRIOR as u32),
        "PAGEDOWN" => Some(VK_NEXT as u32),
        "NUMPAD0" => Some(VK_NUMPAD0 as u32),
        "NUMPAD1" => Some(VK_NUMPAD1 as u32),
        "NUMPAD2" => Some(VK_NUMPAD2 as u32),
        "NUMPAD3" => Some(VK_NUMPAD3 as u32),
        "NUMPAD4" => Some(VK_NUMPAD4 as u32),
        "NUMPAD5" => Some(VK_NUMPAD5 as u32),
        "NUMPAD6" => Some(VK_NUMPAD6 as u32),
        "NUMPAD7" => Some(VK_NUMPAD7 as u32),
        "NUMPAD8" => Some(VK_NUMPAD8 as u32),
        "NUMPAD9" => Some(VK_NUMPAD9 as u32),
        "PAUSE" => Some(VK_PAUSE as u32),
        "SCROLLLOCK" => Some(VK_SCROLL as u32),
        _ => None,
    };

    vk.map(|vk_code| (modifiers, vk_code))
}

#[tauri::command]
fn wait_for_backend(state: tauri::State<'_, BackendState>) -> Result<String, String> {
    loop {
        {
            let guard = state.port.lock().unwrap();
            if let Some(port) = guard.as_ref() {
                return Ok(port.clone());
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
}

/// Tum hotkey'leri unregister eder (ayni thread'den cagirilmalidir).
#[cfg(target_os = "windows")]
unsafe fn unregister_all_hotkeys() {
    let null_hwnd = std::ptr::null_mut();
    UnregisterHotKey(null_hwnd, 1);
    UnregisterHotKey(null_hwnd, 2);
    UnregisterHotKey(null_hwnd, 3);
    UnregisterHotKey(null_hwnd, 4);
}

/// Verilen shortcuts map'e gore hotkey'leri register eder (ayni thread'den cagirilmalidir).
#[cfg(target_os = "windows")]
unsafe fn register_shortcuts(shortcuts: &ShortcutsMap) {
    let null_hwnd = std::ptr::null_mut();
    if let Some((mods, vk)) = parse_shortcut_string(&shortcuts.start_stop) {
        RegisterHotKey(null_hwnd, 1, mods, vk);
    }
    if let Some((mods, vk)) = parse_shortcut_string(&shortcuts.select_region) {
        RegisterHotKey(null_hwnd, 2, mods, vk);
    }
    if let Some((mods, vk)) = parse_shortcut_string(&shortcuts.hide_overlay) {
        RegisterHotKey(null_hwnd, 3, mods, vk);
    }
    if let Some((mods, vk)) = parse_shortcut_string(&shortcuts.temporary_region) {
        RegisterHotKey(null_hwnd, 4, mods, vk);
    }
}

/// Hotkey'leri guncelle — thread-safe: hotkey thread'e WM_USER mesaji gonderir.
#[tauri::command]
#[cfg(target_os = "windows")]
fn update_hotkeys(app: AppHandle, shortcuts: ShortcutsMap) -> Result<String, String> {
    let state = app.state::<HotkeyState>();
    *state.pending_shortcuts.lock().unwrap() = Some(shortcuts);
    let thread_id = *state.thread_id.lock().unwrap();
    if thread_id != 0 {
        unsafe {
            PostThreadMessageW(thread_id, WM_HOTKEY_UPDATE, 0, 0);
        }
    }
    Ok("Hotkey update requested".to_string())
}

/// Duzenleme modunda hotkey'leri gecici olarak durdurur.
#[tauri::command]
#[cfg(target_os = "windows")]
fn suspend_hotkeys(app: AppHandle) -> Result<String, String> {
    let state = app.state::<HotkeyState>();
    let thread_id = *state.thread_id.lock().unwrap();
    if thread_id != 0 {
        unsafe {
            PostThreadMessageW(thread_id, WM_HOTKEY_SUSPEND, 0, 0);
        }
    }
    Ok("Hotkeys suspended".to_string())
}

/// Duzenleme modundan cikinca hotkey'leri geri yukler.
#[tauri::command]
#[cfg(target_os = "windows")]
fn resume_hotkeys(app: AppHandle) -> Result<String, String> {
    let state = app.state::<HotkeyState>();
    let thread_id = *state.thread_id.lock().unwrap();
    if thread_id != 0 {
        unsafe {
            PostThreadMessageW(thread_id, WM_HOTKEY_RESUME, 0, 0);
        }
    }
    Ok("Hotkeys resumed".to_string())
}

/// Non-Windows dummy implementations.
#[tauri::command]
#[cfg(not(target_os = "windows"))]
fn update_hotkeys(_shortcuts: ShortcutsMap) -> Result<String, String> {
    Ok("Platform does not support global hotkeys".to_string())
}
#[tauri::command]
#[cfg(not(target_os = "windows"))]
fn suspend_hotkeys() -> Result<String, String> {
    Ok("Platform does not support global hotkeys".to_string())
}
#[tauri::command]
#[cfg(not(target_os = "windows"))]
fn resume_hotkeys() -> Result<String, String> {
    Ok("Platform does not support global hotkeys".to_string())
}

/// Oyun tam ekrandayken de calisan global klavye kisayollari.
/// Thread-safe: register/unregister hep ayni thread'den yapilir.
/// WM_USER mesajlari ile disaridan update/suspend/resume istekleri alinir.
#[cfg(target_os = "windows")]
fn register_global_hotkeys(app_handle: tauri::AppHandle) {
    let pending = app_handle.state::<HotkeyState>().pending_shortcuts.clone();
    let suspended = app_handle
        .state::<HotkeyState>()
        .suspended_shortcuts
        .clone();

    std::thread::spawn(move || unsafe {
        // Thread ID'yi kaydet — diger thread'ler PostThreadMessageW ile mesaj gonderebilsin.
        let thread_id = GetCurrentThreadId();
        {
            let state = app_handle.state::<HotkeyState>();
            *state.thread_id.lock().unwrap() = thread_id;
        }

        // Varsayilan tuslari kaydet (F9-F12).
        let default_shortcuts = ShortcutsMap {
            start_stop: "F8".to_string(),
            select_region: "F9".to_string(),
            hide_overlay: "F11".to_string(),
            temporary_region: "F10".to_string(),
        };
        register_shortcuts(&default_shortcuts);
        // Mevcut tuslari suspended'a kaydet (resume icin).
        *suspended.lock().unwrap() = Some(default_shortcuts);

        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) != 0 {
            match msg.message {
                WM_HOTKEY => {
                    let name = match msg.wParam as i32 {
                        1 => "start_stop",
                        2 => "select_region",
                        3 => "hide_overlay",
                        4 => "temporary_region",
                        _ => continue,
                    };
                    let _ = app_handle.emit("global-shortcut-triggered", name);
                }
                m if m == WM_HOTKEY_UPDATE => {
                    // Yeni tuslari pending'den al, register et.
                    if let Some(shortcuts) = pending.lock().unwrap().take() {
                        unregister_all_hotkeys();
                        register_shortcuts(&shortcuts);
                        *suspended.lock().unwrap() = Some(shortcuts);
                    }
                }
                m if m == WM_HOTKEY_SUSPEND => {
                    // Tum hotkey'leri kaldir (duzenleme modu).
                    unregister_all_hotkeys();
                }
                m if m == WM_HOTKEY_RESUME => {
                    // Son bilinen tuslari geri yukle.
                    if let Some(ref shortcuts) = *suspended.lock().unwrap() {
                        register_shortcuts(shortcuts);
                    }
                }
                _ => {}
            }
        }
    });
}

#[tauri::command]
fn get_user_profile_info() -> UserProfileInfo {
    let display_name = current_display_name();
    let avatar_data_url = latest_avatar_file().and_then(|path| {
        let mime = avatar_mime(&path)?;
        let bytes = fs::read(path).ok()?;
        Some(format!(
            "data:{};base64,{}",
            mime,
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes)
        ))
    });

    UserProfileInfo {
        display_name,
        avatar_data_url,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ));

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            get_user_profile_info,
            restore_main_window,
            update_hotkeys,
            suspend_hotkeys,
            resume_hotkeys,
            wait_for_backend
        ])
        .manage(BackendState {
            port: Mutex::new(None),
        })
        .setup(|app| {
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                use std::io::{BufRead, BufReader};
                use std::process::{Command, Stdio};

                #[cfg(not(debug_assertions))]
                let base_dir = app_handle.path().resource_dir().unwrap_or_default();
                #[cfg(debug_assertions)]
                let base_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("..")
                    .join("..")
                    .join("dist");

                let python_exe = base_dir.join("python_embedded").join("python.exe");
                let app_dir = base_dir.join("python_embedded").join("app");
                let script_name = "main.pyc";

                let mut cmd = Command::new(&python_exe);
                cmd.current_dir(&app_dir)
                    .arg(script_name)
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped());

                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
                }

                if let Ok(mut child) = cmd.spawn() {
                    #[cfg(target_os = "windows")]
                    {
                        use std::os::windows::io::AsRawHandle;

                        type HANDLE = *mut std::ffi::c_void;
                        type BOOL = i32;

                        #[repr(C)]
                        struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
                            pub per_process_user_time_limit: i64,
                            pub per_job_user_time_limit: i64,
                            pub limit_flags: u32,
                            pub minimum_working_set_size: usize,
                            pub maximum_working_set_size: usize,
                            pub active_process_limit: u32,
                            pub affinity: usize,
                            pub priority_class: u32,
                            pub scheduling_class: u32,
                        }

                        #[repr(C)]
                        struct IO_COUNTERS {
                            pub read_operation_count: u64,
                            pub write_operation_count: u64,
                            pub other_operation_count: u64,
                            pub read_transfer_count: u64,
                            pub write_transfer_count: u64,
                            pub other_transfer_count: u64,
                        }

                        #[repr(C)]
                        struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
                            pub basic_limit_information: JOBOBJECT_BASIC_LIMIT_INFORMATION,
                            pub io_info: IO_COUNTERS,
                            pub process_memory_limit: usize,
                            pub job_memory_limit: usize,
                            pub peak_process_memory_used: usize,
                            pub peak_job_memory_used: usize,
                        }

                        const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x2000;
                        const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION: u32 = 9;

                        extern "system" {
                            fn CreateJobObjectW(
                                lpJobAttributes: *const std::ffi::c_void,
                                lpName: *const u16,
                            ) -> HANDLE;
                            fn SetInformationJobObject(
                                hJob: HANDLE,
                                JobObjectInformationClass: u32,
                                lpJobObjectInformation: *const std::ffi::c_void,
                                cbJobObjectInformationLength: u32,
                            ) -> BOOL;
                            fn AssignProcessToJobObject(hJob: HANDLE, hProcess: HANDLE) -> BOOL;
                        }

                        unsafe {
                            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                            if !job.is_null() {
                                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION =
                                    std::mem::zeroed();
                                info.basic_limit_information.limit_flags =
                                    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                                SetInformationJobObject(
                                    job,
                                    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
                                    &info as *const _ as *const std::ffi::c_void,
                                    std::mem::size_of_val(&info) as u32,
                                );
                                AssignProcessToJobObject(job, child.as_raw_handle() as HANDLE);
                            }
                        }
                    }

                    if let Some(stdout) = child.stdout.take() {
                        let reader = BufReader::new(stdout);
                        let app_handle_clone = app_handle.clone();
                        std::thread::spawn(move || {
                            for line in reader.lines().map_while(Result::ok) {
                                log::info!("[PYTHON] {}", line);
                                if let Some(start) = line.find("[[VOIDSUB_WS_PORT:") {
                                    let port_str = &line[start + 18..];
                                    if let Some(end) = port_str.find("]]") {
                                        let port = &port_str[..end];
                                        let state: tauri::State<'_, BackendState> = app_handle_clone.state();
                                        *state.port.lock().unwrap() = Some(port.to_string());
                                        let _ = app_handle_clone.emit("backend-ready", port);
                                    }
                                }
                            }
                        });
                    }

                    if let Some(stderr) = child.stderr.take() {
                        let reader = BufReader::new(stderr);
                        std::thread::spawn(move || {
                            for line in reader.lines().map_while(Result::ok) {
                                log::error!("[PYTHON-ERR] {}", line);
                            }
                        });
                    }
                }
            });

            let tray_menu = MenuBuilder::new(app)
                .text("show_main", "VOIDSUB'ı Göster")
                .separator()
                .text("quit_app", "Çıkış")
                .build()?;

            let tray_icon = TrayIconBuilder::with_id("main-tray")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .tooltip("VOIDSUB")
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .expect("tray icon bulunamadi"),
                )
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(&tray.app_handle().clone());
                    }
                })
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show_main" => show_main_window(app),
                    "quit_app" => {
                        let _ = app.emit("tray-exit-requested", ());
                    }
                    _ => {}
                })
                .build(app)?;

            app.manage(TrayState {
                _icon: Mutex::new(Some(tray_icon)),
            });

            #[cfg(target_os = "windows")]
            app.manage(HotkeyState {
                thread_id: Mutex::new(0),
                pending_shortcuts: Arc::new(Mutex::new(None)),
                suspended_shortcuts: Arc::new(Mutex::new(None)),
            });

            let window = app.get_webview_window("main").expect("main window missing");

            #[cfg(debug_assertions)]
            window.open_devtools();

            #[cfg(target_os = "macos")]
            apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
                .expect("macOS vibrancy uygulanamadı");

            #[cfg(target_os = "windows")]
            {
                let _ = window.set_shadow(true);
                apply_rounded_corners(&window);
                apply_mica(&window, Some(true)).expect("Windows mica uygulanamadı");
            }

            // Oyun tam ekranındayken de calisan global kısayolları kaydet.
            #[cfg(target_os = "windows")]
            register_global_hotkeys(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Tauri çalıştırılırken bir hata oluştu");
}
