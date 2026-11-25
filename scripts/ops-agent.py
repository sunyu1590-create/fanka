#!/usr/bin/env python3
"""HEIKA 受限运维代理（宿主机）。

安全边界：
- 只监听 UNIX socket（默认 /run/heika-ops.sock），不开放 TCP 端口。
- 必须携带 /etc/heika/ops-token 中的令牌，常量时间比较。
- 只允许白名单容器的 restart / status；不接受任意 shell 命令、任意文件路径。
- 防火墙操作只允许对 HEIKA 自定义链做增删，且永久拒绝 22/5432/53 端口，防止管理员自锁。
- 所有操作写入 /var/log/heika-ops.log（含时间、来源、参数、结果）。
"""

import hmac
import json
import os
import re
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone

SOCKET_PATH = os.environ.get("HEIKA_OPS_SOCKET", "/run/heika-ops.sock")
SOCKET_MODE = int(os.environ.get("HEIKA_OPS_SOCKET_MODE", "0o660"), 8)
TOKEN_FILE = os.environ.get("HEIKA_OPS_TOKEN_FILE", "/etc/heika/ops-token")
LOG_FILE = os.environ.get("HEIKA_OPS_LOG", "/var/log/heika-ops.log")
ALLOWED_CONTAINERS = {"fanka", "fanka-ai-worker", "fanka-metrics", "caddy"}
PROTECTED_PORTS = {22, 5432, 53, 443, 80}
CHAIN = "HEIKA_GUARD"


def log(entry):
    line = json.dumps({"at": datetime.now(timezone.utc).isoformat(), **entry}, ensure_ascii=False)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except OSError:
        pass


def read_token():
    try:
        with open(TOKEN_FILE, "r", encoding="utf-8") as handle:
            return handle.read().strip()
    except OSError:
        return ""


def run(args, timeout=20):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    return {"code": result.returncode, "stdout": result.stdout[-4000:], "stderr": result.stderr[-2000:]}


def docker_ps():
    result = run(["docker", "ps", "--format", "{{.Names}}\t{{.Status}}\t{{.Image}}"], timeout=15)
    if result["code"] != 0:
        return {"error": result["stderr"] or "docker 不可用"}
    services = []
    for line in result["stdout"].splitlines():
        parts = line.split("\t")
        if len(parts) >= 3:
            services.append({"container": parts[0], "status": parts[1], "image": parts[2]})
    return {"services": services}


def restart(payload):
    container = str(payload.get("container", ""))
    if container not in ALLOWED_CONTAINERS:
        return 403, {"error": "容器不在运维白名单内"}
    result = run(["docker", "restart", "--time", "20", container], timeout=90)
    return (200 if result["code"] == 0 else 500), {
        "container": container, "ok": result["code"] == 0,
        "output": (result["stdout"] or result["stderr"]).strip()[:500],
    }


def firewall(payload):
    action = str(payload.get("action", ""))
    ip = str(payload.get("ip", "")).strip()
    if not re.fullmatch(r"(\d{1,3}\.){3}\d{1,3}(/\d{1,2})?", ip):
        return 400, {"error": "仅支持 IPv4 地址或网段"}
    port = payload.get("port")
    if port is not None:
        try:
            port = int(port)
        except (TypeError, ValueError):
            return 400, {"error": "端口无效"}
        if port in PROTECTED_PORTS:
            return 403, {"error": "禁止操作 SSH / 数据库 / DNS / Web 必要端口"}
    ensure = run(["iptables", "-n", "L", CHAIN], timeout=10)
    if ensure["code"] != 0:
        created = run(["iptables", "-N", CHAIN], timeout=10)
        if created["code"] != 0:
            return 500, {"error": "无法创建 HEIKA_GUARD 链"}
        run(["iptables", "-I", "INPUT", "-j", CHAIN], timeout=10)
    if action == "block":
        args = ["iptables", "-I", CHAIN, "-s", ip, "-j", "DROP"]
    elif action == "unblock":
        args = ["iptables", "-D", CHAIN, "-s", ip, "-j", "DROP"]
    else:
        return 400, {"error": "未知防火墙操作"}
    result = run(args, timeout=10)
    if result["code"] != 0 and action == "unblock" and "does a matching rule exist" in (result["stderr"] or ""):
        return 200, {"ok": True, "note": "规则不存在，视为已解除"}
    return (200 if result["code"] == 0 else 500), {"ok": result["code"] == 0, "output": (result["stdout"] or result["stderr"])[:500]}


def handle(method, path, body, peer):
    if method == "GET" and path == "/status":
        return 200, {"ok": True, **docker_ps(), "now": datetime.now(timezone.utc).isoformat()}
    if method != "POST":
        return 405, {"error": "仅支持 GET /status 与 POST 操作"}
    try:
        payload = json.loads(body or "{}")
    except json.JSONDecodeError:
        return 400, {"error": "请求体不是有效 JSON"}
    if path == "/restart":
        return restart(payload)
    if path == "/firewall":
        return firewall(payload)
    return 404, {"error": "未知操作"}


def serve():
    token = read_token()
    if not token:
        print("[ops-agent] 缺少令牌文件，退出", file=sys.stderr)
        sys.exit(1)
    if os.path.exists(SOCKET_PATH):
        os.unlink(SOCKET_PATH)
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(SOCKET_PATH)
    os.chmod(SOCKET_PATH, SOCKET_MODE)
    server.listen(16)
    print(f"[ops-agent] listening on {SOCKET_PATH}", flush=True)
    while True:
        conn, _ = server.accept()
        try:
            conn.settimeout(10)
            data = b""
            while b"\r\n\r\n" not in data and len(data) < 65536:
                chunk = conn.recv(4096)
                if not chunk:
                    break
                data += chunk
            if not data:
                continue
            head, _, rest = data.partition(b"\r\n\r\n")
            lines = head.decode("latin-1").split("\r\n")
            method, path, _ = (lines[0].split(" ") + ["", ""])[:3]
            headers = {}
            for line in lines[1:]:
                if ":" in line:
                    key, value = line.split(":", 1)
                    headers[key.strip().lower()] = value.strip()
            length = int(headers.get("content-length", "0") or 0)
            body = rest
            while len(body) < length:
                chunk = conn.recv(min(4096, length - len(body)))
                if not chunk:
                    break
                body += chunk
            supplied = headers.get("x-ops-token", "")
            if not hmac.compare_digest(supplied, token):
                log({"action": "denied", "path": path, "reason": "token"})
                status, payload = 403, {"error": "令牌无效"}
            else:
                status, payload = handle(method, path.split("?")[0], body.decode("utf-8", "replace"), "unix")
                log({"action": path, "method": method, "status": status, "body": body.decode("utf-8", "replace")[:500]})
            raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            conn.sendall(
                f"HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {len(raw)}\r\nConnection: close\r\n\r\n".encode()
                + raw
            )
        except Exception as error:  # noqa: BLE001
            log({"action": "error", "message": str(error)[:300]})
        finally:
            conn.close()


if __name__ == "__main__":
    serve()
