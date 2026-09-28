import { useNavigate, useParams } from 'react-router-dom';
import { useEditorStore } from '../../stores/editorStore';
import {
  HiOutlineChevronLeft, HiOutlineCheck, HiArrowLeft,
  HiOutlineArrowSmLeft, HiOutlineArrowSmRight,
  HiOutlineEye, HiOutlineShare, HiOutlineDocumentDownload,
  HiOutlineSparkles, HiOutlineCog, HiOutlineQuestionMarkCircle,
} from 'react-icons/hi';

interface TopToolbarNewProps {
  onOpenPreview: () => void;
  onOpenShare: () => void;
  onOpenExport: () => void;
  onOpenPublish: () => void;
  onOpenSettings: () => void;
  isDark: boolean;
  onThemeToggle: () => void;
}

export default function TopToolbarNew({
  onOpenPreview,
  onOpenShare,
  onOpenExport,
  onOpenPublish,
  onOpenSettings,
  isDark,
  onThemeToggle,
}: TopToolbarNewProps) {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { project, undo, redo, zoomIn, zoomOut, zoomToFit, zoom, isSaving, lastSaved } = useEditorStore();

  return (
    <div className="relative h-14 bg-white dark:bg-canva-dark-surface flex items-center justify-between px-4 gap-4 flex-shrink-0">
      {/* Animated gradient strip along this bar's own bottom edge — not a
          separate element floating above it, so it reads as part of this
          toolbar rather than something else entirely. Reuses the same
          shifting-gradient pattern already used for the Magic AI Studio
          banner/Create button elsewhere. */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#7B2FBE] via-[#EC4899] to-[#00C4CC] bg-[length:200%_200%] animate-gradient-shift" />

      {/* LEFT: Home & Project Name */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
          title="Back to dashboard"
        >
          <HiArrowLeft size={18} />
        </button>

        <div className="border-l border-gray-200 dark:border-gray-700 pl-3">
          <h1 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {project?.name || 'Untitled Design'}
          </h1>
          <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isSaving
                  ? 'bg-amber-400 animate-pulse'
                  : lastSaved
                  ? 'bg-emerald-500'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
            />
            {isSaving ? 'Saving…' : lastSaved ? 'Saved' : 'Not saved'}
          </p>
        </div>
      </div>

      {/* CENTER: Edit Tools */}
      <div className="flex items-center gap-1">
        <button
          onClick={undo}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
          title="Undo (Ctrl+Z)"
        >
          <HiOutlineArrowSmLeft size={18} />
        </button>
        <button
          onClick={redo}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
          title="Redo (Ctrl+Shift+Z)"
        >
          <HiOutlineArrowSmRight size={18} />
        </button>

        <div className="border-l border-gray-200 dark:border-gray-700 mx-1 h-6" />

        {/* Zoom Controls — grouped into one pill so they read as a single
            control instead of four loose buttons */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={zoomOut}
            className="w-6 h-6 flex items-center justify-center text-sm text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700 rounded-md shadow-none hover:shadow-sm transition-all"
            title="Zoom out"
          >
            −
          </button>
          <div className="px-2 text-xs font-medium text-gray-900 dark:text-white min-w-12 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </div>
          <button
            onClick={zoomIn}
            className="w-6 h-6 flex items-center justify-center text-sm text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700 rounded-md shadow-none hover:shadow-sm transition-all"
            title="Zoom in"
          >
            +
          </button>
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5" />
          <button
            onClick={zoomToFit}
            className="px-2 h-6 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700 rounded-md shadow-none hover:shadow-sm transition-all"
            title="Fit to screen"
          >
            Fit
          </button>
        </div>
      </div>

      {/* RIGHT: Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenPreview}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium transition-colors"
          title="Preview design"
        >
          <HiOutlineEye size={16} />
          Preview
        </button>

        <div className="border-l border-gray-200 dark:border-gray-700 h-6" />

        <button
          onClick={onOpenShare}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
          title="Share"
        >
          <HiOutlineShare size={18} />
        </button>

        <button
          onClick={onOpenExport}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
          title="Download / Export"
        >
          <HiOutlineDocumentDownload size={18} />
        </button>

        <button
          onClick={onOpenPublish}
          className="px-3 py-2 rounded-lg bg-canva-purple hover:bg-canva-purple-dark text-white text-sm font-medium shadow-canva hover:shadow-canva-lg transition-all flex items-center gap-2"
          title="Publish design"
        >
          <HiOutlineCheck size={16} />
          Publish
        </button>

        <button
          onClick={onOpenSettings}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
          title="Settings"
        >
          <HiOutlineCog size={18} />
        </button>
      </div>
    </div>
  );
}
