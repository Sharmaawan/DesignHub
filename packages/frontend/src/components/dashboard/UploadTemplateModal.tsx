import { useRef, useState } from 'react';
import { HiOutlineX, HiOutlineUpload, HiOutlinePhotograph } from 'react-icons/hi';
import { uploadAPI, templateAPI } from '../../utils/api';
import { generateId } from '../../utils/cn';
import toast from 'react-hot-toast';

interface UploadTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  categories: string[];
}

const BACKEND = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';

function loadImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1080, height: img.naturalHeight || 1080 });
    img.onerror = () => resolve({ width: 1080, height: 1080 });
    img.src = url;
  });
}

export default function UploadTemplateModal({ open, onClose, onCreated, categories }: UploadTemplateModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState(categories[0] || 'Social Media');
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  if (!open) return null;

  const handleFile = (f: File) => {
    if (!f.type.startsWith('image/')) {
      toast.error('Please choose an image file (PNG, JPG, SVG, WEBP)');
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    if (!name) setName(f.name.replace(/\.[^/.]+$/, ''));
  };

  const reset = () => {
    setFile(null);
    setPreviewUrl('');
    setName('');
    setCategory(categories[0] || 'Social Media');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleUpload = async () => {
    if (!file) { toast.error('Choose an image to upload'); return; }
    if (!name.trim()) { toast.error('Give your template a name'); return; }

    setUploading(true);
    try {
      const { data: saved } = await uploadAPI.upload(file);
      const url = `${BACKEND}${saved.url}`;
      const { width, height } = await loadImageSize(url);

      const pageId = generateId();
      const elementId = generateId();
      const templateData = {
        id: generateId(),
        name: name.trim(),
        pages: [{
          id: pageId,
          name: 'Page 1',
          width,
          height,
          backgroundColor: '#FFFFFF',
          elements: [{
            id: elementId,
            type: 'image' as const,
            x: 0, y: 0, width, height,
            rotation: 0, opacity: 1, visible: true, locked: false,
            name: 'Background', zIndex: 0,
            data: {
              type: 'image' as const, src: url, objectFit: 'cover' as const, borderRadius: 0,
              brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0,
              filters: [], cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100,
            },
          }],
        }],
        ownerId: '1', collaborators: [], isFavorite: false, isTemplate: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };

      await templateAPI.create({
        name: name.trim(),
        category,
        thumbnail: url,
        data: templateData,
        tags: [],
        isPremium: false,
      });

      toast.success('Template uploaded');
      onCreated();
      handleClose();
    } catch (err: any) {
      console.error('[UploadTemplate] failed', err);
      toast.error(err.response?.data?.error || 'Failed to upload template');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Upload Template</h3>
          <button onClick={handleClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <HiOutlineX size={18} className="text-gray-500" />
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Upload an image from your computer to add it as a template others can start a design from.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />

        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          className={`rounded-xl border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center overflow-hidden ${
            dragActive ? 'border-canva-purple bg-canva-purple/5' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
          } ${previewUrl ? '' : 'h-40'}`}
        >
          {previewUrl ? (
            <img src={previewUrl} alt="Template preview" className="max-h-56 w-full object-contain bg-gray-50 dark:bg-gray-800" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <HiOutlinePhotograph size={28} />
              <span className="text-sm">Click or drag an image here</span>
              <span className="text-xs">PNG, JPG, SVG, WEBP</span>
            </div>
          )}
        </div>

        {file && (
          <button
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            className="mt-2 text-xs text-canva-purple hover:underline flex items-center gap-1"
          >
            <HiOutlineUpload size={12} /> Choose a different image
          </button>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Template name</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Summer Sale Flyer"
              className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-canva-purple/30 focus:border-canva-purple"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Category</label>
            <select
              value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-canva-purple/30 focus:border-canva-purple"
            >
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={handleClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading || !file || !name.trim()}
            className="flex-1 py-2.5 rounded-xl bg-canva-purple hover:bg-canva-purple/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            {uploading ? 'Uploading…' : 'Add template'}
          </button>
        </div>
      </div>
    </div>
  );
}
