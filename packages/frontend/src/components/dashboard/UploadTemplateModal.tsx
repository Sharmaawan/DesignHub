import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineX, HiOutlineUpload, HiOutlinePhotograph } from 'react-icons/hi';
import { uploadAPI, templateAPI, projectAPI, BACKEND_ORIGIN as BACKEND } from '../../utils/api';
import { generateId } from '../../utils/cn';
import { decomposeImage, DecompositionError, DecomposeSummary, ProgressEvent, STEP_LABELS } from '../../utils/designDecomposition/DesignDecomposer';
import type { Page } from '../../types';
import toast from 'react-hot-toast';

interface UploadTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  categories: string[];
}

function loadImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1080, height: img.naturalHeight || 1080 });
    img.onerror = () => resolve({ width: 1080, height: 1080 });
    img.src = url;
  });
}

// Many downloadable "photo frame" templates (a decorative border/balloons/
// text around a blank circle or rectangle) get uploaded as one flat image.
// Without this, that blank spot is just part of the picture — a photo the
// user adds afterward lands as a plain rectangle on top of the whole design,
// covering the decoration instead of sitting inside the hole. When the
// server finds a hole, this turns it into a real clickable Frame (see
// isFrameSlot in ShapeElement, EditorCanvas.tsx). The flat image itself is
// now always page.backgroundImage (a page-level layer, never an element —
// see decomposeImage/reconstructDesign), not an element named "Background",
// so there's no element to reorder here; only its src is swapped when the
// hole wasn't real transparency (a flat black/white marker instead) and the
// server returned a punched copy in `overlayUrl` to stop that marker color
// from covering the Frame.
async function applyFrameHoleDetection(page: Page, uploadedUrl: string): Promise<Page> {
  try {
    const { data } = await templateAPI.detectFrame(uploadedUrl);
    const hole = data?.hole;
    if (!hole) return page;
    const frameSlot = {
      id: generateId(), type: 'shape',
      x: hole.x, y: hole.y, width: hole.width, height: hole.height,
      rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 0, name: 'Photo Frame',
      data: {
        type: 'shape', shapeType: hole.shape, fill: '#F3F4F6', stroke: 'transparent', strokeWidth: 0,
        cornerRadius: hole.shape === 'rectangle' ? Math.round(Math.min(hole.width, hole.height) * 0.06) : 0,
        isFrameSlot: true,
      },
    } as any;
    const overlayUrl: string | null = data?.overlayUrl || null;
    return {
      ...page,
      elements: [frameSlot, ...page.elements],
      backgroundImage: overlayUrl && page.backgroundImage
        ? { ...page.backgroundImage, src: `${BACKEND}${overlayUrl}` }
        : page.backgroundImage,
    };
  } catch (err) {
    console.error('[UploadTemplate] frame-hole detection failed', err);
    return page;
  }
}

// decomposeImage throws DecompositionError('empty', ...) when the pixel-mask
// pipeline finds no baked-in text/graphics reliable enough to extract (e.g. a
// purely decorative/solid-color background template) — a legitimate design,
// not a failure, so it degrades to a background-only page exactly the way
// MakeEditableModal's explicit "Use as background" action already does,
// instead of surfacing an error for what used to just work as an empty canvas.
function backgroundOnlyPage(previewSrc: string, width: number, height: number): Page {
  return {
    id: generateId(), name: 'Page 1', width, height, backgroundColor: '#FFFFFF',
    elements: [],
    backgroundImage: { src: previewSrc, cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 },
  };
}

export default function UploadTemplateModal({ open, onClose, onCreated, categories }: UploadTemplateModalProps) {
  const navigate = useNavigate();
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

  // Shared by both buttons below: uploads the file, runs the real pixel-mask
  // decomposition + server-side background reconstruction (the same pipeline
  // MakeEditableModal's "Make Editable" flow uses), and applies frame-hole
  // detection. Previously this used decomposeTemplateImage — a client-only
  // Tesseract pass that left OCR'd text invisible (opacity 0) directly on top
  // of the untouched original image, only "revealing" it on first click via a
  // crude same-size rectangle cropped from just above/below the text; any
  // mismatch in the surrounding gradient/texture showed up as a visible
  // rectangular patch. decomposeImage instead reconstructs the actual pixels
  // behind each glyph server-side before the text is ever shown, so there's
  // nothing left to "reveal" and no seam to mismatch.
  const runDecomposition = async (loadingToastId: string): Promise<{ page: Page; summary: DecomposeSummary }> => {
    const { data: saved } = await uploadAPI.upload(file!);
    const previewSrc = `${BACKEND}${saved.url}`;
    let page: Page;
    let summary: DecomposeSummary;
    try {
      ({ page, summary } = await decomposeImage(file!, {
        onProgress: (e: ProgressEvent) => toast.loading(STEP_LABELS[e.step], { id: loadingToastId }),
      }));
    } catch (err) {
      if (err instanceof DecompositionError && err.code === 'empty') {
        const { width, height } = await loadImageSize(previewSrc);
        page = backgroundOnlyPage(previewSrc, width, height);
        summary = { editableText: 0, extractedObjects: 0, flattened: [], notes: [] };
      } else {
        throw err;
      }
    }
    page = await applyFrameHoleDetection(page, saved.url);
    return { page, summary };
  };

  const summaryMessage = (page: Page, summary: DecomposeSummary, verb: 'Template uploaded' | 'Design ready') => {
    const hasFrame = page.elements.some((e) => e.name === 'Photo Frame');
    return hasFrame
      ? `✨ ${verb}! Found a photo frame${summary.editableText > 0 ? ` and ${summary.editableText} text element(s)` : ''} ready to edit`
      : summary.editableText > 0
      ? `✨ ${verb}! ${summary.editableText} text element(s) ready to edit`
      : `✨ ${verb}! Use Text tool to add text when editing`;
  };

  const handleUpload = async () => {
    if (!file) { toast.error('Choose an image to upload'); return; }
    if (!name.trim()) { toast.error('Give your template a name'); return; }

    setUploading(true);
    const loadingToastId = toast.loading('Uploading template...');
    try {
      const { page, summary } = await runDecomposition(loadingToastId);

      const templateData = {
        id: generateId(),
        name: name.trim(),
        pages: [page],
        ownerId: '1', collaborators: [], isFavorite: false, isTemplate: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };

      await templateAPI.create({
        name: name.trim(),
        category,
        thumbnail: page.backgroundImage?.src || '',
        data: templateData,
        tags: [],
        isPremium: false,
      });

      toast.dismiss(loadingToastId);
      toast.success(summaryMessage(page, summary, 'Template uploaded'));
      onCreated();
      handleClose();
    } catch (err: any) {
      toast.dismiss(loadingToastId);
      console.error('[UploadTemplate] failed:', err);
      const errorMsg = err instanceof DecompositionError ? err.message : (err.response?.data?.error || err.message || 'Failed to upload template');
      toast.error(errorMsg);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadAndEdit = async () => {
    if (!file) { toast.error('Choose an image to upload'); return; }
    if (!name.trim()) { toast.error('Give your design a name'); return; }

    setUploading(true);
    const loadingToastId = toast.loading('Uploading image...');
    try {
      const { page, summary } = await runDecomposition(loadingToastId);

      const projectData = {
        name: name.trim(),
        description: '',
        status: 'draft',
        canvasData: [page],
      };

      // Create project via API
      const { data: newProject } = await projectAPI.create(projectData);

      toast.dismiss(loadingToastId);
      toast.success(summaryMessage(page, summary, 'Design ready'));
      handleClose();

      // Redirect to editor
      navigate(`/editor/${newProject.id}`);
    } catch (err: any) {
      toast.dismiss(loadingToastId);
      console.error('[UploadAndEdit] failed:', err);
      const errorMsg = err instanceof DecompositionError ? err.message : (err.response?.data?.error || err.message || 'Failed to create design');
      toast.error(errorMsg);
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

        <div className="flex gap-3 mt-6 flex-col sm:flex-row">
          <button onClick={handleClose} className="py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleUploadAndEdit}
            disabled={uploading || !file || !name.trim()}
            className="py-2.5 rounded-xl bg-canva-purple hover:bg-canva-purple/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            {uploading ? 'Creating…' : '✏️ Edit Design'}
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading || !file || !name.trim()}
            className="py-2.5 rounded-xl border-2 border-canva-purple text-canva-purple hover:bg-canva-purple/5 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
          >
            {uploading ? 'Uploading…' : '📚 Add Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
