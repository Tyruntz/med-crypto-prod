/**
 * chat.js
 * =======
 * Logic UI untuk ruang chat konsultasi medis.
 * Handles: KMS handshake → dekripsi pesan lama → kirim pesan baru → polling.
 *
 * SECURITY NOTE:
 *   DEK disimpan di variabel `_dek` (memory only).
 *   TIDAK pernah masuk localStorage, sessionStorage, atau DOM.
 */

"use strict";

(function () {
  // ---------------------------------------------------------------------------
  // State (volatile — hilang saat tab/window ditutup)
  // ---------------------------------------------------------------------------
  let _dek           = null;   // Plaintext DEK hex (dari KMS)
  let _consultId     = null;
  let _currentUserId = null;
  let _lastMsgId     = 0;
  let _pollInterval  = null;

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", async () => {
    _consultId     = parseInt(document.getElementById("consultation-id").value);
    _currentUserId = parseInt(document.getElementById("current-user-id").value);

    updateStatus("🔑 Mengambil kunci enkripsi dari KMS...", "info");

    try {
      await doHandshake();
      updateStatus("🔒 Terenkripsi AES-256 CBC — Pesan aman", "success");
      await loadMessages();
      startPolling();
    } catch (err) {
      updateStatus("❌ Gagal inisialisasi: " + err.message, "danger");
      console.error(err);
    }

    // Event: kirim pesan
    document.getElementById("send-btn").addEventListener("click", sendMessage);
    document.getElementById("msg-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // KMS Handshake — Fase 1
  // ---------------------------------------------------------------------------
  async function doHandshake() {
    const res  = await fetch("/api/unwrap-key", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ consultation_id: _consultId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "KMS error");
    _dek = data.dek; // Simpan DEK di memory state (BUKAN localStorage!)
  }

  // ---------------------------------------------------------------------------
  // Load & decrypt pesan lama
  // ---------------------------------------------------------------------------
  async function loadMessages() {
    const res  = await fetch(`/api/messages/${_consultId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const box = document.getElementById("messages-box");
    box.innerHTML = "";

    for (const msg of data.messages) {
      renderMessage(msg);
      _lastMsgId = Math.max(_lastMsgId, msg.id);
    }
    scrollToBottom();
  }

  // ---------------------------------------------------------------------------
  // Polling untuk pesan baru
  // ---------------------------------------------------------------------------
  function startPolling() {
    _pollInterval = setInterval(async () => {
      try {
        const res  = await fetch(`/api/messages/${_consultId}`);
        const data = await res.json();
        if (!res.ok) return;

        const newMessages = data.messages.filter(m => m.id > _lastMsgId);
        for (const msg of newMessages) {
          renderMessage(msg);
          _lastMsgId = Math.max(_lastMsgId, msg.id);
        }
        if (newMessages.length > 0) scrollToBottom();
      } catch (_) {}
    }, 3000); // poll setiap 3 detik
  }

  // ---------------------------------------------------------------------------
  // Kirim pesan — Fase 2 (Enkripsi)
  // ---------------------------------------------------------------------------
  async function sendMessage() {
    const input = document.getElementById("msg-input");
    const plaintext = input.value.trim();
    if (!plaintext || !_dek) return;

    input.value = "";
    input.disabled = true;

    try {
      const { ciphertext, iv } = encryptMessage(plaintext, _dek);

      const res = await fetch(`/api/messages/${_consultId}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ciphertext, iv }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      renderMessage(data.message, plaintext); // tampil langsung tanpa dekripsi ulang
      _lastMsgId = Math.max(_lastMsgId, data.message.id);
      scrollToBottom();
    } catch (err) {
      alert("Gagal kirim: " + err.message);
    } finally {
      input.disabled = false;
      input.focus();
    }
  }

  // ---------------------------------------------------------------------------
  // Render satu bubble pesan — Fase 3 (Dekripsi)
  // ---------------------------------------------------------------------------
  function renderMessage(msg, knownPlaintext = null) {
    const box      = document.getElementById("messages-box");
    const isMine   = msg.sender_id === _currentUserId;
    const plaintext = knownPlaintext !== null
      ? knownPlaintext
      : decryptMessage(msg.ciphertext, _dek, msg.iv);

    const bubble = document.createElement("div");
    bubble.className = `msg-bubble ${isMine ? "mine" : "theirs"}`;
    bubble.dataset.msgId = msg.id;

    bubble.innerHTML = `
      <div class="bubble-sender">${escapeHtml(msg.sender_username)}</div>
      <div class="bubble-text">${escapeHtml(plaintext)}</div>
      <div class="bubble-meta">
        <span class="bubble-time">${msg.created_at}</span>
        <span class="bubble-cipher" title="Ciphertext: ${escapeHtml(msg.ciphertext)} | IV: ${msg.iv}">🔒</span>
      </div>
    `;
    box.appendChild(bubble);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function scrollToBottom() {
    const box = document.getElementById("messages-box");
    box.scrollTop = box.scrollHeight;
  }

  function updateStatus(text, type) {
    const el = document.getElementById("crypto-status");
    el.textContent = text;
    el.className   = `crypto-status status-${type}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
