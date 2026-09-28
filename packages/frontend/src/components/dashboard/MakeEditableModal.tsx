import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineCheck, HiOutlineX, HiOutlineExclamation } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { projectAPI } from '../../utils/api';
import { decomposeImage, DecompositionError, ProgressEvent, StepId, StepStatus, STEP_LABELS } from '../../utils/designDecomposition/DesignDecomposer';

interface Props {
  file: File;
  onClose: () => void;
}

// Order the steps actually run in (text detection happens before the server-side analysis).
// 'text' (OCR) and 'objects' (vision) now run concurrently — see DesignDecomposer.ts —
// listed in that order since both go active together, right after upload.
const STEP_ORDER: StepId[] = ['upload', 'text', 'objects', 'analyze', 'background', 'layers'];
type Phase = 'preview' | 'processing' | 'error';

export default function MakeEditableModal({ file, onClose }: Props) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('preview');
  const [previewUrl, setPreviewUrl] = useState('');
  const [steps, setSteps] = useState<Partial<Record<StepId, { status: StepStatus; detail?: string }>>>({});
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  // Set synchronously on click: a double-click (or a remount) can never start a second run.
  const runningRef = useRef(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const baseName = file.name.replace(/\.[^/.]+$/, '') || 'Untitled Design';

  const handleClose = () => {
    abortRef.current?.abort();
    onClose();
  };

  // The upload becomes the page's actual background (page.backgroundImage —
  // the same field the editor's own "Set as Background" context-menu action
  // and the AI decomposition pipeline both use), not a normal image element.
  // It used to be a plain full-page `type: 'image'` element — which meant it
  // was, like any other element, fully selectable/draggable/resizable, so
  // clicking anywhere on the design showed a giant Transformer box around
  // the whole page. The page here is sized to exactly match the image, so
  // no cover-fit cropping is needed (cropWidth/Height stay 100%) — unlike
  // "Set as Background" fitting an existing element into an already-fixed
  // page size, there's no size mismatch to reconcile here.
  const useAsBackground = () => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = async () => {
        const width = Math.min(img.width, 1920);
        const height = Math.min(img.height, 1920);
        const pages = [{
          id: `page-${Date.now()}`, name: 'Page 1',
          elements: [],
          backgroundImage: { src: ev.target?.result as string, cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 },
          backgroundColor: '#FFFFFF', width, height,
        }];
        try {
          const { data } = await projectAPI.create({ name: baseName, canvasData: pages });
          navigate(`/editor/${data.id}`);
        } catch {
          toast.error('Failed to create design');
        }
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const makeEditable = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setSteps({});
    setError('');
    setPhase('processing');
    try {
      const { page, summary } = await decomposeImage(file, {
        signal: controller.signal,
        onProgress: (e: ProgressEvent) => setSteps((s) => ({ ...s, [e.step]: { status: e.status, detail: e.detail } })),
      });
      // Only now — with a fully validated design in hand — is anything created.
      const { data: project } = await projectAPI.create({ name: baseName, canvasData: [page] });
      const parts = [`${summary.editableText} text layer${summary.editableText === 1 ? '' : 's'}`];
      if (summary.extractedObjects) parts.push(`${summary.extractedObjects} graphic${summary.extractedObjects === 1 ? '' : 's'}`);
      toast.success(`Design is editable: ${parts.join(' and ')}`);
      for (const n of summary.notes) toast(n, { icon: 'ℹ️', duration: 8000 });
      navigate(`/editor/${project.id}`);
    } catch (err) {
      if (err instanceof DecompositionError && err.code === 'aborted') { onClose(); return; }
      setError(err instanceof DecompositionError && err.code === 'empty'
        ? err.message
        : `Unable to make this design editable right now. ${err instanceof Error ? err.message : ''}`.trim());
      setPhase('error');
    } finally {
      runningRef.current = false;
    }
  };

  const doneCount = STEP_ORDER.filter((s) => steps[s]?.status === 'done' || steps[s]?.status === 'skipped').length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={phase === 'processing' ? undefined : handleClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            {phase === 'processing' ? 'Making your design editable' : 'Image Preview'}
          </h3>
          <button onClick={handleClose} aria-label="Close" className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <HiOutlineX size={18} className="text-gray-500" />
          </button>
        </div>

        {phase !== 'processing' && (
          <div className="rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mb-4">
            {previewUrl && <img src={previewUrl} alt="Uploaded design preview" className="max-h-72 w-full object-contain" />}
          </div>
        )}

        {phase === 'preview' && (
          <>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Nothing has been changed. Make it editable to split this image into separate text and graphic layers, or use it as a plain background.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={makeEditable} className="flex-1 py-2.5 rounded-xl bg-[#7B2FBE] hover:bg-[#6A25A8] text-white text-sm font-semibold transition-colors">
                Make Editable
              </button>
              <button onClick={useAsBackground} className="flex-1 py-2.5 rounded-xl border-2 border-[#7B2FBE] text-[#7B2FBE] hover:bg-[#7B2FBE]/5 text-sm font-semibold transition-colors">
                Use as Background
              </button>
            </div>
          </>
        )}

        {phase === 'processing' && (
          <>
            <ul className="space-y-2.5 mb-4">
              {STEP_ORDER.map((id) => {
                const s = steps[id];
                return (
                  <li key={id} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 w-5 h-5 flex items-center justify-center flex-shrink-0">
                      {s?.status === 'done' && <HiOutlineCheck className="text-green-600" size={16} />}
                      {s?.status === 'skipped' && <span className="text-gray-400 text-base leading-none">–</span>}
                      {s?.status === 'active' && <span className="w-3.5 h-3.5 rounded-full border-2 border-[#7B2FBE] border-t-transparent animate-spin" />}
                      {!s && <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />}
                    </span>
                    <span className={s ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}>
                      {STEP_LABELS[id]}
                      {s?.detail && <span className="block text-xs text-gray-500 dark:text-gray-400">{s.detail}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mb-4">
              <div className="h-full bg-[#7B2FBE] transition-all duration-500" style={{ width: `${(doneCount / STEP_ORDER.length) * 100}%` }} />
            </div>
            <button onClick={handleClose} className="w-full py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
          </>
        )}

        {phase === 'error' && (
          <>
            <div className="flex gap-2 items-start rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 mb-4">
              <HiOutlineExclamation className="text-red-500 mt-0.5 flex-shrink-0" size={18} />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={makeEditable} className="flex-1 py-2.5 rounded-xl bg-[#7B2FBE] hover:bg-[#6A25A8] text-white text-sm font-semibold transition-colors">Try Again</button>
              <button onClick={useAsBackground} className="flex-1 py-2.5 rounded-xl border-2 border-[#7B2FBE] text-[#7B2FBE] hover:bg-[#7B2FBE]/5 text-sm font-semibold transition-colors">Use as Background</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
