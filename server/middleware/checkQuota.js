import Document from '../models/Document.js';

export default async function checkQuota(req, res, next) {
  try {
    const used = await Document.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: null, total: { $sum: '$size' } } }
    ]);
    const totalUsed = used[0]?.total || 0;
    const MAX = parseInt(process.env.MAX_STORAGE_BYTES) || 1073741824;
    if (totalUsed >= MAX)
      return res.status(413).json({ message: 'Storage quota exceeded (1 GB)' });
    next();
  } catch (err) {
    res.status(500).json({ message: 'Quota check failed', error: err.message });
  }
}