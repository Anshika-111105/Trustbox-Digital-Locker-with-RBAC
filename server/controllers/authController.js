import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import User from '../models/User.js';

// ── Helper: Generate Access Token ─────────────────────────
const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
};

// ── Helper: Generate Refresh Token ────────────────────────
const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: '7d' }
  );
};

// ── Register ──────────────────────────────────────────────
// Flow: Register → generate 2FA secret → return QR code
// Frontend must then call /enable-2fa with the 6-digit code
export const register = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: 'Email and password required' });

    const exists = await User.findOne({ email });
    if (exists)
      return res.status(409).json({ message: 'Email already registered' });

    // Generate 2FA secret at registration time
    const secret = speakeasy.generateSecret({
      name: `SecureVault (${email})`,
      length: 20,
    });

    const user = new User({
      email,
      password,
      twoFactorSecret: secret.base32,
      twoFactorEnabled: false,
    });
    await user.save();

    // Generate a temp access token so frontend can call /enable-2fa
    const tempToken = generateAccessToken(user);

    // Generate QR code image as base64 data URL
    const qrCode = await qrcode.toDataURL(secret.otpauth_url);

    return res.status(201).json({
      message: 'Registration successful. Please set up 2FA to continue.',
      token: tempToken,
      qrCode: qrCode,
      manualEntryKey: secret.base32,
      userId: user._id,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── Enable 2FA after Registration ─────────────────────────
// Flow: Frontend sends 6-digit code from authenticator app
// Backend verifies it against the saved secret and enables 2FA
export const enable2FA = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token)
      return res.status(400).json({ message: '6-digit code is required' });

    // req.user is set by authenticate middleware
    const user = await User.findById(req.user._id).select('+twoFactorSecret');
    if (!user)
      return res.status(404).json({ message: 'User not found' });

    if (!user.twoFactorSecret)
      return res.status(400).json({ message: 'No 2FA secret found. Please register again.' });

    // Verify the 6-digit code against saved secret
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: token.toString().trim(),
      window: 4, // allows ±2 time steps (each step = 30s) for clock drift
    });

    if (!verified)
      return res.status(400).json({ message: 'Invalid code. Please try again with a fresh code from your app.' });

    user.twoFactorEnabled = true;
    await user.save();

    return res.json({ message: '2FA enabled successfully. You can now log in.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── Login ─────────────────────────────────────────────────
// Flow:
// Step 1: Send email + password → if 2FA enabled, returns { requiresTwoFactor: true }
// Step 2: Send email + password + 6-digit token → returns accessToken + user
export const login = async (req, res) => {
  try {
    const { email, password, token: twoFactorToken } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: 'Email and password required' });

    const user = await User.findOne({ email }).select('+password +twoFactorSecret');
    if (!user)
      return res.status(401).json({ message: 'Invalid credentials' });

    if (!user.isActive)
      return res.status(401).json({ message: 'Account is deactivated. Contact admin.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ message: 'Invalid credentials' });

    // If 2FA is enabled, require the 6-digit token
    if (user.twoFactorEnabled) {
      if (!twoFactorToken)
        return res.status(200).json({ requiresTwoFactor: true });

      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: twoFactorToken.toString().trim(),
        window: 4,
      });

      if (!verified)
        return res.status(401).json({ message: 'Invalid 2FA code. Please try again.' });
    }

    // Update last login time
    user.lastLogin = new Date();
    await user.save();

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.json({
      accessToken,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ── Refresh Access Token ───────────────────────────────────
// Flow: Frontend sends httpOnly cookie → returns new accessToken
export const refresh = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token)
      return res.status(401).json({ message: 'No refresh token provided' });

    const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findById(decoded.id);

    if (!user)
      return res.status(401).json({ message: 'User not found' });

    if (!user.isActive)
      return res.status(401).json({ message: 'Account is deactivated' });

    const accessToken = generateAccessToken(user);

    return res.json({
      accessToken,
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
};

// ── Logout ────────────────────────────────────────────────
export const logout = async (req, res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  return res.json({ message: 'Logged out successfully' });
};

// ── Get Profile ───────────────────────────────────────────
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password -twoFactorSecret');
    if (!user)
      return res.status(404).json({ message: 'User not found' });
    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── Verify Email ──────────────────────────────────────────
export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token)
      return res.status(400).json({ message: 'Token required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user)
      return res.status(404).json({ message: 'User not found' });

    user.isEmailVerified = true;
    await user.save();

    return res.json({ message: 'Email verified successfully' });
  } catch (err) {
    return res.status(400).json({ message: 'Invalid or expired token' });
  }
};

// ── Reset Password via Hard Token ─────────────────────────
// Flow: Admin assigns hard token to user → user uses it to reset password
export const resetPassword = async (req, res) => {
  try {
    const { email, hardToken, newPassword } = req.body;

    if (!email || !hardToken || !newPassword)
      return res.status(400).json({ message: 'Email, hard token and new password are required' });

    if (newPassword.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: 'User not found' });

    // Check hard token and expiry
    if (!user.hardToken || user.hardToken !== hardToken)
      return res.status(401).json({ message: 'Invalid hard token' });

    if (!user.hardTokenExpires || user.hardTokenExpires < new Date())
      return res.status(401).json({ message: 'Hard token has expired. Request a new one from admin.' });

    user.password = newPassword;
    user.hardToken = null;
    user.hardTokenExpires = null;
    await user.save();

    return res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error' });
  }
};