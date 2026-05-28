import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  category: {
    type: String,
    enum: ['identity', 'finance', 'medical', 'education', 'legal', 'personal', 'other'],
    default: 'other'
  },
  encryptedContent: { type: String },
  contentType: { type: String },
  mimeType: { type: String },
  originalName: { type: String },
  size: { type: Number },
  tags: [String],
  isFavorite: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  lastAccessedAt: { type: Date },
  sharedLinks: [{
    token: String,
    expiresAt: Date,
    createdAt: Date
  }]
}, { timestamps: true });

export default mongoose.model('Document', documentSchema);