/**
 * crypto-logic.js
 * ===============
 * Implementasi AES-256 CBC client-side menggunakan CryptoJS.
 * File ini adalah INTI dari skripsi — semua enkripsi/dekripsi terjadi di browser.
 *
 * Referensi Bab:
 *   - Mode CBC butuh IV yang unik setiap pesan (Bab III)
 *   - PKCS7 padding untuk block size 128-bit (Bab II)
 *   - DEK tersimpan di memory state, TIDAK pernah ke localStorage (Bab IV)
 */

"use strict";

/**
 * encryptMessage
 * Enkripsi plaintext menggunakan AES-256 CBC + DEK dari KMS.
 *
 * @param {string} plaintext  - Pesan asli yang akan dikirim
 * @param {string} dekHex     - DEK dalam format hex (64 karakter = 32 bytes)
 * @returns {{ ciphertext: string, iv: string }}
 *   ciphertext : Base64 string hasil enkripsi
 *   iv         : Hex string IV 128-bit (unik per pesan)
 */
function encryptMessage(plaintext, dekHex) {
  // Parse DEK dari hex ke WordArray CryptoJS
  const key = CryptoJS.enc.Hex.parse(dekHex);

  // Generate IV baru yang random setiap pesan dikirim
  // Ini yang bikin "Halo" dikirim 2x → hasil ciphertext BEDA (poin sidang!)
  const iv = CryptoJS.lib.WordArray.random(16); // 128-bit IV

  const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
    iv:      iv,
    mode:    CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return {
    ciphertext: encrypted.toString(),          // Base64 output
    iv:         CryptoJS.enc.Hex.stringify(iv) // Hex IV → disimpan bareng ciphertext
  };
}

/**
 * decryptMessage
 * Dekripsi ciphertext menggunakan AES-256 CBC + DEK + IV dari DB.
 *
 * @param {string} ciphertext - Base64 ciphertext dari database
 * @param {string} dekHex     - DEK dalam format hex (dari KMS / memory state)
 * @param {string} ivHex      - Hex IV yang disimpan bersama pesan di DB
 * @returns {string} Plaintext pesan asli
 */
function decryptMessage(ciphertext, dekHex, ivHex) {
  const key = CryptoJS.enc.Hex.parse(dekHex);
  const iv  = CryptoJS.enc.Hex.parse(ivHex);

  const decrypted = CryptoJS.AES.decrypt(ciphertext, key, {
    iv:      iv,
    mode:    CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return decrypted.toString(CryptoJS.enc.Utf8);
}
