import { HiOutlineX, HiOutlinePhotograph, HiOutlineSparkles } from 'react-icons/hi';
import toast from 'react-hot-toast';

interface DesignModeSelectorProps {
  imageName: string;
  imageSrc: string;
  onClose: () => void;
  onModeSelected: (mode: 'image' | 'design') => void;
  onImageModeSelected?: (imageSrc: string, imageName: string) => void;
}

export default function DesignModeSelector({ imageName, imageSrc, onClose, onModeSelected, onImageModeSelected }: DesignModeSelectorProps) {
  const handleImageMode = () => {
    if (onImageModeSelected) {
      onImageModeSelected(imageSrc, imageName);
    } else {
      onModeSelected('image');
    }
    toast.success(`${imageName} added to canvas`);
    onClose();
  };

  const handleDesignMode = () => {
    onModeSelected('design');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-canva-dark-surface rounded-2xl border border-gray-200 dark:border-gray-700 max-w-2xl w-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">How would you like to edit this image?</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <HiOutlineX size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            <strong>{imageName}</strong> can be edited as:
          </p>

          {/* Option 1: Single Image */}
          <button
            onClick={handleImageMode}
            className="w-full p-6 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-canva-purple hover:bg-canva-purple/5 transition-all text-left group"
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center group-hover:bg-canva-purple/20 transition-colors">
                <HiOutlinePhotograph size={20} className="text-gray-600 dark:text-gray-400 group-hover:text-canva-purple" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Edit as a single image</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Keep it as one flat image. Use crop, filters, and adjustments but cannot edit individual text/shapes/logos separately.
                </p>
              </div>
            </div>
          </button>

          {/* Option 2: Design (Reconstructed) */}
          <button
            onClick={handleDesignMode}
            className="w-full p-6 rounded-xl border-2 border-canva-purple bg-canva-purple/5 hover:bg-canva-purple/10 transition-all text-left group"
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-canva-purple/20 flex items-center justify-center group-hover:bg-canva-purple/30 transition-colors">
                <HiOutlineSparkles size={20} className="text-canva-purple" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                  Edit as a design (Recommended)
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-canva-purple/20 text-canva-purple">Best for posters</span>
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                  Analyze the image and split it into separate, independently editable layers:
                </p>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 ml-4">
                  <li>✓ Editable text (change content, font, color)</li>
                  <li>✓ Separated shapes (change colors independently)</li>
                  <li>✓ Logos/graphics as individual elements</li>
                  <li>✓ Background photo/texture</li>
                </ul>
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">
                  💡 Best-effort: complex or overlapping graphics may remain part of the background.
                </p>
              </div>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900/20 rounded-b-2xl">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            💡 Tip: You can always click "Edit as Design" on any image in the Properties panel later.
          </p>
        </div>
      </div>
    </div>
  );
}
