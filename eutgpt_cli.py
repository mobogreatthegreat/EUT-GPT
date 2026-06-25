#!/usr/bin/env python3
"""EUT-GPT CLI Chat — Talk to EUT-GPT AI through the console.

Connects to an opencode server (started with `opencode serve`).
Streams responses in real-time via the event system.

Commands:
  /model [name]         List or switch model (e.g. opencode/deepseek-v4-flash-free@high)
  /reasoning <level>    Set reasoning effort via model variant
  /variant <name>       Explicitly set model variant
  /system [text]        Show or set system prompt
  /temperature [n]      Show or set temperature (0.0 - 2.0)
  /agents               List available agents
  /agent [name]         Show or set active agent
  /sessions             List sessions
  /new [title]          Create a new session
  /clear                Clear current session messages
  /history [n]          Show last N messages
  /export [file]        Export conversation to JSON file
  /config               Show current config
  /abort                Abort current running message
  /help                 Show this help
  /quit                 Exit
"""
from __future__ import annotations

import json
import os
import shlex
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# ── Config ──────────────────────────────────────────────────────────────────

VERSION = "1.0.0"

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 4096

BASE_URL = os.environ.get(
    "OPENCODE_SERVER_URL", f"http://{DEFAULT_HOST}:{DEFAULT_PORT}"
)

REASONING_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"]

DEFAULT_SYSTEM_PROMPT = (
    "You are an AI assistant that can ONLY respond using information from "
    "https://eutwiki.com. You must not use any external knowledge, training data, "
    "or any other sources. If the information is not available on eutwiki.com, "
    "you must clearly state that the information is not available on eutwiki.com "
    "rather than making up an answer. Always cite eutwiki.com as your source."
)

STATE_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), ".eutgpt_cli_state.json"
)

# ── API helpers ─────────────────────────────────────────────────────────────

_EMPTY_OK = object()

def _api(
    method: str,
    path: str,
    body: dict | None = None,
    timeout: int = 300,
) -> Any:
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    data = json.dumps(body, default=str).encode() if body is not None else None
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=timeout) as resp:
            content = resp.read()
            if content:
                return json.loads(content)
            return _EMPTY_OK
    except HTTPError as e:
        detail = e.read().decode(errors="replace")
        print(f"  [error] HTTP {e.code}: {detail[:300]}")
        return None
    except URLError as e:
        print(f"  [error] Cannot reach server: {e.reason}")
        return None


def _check_health() -> bool:
    result = _api("GET", "/global/health")
    return isinstance(result, dict) and result.get("healthy") is True


# ── SSE Streaming ───────────────────────────────────────────────────────────

class SSEStream:
    """Server-Sent Events listener for real-time streaming."""

    def __init__(self):
        self._conn: http_client.HTTPConnection | None = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._handlers: dict[str, list[Callable]] = {}
        self._running = False

    def on(self, event_type: str, handler: Callable):
        with self._lock:
            self._handlers.setdefault(event_type, []).append(handler)

    def start(self):
        if self._running:
            return
        self._stop.clear()
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._conn:
            try:
                self._conn.close()
            except Exception:
                pass
        self._running = False

    def _run(self):
        import http.client as hc
        while not self._stop.is_set():
            try:
                conn = hc.HTTPConnection(DEFAULT_HOST, DEFAULT_PORT, timeout=120)
                self._conn = conn
                conn.request("GET", "/event")
                resp = conn.getresponse()
                buf = b""
                while not self._stop.is_set():
                    chunk = resp.read(1)
                    if not chunk:
                        break
                    buf += chunk
                    if chunk == b"\n":
                        line = buf.decode().strip()
                        buf = b""
                        if line.startswith("data:"):
                            try:
                                data = json.loads(line[5:])
                                evt_type = data.get("type", "")
                                props = data.get("properties", {})
                                with self._lock:
                                    handlers = self._handlers.get(evt_type, [])
                                    for h in handlers:
                                        try:
                                            h(props)
                                        except Exception:
                                            pass
                            except json.JSONDecodeError:
                                pass
                conn.close()
            except Exception:
                if not self._stop.is_set():
                    time.sleep(1)
            self._conn = None


# ── Data ────────────────────────────────────────────────────────────────────

@dataclass
class Session:
    id: str
    title: str
    created: str

@dataclass
class Message:
    role: str
    content: str
    id: str = ""

@dataclass
class AppState:
    sessions: list[Session] = field(default_factory=list)
    current_session_id: str | None = None
    current_model: str | None = None
    current_variant: str | None = None
    current_agent: str | None = None
    system_prompt: str | None = None
    temperature: float | None = None
    reasoning_effort: str | None = None
    available_models: list[str] = field(default_factory=list)
    available_agents: list[str] = field(default_factory=list)
    messages: list[Message] = field(default_factory=list)
    connected: bool = False
    sse: SSEStream | None = None
    _streaming_text: str = ""
    _streaming_done: threading.Event = field(default_factory=threading.Event)
    _current_msg_id: str = ""
    _abort_flag: bool = False


# ── Server operations ───────────────────────────────────────────────────────

def load_state(state: AppState) -> None:
    config = _api("GET", "/config")
    if config:
        raw_model = config.get("model") or ""
        if "@" in raw_model:
            base, variant = raw_model.split("@", 1)
            state.current_model = base
            state.current_variant = variant
        else:
            state.current_model = raw_model or None
            state.current_variant = None
        state.system_prompt = config.get("system") or config.get("instructions")
        state.connected = True

    prov = _api("GET", "/config/providers")
    if prov:
        models: list[str] = []
        providers = prov.get("providers") or []
        for p in providers:
            pid = p.get("id") or p.get("provider")
            raw_models = p.get("models") or {}
            for mid, mdata in raw_models.items():
                mid = mdata.get("id") or mid
                if pid and mid:
                    full = f"{pid}/{mid}"
                    models.append(full)
                    variants = mdata.get("variants") or {}
                    for vname in variants:
                        models.append(f"{full}@{vname}")
        state.available_models = sorted(set(models))

    agents = _api("GET", "/agent")
    if agents and isinstance(agents, list):
        state.available_agents = [
            a.get("id") or a.get("name", "") for a in agents if a.get("id") or a.get("name")
        ]
        if state.available_agents and not state.current_agent:
            state.current_agent = state.available_agents[0]

    sels = _api("GET", "/session")
    if sels and isinstance(sels, list):
        state.sessions = [
            Session(id=s.get("id", ""), title=s.get("title", s.get("id", "")), created=s.get("createdAt", s.get("created", "")))
            for s in sels
        ]


def create_session(state: AppState, title: str | None = None) -> str | None:
    body: dict[str, Any] = {}
    if title:
        body["title"] = title
    result = _api("POST", "/session", body)
    if result:
        sid = result.get("id")
        if sid:
            state.sessions.append(Session(id=sid, title=title or sid, created=result.get("createdAt", result.get("created", ""))))
            return sid
    return None


def list_models_detail() -> list[dict]:
    prov = _api("GET", "/config/providers")
    if not prov:
        return []
    out: list[dict] = []
    for p in prov.get("providers") or []:
        pid = p.get("id") or p.get("provider")
        raw_models = p.get("models") or {}
        for mid, mdata in raw_models.items():
            mid = mdata.get("id") or mid
            variants = mdata.get("variants") or {}
            vnames = list(variants.keys())
            out.append({"provider": pid, "model": mid, "variants": vnames, "options": mdata.get("options") or {}})
    return out


def update_config(config: dict) -> bool:
    result = _api("PATCH", "/config", config)
    return result is not None


# ── Streaming Message Sending ───────────────────────────────────────────────

def _start_sse(state: AppState):
    if state.sse and state.sse._running:
        return
    sse = SSEStream()
    state.sse = sse

    part_types: dict[str, str] = {}
    part_msgs: dict[str, str] = {}
    part_texts: dict[str, str] = {}

    def on_message_updated(props):
        info = props.get("info", {})
        mid = info.get("id", "")
        role = info.get("role", "")
        if role == "assistant" and mid and not state._streaming_done.is_set():
            state._current_msg_id = mid

    def on_part_updated(props):
        part = props.get("part", {})
        pid = part.get("id", "")
        ptype = part.get("type", "")
        msg_id = part.get("messageID", "")
        text = part.get("text", "")
        if pid:
            part_types[pid] = ptype
            part_msgs[pid] = msg_id or part_msgs.get(pid, "")
            if text:
                part_texts[pid] = text
            _rebuild()

    def on_part_delta(props):
        pid = props.get("partID", "")
        field = props.get("field", "")
        delta = props.get("delta", "")
        if field == "text" and pid:
            part_texts[pid] = part_texts.get(pid, "") + delta
            if part_types.get(pid) == "text" and part_msgs.get(pid) == state._current_msg_id:
                _rebuild()

    def _rebuild():
        texts = []
        for pid, txt in part_texts.items():
            if part_types.get(pid) == "text" and part_msgs.get(pid) == state._current_msg_id:
                texts.append(txt)
        state._streaming_text = "".join(texts)

    def on_session_idle(props):
        if props.get("sessionID") == state.current_session_id:
            state._streaming_done.set()

    def on_session_status(props):
        status = props.get("status", {})
        if isinstance(status, dict) and status.get("type") == "idle":
            if state._current_msg_id:
                state._streaming_done.set()

    sse.on("message.updated", on_message_updated)
    sse.on("message.part.updated", on_part_updated)
    sse.on("message.part.delta", on_part_delta)
    sse.on("session.idle", on_session_idle)
    sse.on("session.status", on_session_status)
    sse.start()


def send_message_streaming(state: AppState, text: str, on_token: Callable[[str], None] | None = None) -> str | None:
    if not state.current_session_id:
        print("  [error] No active session. Create one with /new")
        return None

    _start_sse(state)
    state._streaming_text = ""
    state._streaming_done.clear()
    state._abort_flag = False

    parts = [{"type": "text", "text": text}]
    body: dict[str, Any] = {"parts": parts}

    if state.system_prompt:
        body["system"] = state.system_prompt

    if state.current_model:
        pid, mid_part = state.current_model.split("/", 1)
        if state.current_variant:
            mid_part = f"{mid_part}@{state.current_variant}"
        body["model"] = {"providerID": pid, "modelID": mid_part}

    if state.current_agent:
        body["agent"] = state.current_agent

    result = _api("POST", f"/session/{state.current_session_id}/prompt_async", body)
    if result is None:
        return None

    accumulated = ""
    last_len = 0
    while not state._streaming_done.is_set() and not state._abort_flag:
        current = state._streaming_text
        if len(current) > last_len:
            chunk = current[last_len:]
            if on_token:
                on_token(chunk)
            accumulated += chunk
            last_len = len(current)
        time.sleep(0.02)

    remaining = state._streaming_text[last_len:]
    if remaining and on_token:
        on_token(remaining)
    accumulated += remaining

    time.sleep(0.1)

    if state._abort_flag:
        state._abort_flag = False
        return None

    if accumulated:
        state.messages.append(Message(role="user", content=text))
        state.messages.append(Message(role="assistant", content=accumulated))
        return accumulated

    msgs = _api("GET", f"/session/{state.current_session_id}/message")
    if msgs and isinstance(msgs, list) and len(msgs) >= 2:
        for m in reversed(msgs):
            info = m.get("info", {})
            if info.get("role") == "assistant":
                parts = m.get("parts", [])
                text_parts = [p.get("text", "") for p in parts if isinstance(p, dict) and p.get("type") == "text"]
                if text_parts:
                    full = "\n".join(text_parts)
                    state.messages.append(Message(role="user", content=text))
                    state.messages.append(Message(role="assistant", content=full))
                    return full

    state.messages.append(Message(role="user", content=text))
    return None


def fetch_session_messages(state: AppState) -> None:
    if not state.current_session_id:
        return
    msgs = _api("GET", f"/session/{state.current_session_id}/message")
    if not msgs or not isinstance(msgs, list):
        return
    state.messages = []
    for m in msgs:
        info = m.get("info", {})
        role = info.get("role", "")
        parts = m.get("parts", [])
        text = "\n".join(p.get("text", "") for p in parts if isinstance(p, dict) and p.get("type") == "text")
        if text:
            state.messages.append(Message(role=role, content=text, id=info.get("id", "")))
        elif role:
            state.messages.append(Message(role=role, content="", id=info.get("id", "")))


def abort_session(state: AppState) -> bool:
    if not state.current_session_id:
        return False
    state._abort_flag = True
    result = _api("POST", f"/session/{state.current_session_id}/abort")
    return result is not None


# ── CLI UI ──────────────────────────────────────────────────────────────────

def print_help() -> None:
    print()
    print("  Commands:")
    print("    /model [name]          List or switch model (e.g. opencode/gpt-5@high)")
    print("    /reasoning <level>     Set reasoning effort via model variant")
    print("    /variant <name>        Set model variant explicitly")
    print("    /system [text]         Show or set system prompt")
    print("    /temperature [n]       Show or set temperature (0.0-2.0)")
    print("    /agents                List available agents")
    print("    /agent [name]          Show or set active agent")
    print("    /sessions              List sessions")
    print("    /new [title]           Create a new session")
    print("    /rename <title>        Rename the current session")
    print("    /clear                 Clear local message history")
    print("    /history [n]           Show last N messages")
    print("    /export [file]         Export conversation to JSON file")
    print("    /abort                 Abort current running response")
    print("    /config                Show current config")
    print("    /help                  Show this help")
    print("    /quit                  Exit")
    print()


def cmd_model(state: AppState, args: list[str]) -> None:
    if not args:
        models = list_models_detail()
        if not models:
            print("  No models available. Is the server connected to a provider?")
            return
        print()
        for m in models:
            label = f"{m['provider']}/{m['model']}"
            marker = " <-- active" if label == state.current_model else ""
            print(f"  {label}{marker}")
            if m["variants"]:
                for v in m["variants"]:
                    vmarker = " <-- active" if (label == state.current_model and v == state.current_variant) else ""
                    print(f"    └─ @{v}{vmarker}")
            if m.get("options"):
                items = ", ".join(f"{k}={v}" for k, v in m["options"].items() if v)
                if items:
                    print(f"       opts: {items}")
        print()
        return

    name = args[0]
    if "@" in name:
        base, variant = name.split("@", 1)
        state.current_model = base
        state.current_variant = variant
    else:
        state.current_model = name
        state.current_variant = None

    config_model = name
    success = update_config({"model": config_model})
    if success:
        print(f"  Model set to: {name}")
    else:
        print(f"  Failed to set model")


def _find_variant_for_effort(base_model: str, level: str) -> str | None:
    models = list_models_detail()
    for m in models:
        label = f"{m['provider']}/{m['model']}"
        if label == base_model:
            if level in m["variants"]:
                return level
            for v in m["variants"]:
                if level in v:
                    return v
            return None
    return None


def cmd_reasoning(state: AppState, args: list[str]) -> None:
    if not args:
        print(f"  Reasoning effort controlled via model variant")
        if state.current_model:
            print(f"  Current model: {state.current_model}")
            if state.current_variant:
                print(f"  Current variant: {state.current_variant}")
        print(f"  Levels: {', '.join(REASONING_LEVELS)}")
        return

    level = args[0].lower()
    if level not in REASONING_LEVELS:
        print(f"  Invalid. Choose: {', '.join(REASONING_LEVELS)}")
        return

    if not state.current_model:
        print("  No model selected. Use /model first.")
        return

    variant = _find_variant_for_effort(state.current_model, level)
    if variant:
        model_with_variant = f"{state.current_model}@{variant}"
        state.current_variant = variant
        success = update_config({"model": model_with_variant})
        if success:
            print(f"  Switched to {model_with_variant} (reasoning: {level})")
        else:
            print(f"  Failed to update config")
    else:
        print(f"  No '{level}' variant for {state.current_model}")
        print(f"  Use /model to see variants")


def cmd_variant(state: AppState, args: list[str]) -> None:
    if not args:
        print(f"  Current variant: {state.current_variant or '(none)'}")
        return
    variant = args[0]
    state.current_variant = variant
    if state.current_model:
        model_with_variant = f"{state.current_model}@{variant}"
        success = update_config({"model": model_with_variant})
        if success:
            print(f"  Variant set to: {variant}")
        else:
            print(f"  Variant set (config update failed)")
    else:
        print(f"  Variant set to: {variant}")


def cmd_system(state: AppState, args: list[str]) -> None:
    if not args:
        if state.system_prompt:
            print(f"  Current system prompt:")
            print(f"  {state.system_prompt}")
        else:
            print("  No system prompt set. Provide text to set one.")
            print("  Example: /system You are a helpful coding assistant.")
        return

    text = " ".join(args)
    state.system_prompt = text
    success = update_config({"system": text}) if text else update_config({"system": None})
    if success or True:
        print(f"  System prompt updated ({len(text)} chars)")
    else:
        print(f"  Failed to update system prompt")

    _save_state(state)


def cmd_temperature(state: AppState, args: list[str]) -> None:
    if not args:
        print(f"  Current temperature: {state.temperature or '(default)'}")
        print(f"  Range: 0.0 - 2.0")
        return

    try:
        val = float(args[0])
        if val < 0 or val > 2:
            print("  Temperature must be between 0.0 and 2.0")
            return
        state.temperature = val
        success = update_config({"temperature": val})
        if success:
            print(f"  Temperature set to: {val}")
        else:
            print(f"  Temperature set locally: {val}")
    except ValueError:
        print("  Invalid temperature. Use a number between 0.0 and 2.0")


def cmd_agents(state: AppState, _args: list[str] = []) -> None:
    if not state.available_agents:
        agents = _api("GET", "/agent")
        if agents and isinstance(agents, list):
            state.available_agents = [a.get("id") or a.get("name", "") for a in agents]
    if not state.available_agents:
        print("  No agents available")
        return
    print()
    for a in state.available_agents:
        marker = " <-- active" if a == state.current_agent else ""
        print(f"  {a}{marker}")
    print()


def cmd_agent(state: AppState, args: list[str]) -> None:
    if not args:
        cmd_agents(state)
        return
    name = args[0]
    if name not in state.available_agents:
        print(f"  Agent '{name}' not found. Use /agents to list.")
        return
    state.current_agent = name
    print(f"  Agent set to: {name}")


def cmd_sessions(state: AppState) -> None:
    sels = _api("GET", "/session")
    if not sels or not isinstance(sels, list):
        print("  No sessions")
        return
    print()
    for s in sels:
        sid = s.get("id", "?")
        title = s.get("title", sid)
        marker = " <-- active" if sid == state.current_session_id else ""
        print(f"  {title}  ({sid[:8]}...){marker}")
    print()


def cmd_new(state: AppState, args: list[str]) -> None:
    title = " ".join(args) if args else None
    sid = create_session(state, title)
    if sid:
        state.current_session_id = sid
        state.messages = []
        print(f"  Created session: {title or sid[:8]}")
    else:
        print("  Failed to create session")


def cmd_rename(state: AppState, args: list[str]) -> None:
    if not args:
        if state.current_session_id:
            current = next((s for s in state.sessions if s.id == state.current_session_id), None)
            print(f"  Current title: {current.title if current else 'N/A'}")
            print(f"  Usage: /rename <new title>")
        else:
            print("  No active session")
        return
    if not state.current_session_id:
        print("  No active session")
        return
    new_title = " ".join(args)
    result = _api("PATCH", f"/session/{state.current_session_id}", {"title": new_title})
    if result is not None:
        session = next((s for s in state.sessions if s.id == state.current_session_id), None)
        if session:
            session.title = new_title
        print(f"  Session renamed to: {new_title}")
    else:
        print("  Failed to rename session")


def cmd_clear(state: AppState) -> None:
    state.messages = []
    print("  Local message history cleared")


def cmd_history(state: AppState, args: list[str]) -> None:
    fetch_session_messages(state)
    if not state.messages:
        print("  No messages in current session")
        return

    n = 9999
    if args:
        try:
            n = int(args[0])
        except ValueError:
            pass

    shown = state.messages[-n:] if n < len(state.messages) else state.messages
    print()
    for msg in shown:
        label = "You" if msg.role == "user" else "Agent"
        print(f"  [{label}]")
        for line in msg.content.split("\n"):
            print(f"    {line}")
        print()


def cmd_export(state: AppState, args: list[str]) -> None:
    fetch_session_messages(state)
    if not state.messages:
        print("  No messages to export")
        return

    filename = args[0] if args else f"eutgpt_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

    data = {
        "exported_at": datetime.now().isoformat(),
        "model": state.current_model,
        "variant": state.current_variant,
        "agent": state.current_agent,
        "system_prompt": state.system_prompt,
        "session_id": state.current_session_id,
        "messages": [
            {"role": m.role, "content": m.content} for m in state.messages
        ],
    }

    try:
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  Exported {len(state.messages)} messages to {filename}")
    except Exception as e:
        print(f"  Export failed: {e}")


def cmd_abort(state: AppState) -> None:
    if abort_session(state):
        print("  Aborted current response")
    else:
        print("  No running response to abort")


def cmd_config(state: AppState) -> None:
    config = _api("GET", "/config")
    if config:
        print(f"  Model:             {config.get('model', '(not set)')}")
        print(f"  Agent:             {state.current_agent or '(default)'}")
        print(f"  System prompt:     {'(set)' if state.system_prompt else '(not set)'}")
        print(f"  Temperature:       {state.temperature or '(default)'}")
        if state.current_variant:
            print(f"  Variant:           {state.current_variant}")
        print(f"  Active session:    {state.current_session_id[:16] if state.current_session_id else 'N/A'}...")
        print(f"  Messages:          {len(state.messages)}")
    else:
        print("  Could not fetch config")


# ── State Persistence ───────────────────────────────────────────────────────

def _save_state(state: AppState) -> None:
    data = {
        "current_model": state.current_model,
        "current_variant": state.current_variant,
        "current_agent": state.current_agent,
        "system_prompt": state.system_prompt,
        "temperature": state.temperature,
        "current_session_id": state.current_session_id,
    }
    try:
        with open(STATE_FILE, "w") as f:
            json.dump(data, f)
    except Exception:
        pass


def _load_saved_state(state: AppState) -> None:
    try:
        with open(STATE_FILE) as f:
            data = json.load(f)
            state.current_model = data.get("current_model") or state.current_model
            state.current_variant = data.get("current_variant") or state.current_variant
            state.current_agent = data.get("current_agent") or state.current_agent
            state.system_prompt = data.get("system_prompt") or state.system_prompt
            state.temperature = data.get("temperature") or state.temperature
            state.current_session_id = data.get("current_session_id") or state.current_session_id
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    if not state.system_prompt:
        state.system_prompt = DEFAULT_SYSTEM_PROMPT


# ── Main loop ───────────────────────────────────────────────────────────────

def main() -> None:
    state = AppState()
    _load_saved_state(state)

    print()
    print(f"  ┌─ EUT-GPT CLI Chat ───────────────────────────────")
    print(f"  │  Server: {BASE_URL}")

    if not _check_health():
        print(f"  │  [✗] Server not reachable")
        print(f"  └────────────────────────────────────────────────")
        print(f"\n  Make sure opencode serve is running.")
        print(f"  Or set OPENCODE_SERVER_URL env var.")
        sys.exit(1)

    state.connected = True
    load_state(state)

    print(f"  │  Model:  {state.current_model or '(not set)'}")
    print(f"  │  Agent:  {state.current_agent or '(default)'}")
    print(f"  │  Status: Connected")
    print(f"  └────────────────────────────────────────────────")

    if not state.current_session_id or not any(s.id == state.current_session_id for s in state.sessions):
        if state.sessions:
            state.current_session_id = state.sessions[0].id
        else:
            sid = create_session(state)
            if sid:
                state.current_session_id = sid

    if state.current_session_id:
        print(f"  Active session: {state.current_session_id[:16]}...")
        fetch_session_messages(state)
        print(f"  Messages: {len(state.messages)}")
    print()
    print(f"  Type /help for available commands")
    print()

    _start_sse(state)

    while True:
        try:
            raw = input("  You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n  Goodbye")
            _save_state(state)
            if state.sse:
                state.sse.stop()
            break

        if not raw:
            continue

        if raw.startswith("/"):
            parts = shlex.split(raw)
            cmd = parts[0].lower()
            args = parts[1:]

            handlers = {
                "/quit": lambda: (print("  Goodbye"), _save_state(state), state.sse.stop() if state.sse else None, setattr(sys, '_exit', sys.exit(0))),
                "/exit": lambda: None,
            }

            if cmd == "/quit" or cmd == "/exit":
                print("  Goodbye")
                _save_state(state)
                if state.sse:
                    state.sse.stop()
                break
            elif cmd == "/help":
                print_help()
            elif cmd == "/model":
                cmd_model(state, args)
            elif cmd == "/reasoning":
                cmd_reasoning(state, args)
            elif cmd == "/variant":
                cmd_variant(state, args)
            elif cmd == "/system":
                cmd_system(state, args)
            elif cmd == "/temperature":
                cmd_temperature(state, args)
            elif cmd == "/agents":
                cmd_agents(state)
            elif cmd == "/agent":
                cmd_agent(state, args)
            elif cmd == "/sessions":
                cmd_sessions(state)
            elif cmd == "/new":
                cmd_new(state, args)
            elif cmd == "/rename":
                cmd_rename(state, args)
            elif cmd == "/clear":
                cmd_clear(state)
            elif cmd == "/history":
                cmd_history(state, args)
            elif cmd == "/export":
                cmd_export(state, args)
            elif cmd == "/abort":
                cmd_abort(state)
            elif cmd == "/config":
                cmd_config(state)
            else:
                print(f"  Unknown: {cmd}. Type /help")
            continue

        if not state.current_session_id:
            print("  [error] No active session. Create one with /new")
            continue

        print("  Agent: ", end="", flush=True)
        last_display = [0]

        def on_token(chunk: str):
            print(chunk, end="", flush=True)
            last_display[0] += len(chunk)

        reply = send_message_streaming(state, raw, on_token=on_token)
        print()

        if reply:
            print()
        elif state._abort_flag:
            print("\n  [aborted]")
            state._abort_flag = False
        else:
            print("  [no response]")
            print()

    sys.exit(0)


if __name__ == "__main__":
    import http.client as http_client
    main()
