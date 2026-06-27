import { HiOutlineX, HiOutlinePlus, HiOutlineRefresh, HiOutlineDocument } from 'react-icons/hi';

interface TemplateReplaceModalProps {
  open: boolean;
  templateName: string;
  onReplace: () => void;
  onAddPage: () => void;
  onCancel: () => void;
}

export default function TemplateReplaceModal({ open, templateName, onReplace, onAddPage, onCancel }: TemplateReplaceModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 text-center">
          <div className="w-14 h-14 bg-canva-purple/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <HiOutlineRefresh size={24} className="text-canva-purple" />
          </div>
          <h3 className="text-lg font-display font-bold text-gray-900 dark:text-white mb-2">
            Use template "{templateName}"?
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Your current canvas has content. How would you like to apply this template?
          </p>

          <div className="space-y-2">
            <button
              onClick={onReplace}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all text-left group"
            >
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center group-hover:bg-red-200 transition-colors">
                <HiOutlineRefresh size={20} className="text-red-500" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">Replace current design</div>
                <div className="text-xs text-gray-400">Clear the canvas and apply the template</div>
              </div>
            </button>

            <button
              onClick={onAddPage}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-canva-purple hover:bg-canva-purple/5 transition-all text-left group"
            >
              <div className="w-10 h-10 bg-canva-purple/10 rounded-xl flex items-center justify-center group-hover:bg-canva-purple/20 transition-colors">
                <HiOutlinePlus size={20} className="text-canva-purple" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">Add as new page</div>
                <div className="text-xs text-gray-400">Keep existing content, add template on a new page</div>
              </div>
            </button>

            <button
              onClick={onCancel}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all text-left group"
            >
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center">
                <HiOutlineX size={20} className="text-gray-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">Cancel</div>
                <div className="text-xs text-gray-400">Keep current design unchanged</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
