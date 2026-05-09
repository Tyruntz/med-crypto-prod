"use strict";
(function () {
  let _dek = null, _consultId = null, _currentUserId = null, _lastMsgId = 0;

  document.addEventListener("DOMContentLoaded", async () => {
    _consultId     = parseInt(document.getElementById("consultation-id").value);
    _currentUserId = parseInt(document.getElementById("current-user-id").value);
    updateStatus("Mengambil kunci enkripsi...", "info");
    try {
      await doHandshake();
      updateStatus("Terenkripsi AES-256 CBC", "success");
      await loadMessages();
      setInterval(pollMessages, 5000);
      initScrollButton();
    } catch (err) {
      updateStatus("Gagal: " + err.message, "danger");
    }
    document.getElementById("send-btn").addEventListener("click", sendMessage);
    document.getElementById("msg-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    // Auto-resize textarea
    const ta = document.getElementById("msg-input");
    ta.addEventListener("input", () => {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    });
  });

  async function doHandshake() {
    const res  = await fetch("/api/unwrap-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consultation_id: _consultId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "KMS error");
    _dek = data.dek;
  }

  async function loadMessages() {
    const res  = await fetch("/api/messages/" + _consultId);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    const box = document.getElementById("messages-box");
    // Keep date divider
    const divider = box.querySelector(".date-divider");
    box.innerHTML = "";
    if (divider) box.appendChild(divider);
    for (const msg of data.messages) {
      renderMessage(msg);
      _lastMsgId = Math.max(_lastMsgId, msg.id);
    }
    scrollBottom();
  }

  async function pollMessages() {
    try {
      const res  = await fetch("/api/messages/" + _consultId);
      const data = await res.json();
      if (!res.ok) return;
      const newMsgs = data.messages.filter(m => m.id > _lastMsgId);
      for (const msg of newMsgs) {
        renderMessage(msg);
        _lastMsgId = Math.max(_lastMsgId, msg.id);
      }
      if (newMsgs.length) scrollBottom();
    } catch (_) {}
  }

  async function sendMessage() {
    const input = document.getElementById("msg-input");
    const text  = input.value.trim();
    if (!text || !_dek) return;
    input.value = "";
    input.style.height = "auto";
    input.disabled = true;
    try {
      const { ciphertext, iv } = encryptMessage(text, _dek);
      const res  = await fetch("/api/messages/" + _consultId, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ciphertext, iv })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      renderMessage(data.message, text);
      _lastMsgId = Math.max(_lastMsgId, data.message.id);
      scrollBottom(true);
    } catch (err) {
      alert("Gagal kirim: " + err.message);
    } finally {
      input.disabled = false;
      input.focus();
    }
  }

  function renderMessage(msg, knownPlaintext) {
    const box      = document.getElementById("messages-box");
    const isMine   = msg.sender_id === _currentUserId;
    const plaintext = knownPlaintext !== undefined
      ? knownPlaintext
      : decryptMessage(msg.ciphertext, _dek, msg.iv);

    const row = document.createElement("div");
    row.className = "msg-row " + (isMine ? "mine" : "theirs");

    const avatarEl = document.createElement("div");
    avatarEl.className = "msg-avatar";
    avatarEl.textContent = msg.sender_username ? msg.sender_username[0].toUpperCase() : "?";

    const contentEl = document.createElement("div");
    contentEl.className = "msg-content";

    if (!isMine) {
      const senderEl = document.createElement("div");
      senderEl.className = "msg-sender";
      senderEl.textContent = msg.sender_username || "?";
      contentEl.appendChild(senderEl);
    }

    const bubbleEl = document.createElement("div");
    bubbleEl.className = "msg-bubble";
    bubbleEl.textContent = plaintext;

    const metaEl = document.createElement("div");
    metaEl.className = "msg-meta";
    metaEl.innerHTML =
      '<span class="msg-time">' + (msg.created_at || "") + '</span>' +
      '<span class="msg-lock" title="Ciphertext: ' + esc(msg.ciphertext).slice(0,40) + '... IV: ' + msg.iv + '">🔒</span>';

    contentEl.appendChild(bubbleEl);
    contentEl.appendChild(metaEl);

    if (isMine) {
      row.appendChild(contentEl);
    } else {
      row.appendChild(avatarEl);
      row.appendChild(contentEl);
    }
    box.appendChild(row);
  }

  function updateStatus(text, type) {
    const el = document.getElementById("crypto-status");
    if (!el) return;
    const icons = { info: "⏳", success: "🔒", danger: "❌" };
    el.textContent = (icons[type] || "") + " " + text;
    if (type === "success") {
      el.className = "topbar-badge secure";
    } else {
      el.className = "topbar-badge";
    }
    // Also update sub-header status if exists
    const el2 = document.getElementById("enc-status");
    if (el2) {
      el2.textContent = (icons[type] || "") + " " + text;
      el2.className = "crypto-status status-" + type;
    }
  }

function scrollBottom(force = false) {
    const box = document.getElementById("messages-box");
    const isNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 150;
    if (force || isNearBottom) {
      box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
    }
  }

  // Scroll button logic
  function initScrollButton() {
    const box = document.getElementById("messages-box");
    const btn = document.getElementById("scroll-bottom-btn");
    if (!btn) return;
    box.addEventListener("scroll", () => {
      const distFromBottom = box.scrollHeight - box.scrollTop - box.clientHeight;
      btn.style.display = distFromBottom > 200 ? "flex" : "none";
    });
    btn.addEventListener("click", () => {
      box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
      btn.style.display = "none";
    });
  }

  function esc(str) {
    return String(str)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
})();
