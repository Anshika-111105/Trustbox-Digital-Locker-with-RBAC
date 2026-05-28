import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import Document from '../models/Document.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { authenticate as verifyToken } from '../middleware/auth.js';
import checkQuota from '../middleware/checkQuota.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    cb(null, allowed.includes(file.mimetype));
  }
});

// POST /api/documents/text
router.post('/text', verifyToken, async (req, res) => {
  try {
    const { title, content, description, category, tags } = req.body;
    if (!title || !content)
      return res.status(400).json({ message: 'Title and content required' });

    const encrypted = encrypt(content, req.user.id);
    const doc = await Document.create({
      userId: req.user.id,
      title, description, category,
      tags: tags || [],
      contentType: 'text',
      encryptedContent: encrypted,
      size: Buffer.byteLength(content, 'utf8'),
    });

    res.status(201).json({ message: 'Document saved', document: _safeDoc(doc) });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/documents/file
router.post('/file', verifyToken, checkQuota, upload.single('file'), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: 'No file uploaded' });

    const { title, description, category, tags } = req.body;
    const base64 = req.file.buffer.toString('base64');
    const encrypted = encrypt(base64, req.user.id);

    const doc = await Document.create({
      userId: req.user.id,
      title: title || req.file.originalname,
      description, category,
      tags: tags ? JSON.parse(tags) : [],
      contentType: 'file',
      encryptedContent: encrypted,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      size: req.file.size,
    });

    res.status(201).json({ message: 'File saved', document: _safeDoc(doc) });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/documents
router.get('/', verifyToken, async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    const query = { userId: req.user.id };
    if (category) query.category = category;
    if (search) query.title = { $regex: search, $options: 'i' };

    const docs = await Document.find(query)
      .select('-encryptedContent')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Document.countDocuments(query);
    res.json({ documents: docs, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/documents/shared/:token — PUBLIC, no auth
// ⚠️ Must be before /:id
router.get('/shared/:token', async (req, res) => {
  try {
    const doc = await Document.findOne({
      'sharedLinks.token': req.params.token,
      'sharedLinks.expiresAt': { $gt: new Date() }
    });
    if (!doc)
      return res.status(404).json({ message: 'Link expired or invalid' });

    res.json({
      title: doc.title,
      category: doc.category,
      mimeType: doc.mimeType,
      isVerified: doc.isVerified
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /api/documents/:id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user.id });
    if (!doc)
      return res.status(404).json({ message: 'Not found' });

    await Document.findByIdAndUpdate(doc._id, { lastAccessedAt: new Date() });
    const content = decrypt(doc.encryptedContent, req.user.id);

    if (doc.contentType === 'file') {
      const buffer = Buffer.from(content, 'base64');
      res.set('Content-Type', doc.mimeType);
      res.set('Content-Disposition', `inline; filename="${doc.originalName}"`);
      return res.send(buffer);
    }

    res.json({ document: _safeDoc(doc), content });
  } catch (err) {
    res.status(500).json({ message: 'Decryption failed' });
  }
});

// PATCH /api/documents/:id
router.patch('/:id', verifyToken, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user.id });
    if (!doc)
      return res.status(404).json({ message: 'Not found' });

    const { title, description, category, tags, isFavorite, content } = req.body;
    if (title)                     doc.title = title;
    if (description !== undefined) doc.description = description;
    if (category)                  doc.category = category;
    if (tags)                      doc.tags = tags;
    if (isFavorite !== undefined)  doc.isFavorite = isFavorite;
    if (content)                   doc.encryptedContent = encrypt(content, req.user.id);

    await doc.save();
    res.json({ message: 'Updated', document: _safeDoc(doc) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const result = await Document.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });
    if (!result)
      return res.status(404).json({ message: 'Not found' });

    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/documents/:id/share
router.post('/:id/share', verifyToken, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user.id });
    if (!doc)
      return res.status(404).json({ message: 'Not found' });

    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    doc.sharedLinks = doc.sharedLinks || [];
    doc.sharedLinks.push({ token, expiresAt, createdAt: new Date() });
    await doc.save();

    res.json({
      shareUrl: `${process.env.FRONTEND_URL}/shared/${token}`,
      expiresAt
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

function _safeDoc(doc) {
  const o = doc.toObject();
  delete o.encryptedContent;
  return o;
}

export default router;