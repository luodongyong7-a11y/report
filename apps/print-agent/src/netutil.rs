use local_ip_address::list_afinet_netifas;
use std::net::IpAddr;

pub fn lan_ips() -> Vec<String> {
    let Ok(ifaces) = list_afinet_netifas() else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for (_name, ip) in ifaces {
        match ip {
            IpAddr::V4(v4) if !v4.is_loopback() && !v4.is_link_local() => {
                let s = v4.to_string();
                if !out.contains(&s) {
                    out.push(s);
                }
            }
            _ => {}
        }
    }
    out.sort();
    out
}

pub fn platform_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "other"
    }
}
