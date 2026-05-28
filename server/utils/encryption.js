import CryptoJS from 'crypto-js';

function getUserKey(userId) {
  return CryptoJS.SHA256(
    userId.toString() + process.env.ENCRYPTION_SECRET
  ).toString();
}

export function encrypt(text, userId) {
  const key = getUserKey(userId);
  return CryptoJS.AES.encrypt(text, key).toString();
}

export function decrypt(ciphertext, userId) {
  const key = getUserKey(userId);
  const bytes = CryptoJS.AES.decrypt(ciphertext, key);
  return bytes.toString(CryptoJS.enc.Utf8);
}