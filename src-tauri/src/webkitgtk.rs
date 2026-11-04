// WebKitGTK, il motore delle finestre su Linux (M75). WebView2 su Windows ha un visualizzatore di PDF suo;
// WebKitGTK ne ha uno basato su PDF.js, compilato nella libreria, dietro la "feature" `PDFJSViewer`. Nella
// 2.54 di Arch è accesa di suo, ma è nata sperimentale e spenta: la si accende comunque sulla finestra, così
// un PDF nell'iframe dell'anteprima (AssetView) si vede come su Windows invece di una pagina bianca anche con
// un WebKitGTK che la tiene spenta (verificato: con la feature spenta la pagina resta bianca).
//
// Le funzioni per le feature (`webkit_settings_get_all_features` & co.) esistono solo da WebKitGTK 2.42 e i
// binding del crate webkit2gtk non le hanno: si cercano a runtime con dlsym, così un WebKitGTK più vecchio
// non impedisce a Orbit di partire (resta solo la pagina bianca).
use std::ffi::{c_char, c_int, c_void, CStr};

/// Accende il visualizzatore di PDF incluso in WebKitGTK sulla finestra, se c'è.
pub fn enable_pdf_viewer(window: &tauri::WebviewWindow) {
    let _ = window.with_webview(|wv| {
        use webkit2gtk::glib::object::ObjectType;
        use webkit2gtk::WebViewExt;
        let Some(settings) = wv.inner().settings() else { return };
        // SAFETY: `settings` è un WebKitSettings vivo per tutta la chiamata (il wrapper ne tiene un riferimento)
        let ok = unsafe { set_feature(settings.as_ptr() as *mut c_void, c"PDFJSViewer", true) };
        if !ok {
            eprintln!("webkitgtk: PDF viewer not available in this WebKitGTK");
        }
    });
}

/// Accende o spegne una feature di WebKitGTK per identificatore. False se le funzioni o la feature non ci sono.
unsafe fn set_feature(settings: *mut c_void, id: &CStr, on: bool) -> bool {
    type GetAll = unsafe extern "C" fn() -> *mut c_void;
    type Len = unsafe extern "C" fn(*mut c_void) -> usize;
    type Get = unsafe extern "C" fn(*mut c_void, usize) -> *mut c_void;
    type Ident = unsafe extern "C" fn(*mut c_void) -> *const c_char;
    type SetEnabled = unsafe extern "C" fn(*mut c_void, *mut c_void, c_int);
    type Unref = unsafe extern "C" fn(*mut c_void);
    let sym = |name: &CStr| libc::dlsym(libc::RTLD_DEFAULT, name.as_ptr());
    let ptrs = [
        sym(c"webkit_settings_get_all_features"),
        sym(c"webkit_feature_list_get_length"),
        sym(c"webkit_feature_list_get"),
        sym(c"webkit_feature_get_identifier"),
        sym(c"webkit_settings_set_feature_enabled"),
        sym(c"webkit_feature_list_unref"),
    ];
    if ptrs.iter().any(|p| p.is_null()) {
        return false;
    }
    let get_all: GetAll = std::mem::transmute(ptrs[0]);
    let len: Len = std::mem::transmute(ptrs[1]);
    let get: Get = std::mem::transmute(ptrs[2]);
    let ident: Ident = std::mem::transmute(ptrs[3]);
    let set_enabled: SetEnabled = std::mem::transmute(ptrs[4]);
    let unref: Unref = std::mem::transmute(ptrs[5]);
    let list = get_all();
    if list.is_null() {
        return false;
    }
    let mut found = false;
    for i in 0..len(list) {
        let f = get(list, i);
        let name = if f.is_null() { std::ptr::null() } else { ident(f) };
        if !name.is_null() && CStr::from_ptr(name) == id {
            set_enabled(settings, f, on as c_int);
            found = true;
            break;
        }
    }
    unref(list);
    found
}
