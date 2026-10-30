// DrgX Studio Native Windows Desktop Launcher (drgx-studio.exe)
// Starts the DrgX Studio local backend (:45280) + Void-bit C++17 Judge (:8080)
// and launches a native chromeless desktop window (--app mode) with zero VS Code dependency.

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <shellapi.h>
#include <string>
#include <vector>
#include <fstream>
#include <iostream>

#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "shell32.lib")

static bool file_exists(const std::string& p) {
    DWORD attr = GetFileAttributesA(p.c_str());
    return (attr != INVALID_FILE_ATTRIBUTES && !(attr & FILE_ATTRIBUTE_DIRECTORY));
}

static std::string exe_dir() {
    char buf[MAX_PATH] = {0};
    GetModuleFileNameA(NULL, buf, MAX_PATH);
    std::string s(buf);
    size_t pos = s.find_last_of("\\/");
    return (pos == std::string::npos) ? "." : s.substr(0, pos);
}

static bool is_port_open(int port) {
    SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (s == INVALID_SOCKET) return false;
    u_long mode = 1;
    ioctlsocket(s, FIONBIO, &mode);

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons((u_short)port);
    inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

    connect(s, (sockaddr*)&addr, sizeof(addr));
    fd_set writefds;
    FD_ZERO(&writefds);
    FD_SET(s, &writefds);
    timeval tv{0, 180 * 1000}; // 180ms
    int r = select(0, NULL, &writefds, NULL, &tv);
    closesocket(s);
    return r > 0;
}

static std::string find_node_exe() {
    char localApp[MAX_PATH] = {0};
    GetEnvironmentVariableA("LOCALAPPDATA", localApp, MAX_PATH);
    std::vector<std::string> candidates = {
        std::string(localApp) + "\\Programs\\nodejs\\node.exe",
        "C:\\Program Files\\nodejs\\node.exe",
        "C:\\Program Files (x86)\\nodejs\\node.exe",
        "C:\\msys64\\ucrt64\\bin\\node.exe"
    };
    for (const auto& c : candidates) {
        if (file_exists(c)) return c;
    }
    return "node.exe";
}

static std::string find_app_browser() {
    std::vector<std::string> browsers = {
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
    };
    for (const auto& b : browsers) {
        if (file_exists(b)) return b;
    }
    return "";
}

static void spawn_background(const std::string& cmdLine, const std::string& workDir) {
    STARTUPINFOA si{};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    PROCESS_INFORMATION pi{};
    std::vector<char> mutableCmd(cmdLine.begin(), cmdLine.end());
    mutableCmd.push_back('\0');

    if (CreateProcessA(
            NULL,
            mutableCmd.data(),
            NULL,
            NULL,
            FALSE,
            CREATE_NO_WINDOW | DETACHED_PROCESS,
            NULL,
            workDir.empty() ? NULL : workDir.c_str(),
            &si,
            &pi)) {
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }
}

int main(int argc, char* argv[]) {
    WSADATA wsa;
    WSAStartup(MAKEWORD(2, 2), &wsa);

    bool serverOnly = false;
    int port = 45280;
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--server-only" || arg == "--no-window") serverOnly = true;
        if (arg == "--version" || arg == "-v") {
            std::cout << "DrgX Studio Standalone App v2.5.0\n";
            WSACleanup();
            return 0;
        }
    }

    std::string dir = exe_dir();
    std::string serverJs = dir + "\\studio\\server.js";
    std::string studioDir = dir + "\\studio";
    if (!file_exists(serverJs)) {
        serverJs = dir + "\\server.js";
        studioDir = dir;
    }

    if (!is_port_open(port)) {
        std::string nodeExe = find_node_exe();
        std::string cmd = "\"" + nodeExe + "\" \"" + serverJs + "\" " + std::to_string(port);
        spawn_background(cmd, studioDir);
        for (int i = 0; i < 30; ++i) {
            if (is_port_open(port)) break;
            Sleep(100);
        }
    }

    std::string url = "http://127.0.0.1:" + std::to_string(port);
    std::cout << "DrgX Studio ready at " << url << "\n";

    if (!serverOnly) {
        std::string browser = find_app_browser();
        if (!browser.empty()) {
            std::string cmd = "\"" + browser + "\" --app=" + url + " --window-size=1440,900";
            STARTUPINFOA si{};
            si.cb = sizeof(si);
            PROCESS_INFORMATION pi{};
            std::vector<char> mutableCmd(cmd.begin(), cmd.end());
            mutableCmd.push_back('\0');
            if (CreateProcessA(NULL, mutableCmd.data(), NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
                CloseHandle(pi.hProcess);
                CloseHandle(pi.hThread);
            } else {
                ShellExecuteA(NULL, "open", url.c_str(), NULL, NULL, SW_SHOWNORMAL);
            }
        } else {
            ShellExecuteA(NULL, "open", url.c_str(), NULL, NULL, SW_SHOWNORMAL);
        }
    }

    WSACleanup();
    return 0;
}
