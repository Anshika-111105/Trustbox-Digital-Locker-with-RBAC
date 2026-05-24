import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// ─── Types ───────────────────────────────────────────────
interface Document {
  _id: string;
  title: string;
  category: string;
  contentType: 'text' | 'file';
  mimeType?: string;
  originalName?: string;
  size: number;
  isVerified: boolean;
  isFavorite: boolean;
  createdAt: string;
  description?: string;
  tags?: string[];
}

interface DocumentContent {
  document: Document;
  content: string;
}

// ─── API Helpers ─────────────────────────────────────────
const API = 'http://localhost:5050/api/documents';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

async function listDocuments(params?: {
  category?: string;
  search?: string;
  page?: number;
}) {
  const query = new URLSearchParams(
    Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== '') as [string, string][]
  ).toString();
  const res = await fetch(`${API}?${query}`, { headers: authHeaders() });
  return res.json();
}

async function getDocument(id: string): Promise<DocumentContent> {
  const res = await fetch(`${API}/${id}`, { headers: authHeaders() });
  return res.json();
}

async function saveTextDocument(data: {
  title: string;
  content: string;
  description?: string;
  category?: string;
  tags?: string[];
}) {
  const res = await fetch(`${API}/text`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function uploadFile(formData: FormData) {
  const res = await fetch(`${API}/file`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });
  return res.json();
}

async function deleteDocument(id: string) {
  const res = await fetch(`${API}/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return res.json();
}

async function shareDocument(id: string) {
  const res = await fetch(`${API}/${id}/share`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return res.json();
}

// ─── Constants ───────────────────────────────────────────
const CATEGORIES = [
  { value: 'identity',  label: 'Identity',  emoji: '🪪' },
  { value: 'finance',   label: 'Finance',   emoji: '💰' },
  { value: 'medical',   label: 'Medical',   emoji: '🏥' },
  { value: 'education', label: 'Education', emoji: '🎓' },
  { value: 'legal',     label: 'Legal',     emoji: '⚖️' },
  { value: 'personal',  label: 'Personal',  emoji: '📝' },
  { value: 'other',     label: 'Other',     emoji: '📄' },
];

const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  identity:  { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  finance:   { bg: 'bg-amber-100',  text: 'text-amber-700'  },
  medical:   { bg: 'bg-rose-100',   text: 'text-rose-700'   },
  education: { bg: 'bg-purple-100', text: 'text-purple-700' },
  legal:     { bg: 'bg-teal-100',   text: 'text-teal-700'   },
  personal:  { bg: 'bg-green-100',  text: 'text-green-700'  },
  other:     { bg: 'bg-gray-100',   text: 'text-gray-700'   },
};

function getCatEmoji(cat: string) {
  return CATEGORIES.find(c => c.value === cat)?.emoji ?? '📄';
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

// ─── Toast ───────────────────────────────────────────────
function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-gray-900 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 animate-fade-in">
      {msg}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────
export default function VaultPage() {
  const navigate = useNavigate();

  // State
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'issued' | 'favourites'>('all');
  const [toast, setToast] = useState('');

  // Modals
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showFileModal, setShowFileModal] = useState(false);
  const [viewDoc, setViewDoc] = useState<DocumentContent | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  // Forms
  const [noteForm, setNoteForm] = useState({ title: '', content: '', description: '', category: 'personal' });
  const [fileForm, setFileForm] = useState({ title: '', description: '', category: 'identity' });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Storage
  const totalStorage = docs.reduce((sum, d) => sum + (d.size || 0), 0);
  const storagePercent = Math.min((totalStorage / (1024 * 1024 * 1024)) * 100, 100);

  // ── Fetch ──────────────────────────────────────────────
  useEffect(() => {
    fetchDocs();
  }, [search, filterCat]);

  async function fetchDocs() {
    setLoading(true);
    try {
      const data = await listDocuments({ search, category: filterCat });
      setDocs(data.documents || []);
    } catch {
      showToast('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg: string) { setToast(msg); }

  // ── Filtered list ──────────────────────────────────────
  const filtered = docs.filter(d => {
    if (activeTab === 'issued')     return d.isVerified;
    if (activeTab === 'favourites') return d.isFavorite;
    return true;
  });

  // ── Handlers ───────────────────────────────────────────
  async function handleSaveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteForm.title || !noteForm.content) return showToast('Title and content required');
    setSaving(true);
    try {
      await saveTextDocument(noteForm);
      setShowNoteModal(false);
      setNoteForm({ title: '', content: '', description: '', category: 'personal' });
      showToast('🔐 Note encrypted and saved');
      fetchDocs();
    } catch {
      showToast('Failed to save note');
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadFile(e: React.FormEvent) {
    e.preventDefault();
    if (!fileRef.current?.files?.[0]) return showToast('Please select a file');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', fileRef.current.files[0]);
      fd.append('title', fileForm.title || fileRef.current.files[0].name);
      fd.append('description', fileForm.description);
      fd.append('category', fileForm.category);
      await uploadFile(fd);
      setShowFileModal(false);
      setFileForm({ title: '', description: '', category: 'identity' });
      if (fileRef.current) fileRef.current.value = '';
      showToast('✅ File encrypted and uploaded');
      fetchDocs();
    } catch {
      showToast('Failed to upload file');
    } finally {
      setSaving(false);
    }
  }

  async function handleView(id: string) {
    setViewLoading(true);
    try {
      const data = await getDocument(id);
      setViewDoc(data);
    } catch {
      showToast('Failed to decrypt document');
    } finally {
      setViewLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this document permanently?')) return;
    try {
      await deleteDocument(id);
      showToast('🗑️ Document deleted');
      fetchDocs();
    } catch {
      showToast('Failed to delete');
    }
  }

  async function handleShare(id: string) {
    try {
      const data = await shareDocument(id);
      if (data.shareUrl) {
        await navigator.clipboard.writeText(data.shareUrl);
        showToast('🔗 Share link copied to clipboard');
      }
    } catch {
      showToast('Failed to generate share link');
    }
  }

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* ── SIDEBAR ── */}
      <aside className="w-60 bg-[#0a1628] flex flex-col fixed top-0 left-0 bottom-0 z-40">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">
              🔐
            </div>
            <div>
              <div className="text-white font-semibold text-sm">SecureVault</div>
              <div className="text-white/40 text-[10px]">Protected by 2FA</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <p className="text-white/30 text-[10px] font-semibold tracking-widest uppercase px-3 mb-2">Menu</p>

          {[
            { label: 'All Documents', tab: 'all',        emoji: '📁' },
            { label: 'Issued Docs',   tab: 'issued',     emoji: '✅' },
            { label: 'Favourites',    tab: 'favourites', emoji: '⭐' },
          ].map(item => (
            <button
              key={item.tab}
              onClick={() => setActiveTab(item.tab as typeof activeTab)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all
                ${activeTab === item.tab
                  ? 'bg-blue-600/20 text-white font-medium border-l-2 border-blue-500'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'}`}
            >
              <span>{item.emoji}</span>{item.label}
            </button>
          ))}

          <p className="text-white/30 text-[10px] font-semibold tracking-widest uppercase px-3 mt-4 mb-2">Categories</p>

          {CATEGORIES.slice(0, 6).map(cat => (
            <button
              key={cat.value}
              onClick={() => setFilterCat(filterCat === cat.value ? '' : cat.value)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all
                ${filterCat === cat.value
                  ? 'bg-blue-600/20 text-white font-medium'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'}`}
            >
              <span>{cat.emoji}</span>{cat.label}
            </button>
          ))}
        </nav>

        {/* Storage bar */}
        <div className="px-5 py-4 border-t border-white/10">
          <div className="flex justify-between text-[11px] text-white/40 mb-2">
            <span>Storage</span>
            <span>{formatSize(totalStorage)} / 1 GB</span>
          </div>
          <div className="h-1 bg-white/10 rounded-full">
            <div
              className="h-1 bg-gradient-to-r from-blue-500 to-teal-400 rounded-full transition-all"
              style={{ width: `${storagePercent}%` }}
            />
          </div>
          <div className="text-[11px] text-white/30 mt-1">{storagePercent.toFixed(1)}% used</div>
        </div>

        {/* Back to dashboard */}
        <button
          onClick={() => navigate('/dashboard')}
          className="mx-3 mb-4 px-3 py-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 text-sm text-left transition-all"
        >
          ← Back to Dashboard
        </button>
      </aside>

      {/* ── MAIN ── */}
      <main className="ml-60 flex-1 flex flex-col min-h-screen">

        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-7 h-[60px] flex items-center gap-4 sticky top-0 z-30">
          <h1 className="text-sm font-semibold text-gray-800">
            {activeTab === 'all' ? 'My Documents' : activeTab === 'issued' ? 'Issued Documents' : 'Favourites'}
          </h1>

          {/* Search */}
          <div className="flex-1 max-w-md mx-auto relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              type="text"
              placeholder="Search documents..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => setShowFileModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-all"
            >
              ⬆ Upload
            </button>
            <button
              onClick={() => setShowNoteModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
            >
              + Add Note
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="p-7 flex-1">

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4 mb-7">
            {[
              { label: 'Total Documents', value: docs.length,                         emoji: '📄', bg: 'bg-blue-50' },
              { label: 'Issued & Verified', value: docs.filter(d => d.isVerified).length, emoji: '✅', bg: 'bg-green-50' },
              { label: 'Favourites',       value: docs.filter(d => d.isFavorite).length,  emoji: '⭐', bg: 'bg-amber-50' },
              { label: 'Storage Used',     value: formatSize(totalStorage),            emoji: '💾', bg: 'bg-purple-50' },
            ].map(stat => (
              <div key={stat.label} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                <div className={`w-10 h-10 ${stat.bg} rounded-lg flex items-center justify-center text-lg`}>
                  {stat.emoji}
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-800">{stat.value}</div>
                  <div className="text-xs text-gray-500">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Upload drop zone */}
          <div
            onClick={() => setShowFileModal(true)}
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center mb-7 bg-white cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
          >
            <div className="text-3xl mb-2">☁️</div>
            <div className="text-sm font-medium text-gray-700">Drag & drop or click to upload</div>
            <div className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, DOCX · Max 5 MB · AES-256 encrypted</div>
          </div>

          {/* Document grid */}
          {loading ? (
            <div className="text-center py-20 text-gray-400">Loading documents...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-4xl mb-3">📭</div>
              <div className="text-sm text-gray-400">No documents found. Add your first note or upload a file.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(doc => {
                const colors = CAT_COLORS[doc.category] || CAT_COLORS.other;
                return (
                  <div
                    key={doc._id}
                    className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group"
                    onClick={() => handleView(doc._id)}
                  >
                    {/* Card top */}
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-11 h-12 ${colors.bg} rounded-lg flex items-center justify-center text-2xl`}>
                        {getCatEmoji(doc.category)}
                      </div>
                      {doc.isVerified && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ Verified</span>
                      )}
                    </div>

                    {/* Title */}
                    <div className="text-sm font-semibold text-gray-800 mb-1 line-clamp-2">{doc.title}</div>
                    {doc.description && (
                      <div className="text-xs text-gray-400 mb-2 line-clamp-1">{doc.description}</div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                        {doc.category}
                      </span>
                      <span className="text-[11px] text-gray-400">{formatDate(doc.createdAt)}</span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-3 pt-2 border-t border-gray-50">
                      <button
                        onClick={e => { e.stopPropagation(); handleView(doc._id); }}
                        className="flex-1 text-xs py-1.5 rounded-lg border border-gray-200 hover:border-blue-400 hover:text-blue-600 transition-all"
                      >
                        View
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleShare(doc._id); }}
                        className="flex-1 text-xs py-1.5 rounded-lg border border-gray-200 hover:border-teal-400 hover:text-teal-600 transition-all"
                      >
                        Share
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(doc._id); }}
                        className="flex-1 text-xs py-1.5 rounded-lg border border-gray-200 hover:border-rose-400 hover:text-rose-600 transition-all"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ── ADD NOTE MODAL ── */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNoteModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-800">Add Secure Note</h2>
              <button onClick={() => setShowNoteModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={handleSaveNote} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Title</label>
                <input
                  required
                  value={noteForm.title}
                  onChange={e => setNoteForm({ ...noteForm, title: e.target.value })}
                  placeholder="e.g. Bank Account Details"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
                <select
                  value={noteForm.category}
                  onChange={e => setNoteForm({ ...noteForm, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
                >
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Content</label>
                <textarea
                  required
                  rows={5}
                  value={noteForm.content}
                  onChange={e => setNoteForm({ ...noteForm, content: e.target.value })}
                  placeholder="Enter your sensitive information here..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowNoteModal(false)}
                  className="flex-1 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all">
                  {saving ? 'Saving...' : '🔐 Save Encrypted'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── UPLOAD FILE MODAL ── */}
      {showFileModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowFileModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-800">Upload Document</h2>
              <button onClick={() => setShowFileModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <form onSubmit={handleUploadFile} className="px-6 py-5 space-y-4">
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
              >
                <div className="text-2xl mb-1">📎</div>
                <div className="text-sm font-medium text-gray-700">Click to choose file</div>
                <div className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, DOCX, TXT · Max 5 MB</div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt"
                  className="hidden"
                  onChange={() => {
                    const name = fileRef.current?.files?.[0]?.name ?? '';
                    if (name && !fileForm.title) setFileForm(f => ({ ...f, title: name.replace(/\.[^.]+$/, '') }));
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Document Name</label>
                <input
                  value={fileForm.title}
                  onChange={e => setFileForm({ ...fileForm, title: e.target.value })}
                  placeholder="e.g. Aadhaar Card"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
                <select
                  value={fileForm.category}
                  onChange={e => setFileForm({ ...fileForm, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-white"
                >
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowFileModal(false)}
                  className="flex-1 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all">
                  {saving ? 'Uploading...' : '🔒 Encrypt & Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── VIEW DOCUMENT MODAL ── */}
      {(viewDoc || viewLoading) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setViewDoc(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-800">{viewDoc?.document?.title ?? 'Loading...'}</h2>
              <button onClick={() => setViewDoc(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-6 py-5 overflow-y-auto flex-1">
              {viewLoading ? (
                <div className="text-center py-10 text-gray-400">Decrypting document...</div>
              ) : viewDoc ? (
                <>
                  {/* Meta */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {[
                      { label: 'Category', value: viewDoc.document.category },
                      { label: 'Type',     value: viewDoc.document.contentType === 'note' ? '📝 Note' : '📄 File' },
                      { label: 'Size',     value: formatSize(viewDoc.document.size) },
                      { label: 'Added',    value: formatDate(viewDoc.document.createdAt) },
                    ].map(m => (
                      <div key={m.label} className="bg-gray-50 rounded-lg px-3 py-2">
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{m.label}</div>
                        <div className="text-sm font-medium text-gray-700 capitalize">{m.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Content */}
                  {viewDoc.content && (
                    <pre className="text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-xl p-4 whitespace-pre-wrap font-mono leading-relaxed">
                      {viewDoc.content}
                    </pre>
                  )}

                  {/* Encryption notice */}
                  <div className="mt-4 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700 flex items-center gap-2">
                    🔐 This document is protected with AES-256 encryption
                  </div>
                </>
              ) : null}
            </div>
            <div className="px-6 py-4 border-t flex gap-3">
              <button
                onClick={() => viewDoc && handleShare(viewDoc.document._id)}
                className="flex-1 py-2 text-sm border border-gray-200 rounded-lg hover:border-teal-400 hover:text-teal-600 transition-all"
              >
                🔗 Copy Share Link
              </button>
              <button
                onClick={() => setViewDoc(null)}
                className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <Toast msg={toast} onClose={() => setToast('')} />}
    </div>
  );
}