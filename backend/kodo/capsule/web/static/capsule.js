class CapsuleTokenMonitor {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.ws = null;
    this.reconnectDelay = 1000;
  }

  connect() {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/api/capsule/usage/ws?session_id=${encodeURIComponent(this.sessionId || "")}`;
    this.ws = new WebSocket(url);

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "TOKEN_UPDATE") {
        this._updateIcon(data);
      }
    };

    this.ws.onclose = () => {
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    };

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
    };
  }

  _updateIcon(data) {
    const btn = document.getElementById("capsule-icon-btn");
    if (!btn) return;
    btn.className = `capsule-icon ${data.alert_level || "idle"}`;
    btn.title = data.alert_reason || "Open Kodo Capsule";
    document.dispatchEvent(new CustomEvent("capsule:token-update", { detail: data }));
  }
}

class CapsulePanel {
  constructor({ sessionId, inputSelector = "textarea" }) {
    this.sessionId = sessionId;
    this.inputSelector = inputSelector;
    this.panel = null;
  }

  async open(anchor) {
    if (this.panel) {
      this.close();
      return;
    }
    const panel = document.createElement("div");
    panel.className = "capsule-panel";
    panel.innerHTML = `
      <input type="search" placeholder="Search capsules" />
      <div class="capsule-tool-grid">
        <button data-tool="capture">Capture</button>
        <button data-tool="compress">Compress</button>
        <button data-tool="usage">Usage</button>
        <button data-tool="template">Template</button>
        <button data-tool="persona">Persona</button>
        <button data-tool="export">Export</button>
        <button data-tool="merge">Merge</button>
        <button data-tool="rollback">Rollback</button>
        <button data-tool="bridge">Bridge</button>
        <button data-tool="list">List</button>
      </div>
      <div class="capsule-recent-list"></div>
    `;
    document.body.appendChild(panel);
    const rect = anchor.getBoundingClientRect();
    panel.style.left = `${Math.max(8, rect.left)}px`;
    panel.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 8)}px`;
    this.panel = panel;
    panel.addEventListener("click", (event) => this._handleClick(event));
    panel.querySelector("input").addEventListener("input", (event) => this.loadRecent(event.target.value));
    document.addEventListener("keydown", this._onKey = (event) => {
      if (event.key === "Escape") this.close();
    });
    setTimeout(() => document.addEventListener("mousedown", this._onOutside = (event) => {
      if (this.panel && !this.panel.contains(event.target) && event.target !== anchor) this.close();
    }), 0);
    await this.loadRecent("");
  }

  close() {
    if (this.panel) this.panel.remove();
    this.panel = null;
    if (this._onKey) document.removeEventListener("keydown", this._onKey);
    if (this._onOutside) document.removeEventListener("mousedown", this._onOutside);
  }

  async loadRecent(query) {
    if (!this.panel) return;
    const response = await fetch(`/api/capsule/capsules?query=${encodeURIComponent(query || "")}`);
    const payload = await response.json();
    const list = this.panel.querySelector(".capsule-recent-list");
    list.innerHTML = "";
    for (const capsule of (payload.capsules || []).slice(0, 8)) {
      const item = document.createElement("div");
      item.className = "capsule-recent-item";
      item.draggable = true;
      item.textContent = `${capsule.tag} - ${capsule.id}`;
      item.dataset.id = capsule.id;
      item.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", capsule.id);
      });
      item.addEventListener("click", () => this.inject(capsule.id));
      list.appendChild(item);
    }
  }

  async inject(id) {
    const response = await fetch("/api/capsule/inject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capsule_id: id, message: "" }),
    });
    const payload = await response.json();
    const input = document.querySelector(this.inputSelector);
    if (input && payload.data?.injected_message) {
      input.value = `${payload.data.injected_message}\n\n${input.value || ""}`.trim();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    }
    this.close();
  }

  async _handleClick(event) {
    const target = event.target.closest("button[data-tool]");
    if (!target) return;
    const tool = target.dataset.tool;
    if (tool === "capture") {
      await fetch("/api/capsule/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: this.sessionId || "", team_folder: "default", tags: [] }),
      });
      await this.loadRecent("");
    }
  }
}

window.CapsuleTokenMonitor = CapsuleTokenMonitor;
window.CapsulePanel = CapsulePanel;

