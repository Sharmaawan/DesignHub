import { useEditorStore } from '../../stores/editorStore';
import { HiOutlineX, HiOutlineArrowLeft } from 'react-icons/hi';
import TextProperties from './properties/TextProperties';
import ImageProperties from './properties/ImageProperties';
import ShapeProperties from './properties/ShapeProperties';
import RightSidebar from './RightSidebar';

/**
 * Modern properties panel that adapts based on selected element type
 * Shows TEXT properties for text, IMAGE properties for images, etc.
 */
export default function RightPropertiesPanel() {
  const { selectedElementIds, pages, currentPageIndex, sidePanelTab, rightPanelOpen, setRightPanelOpen } = useEditorStore();

  const currentPage = pages[currentPageIndex];
  const selectedElement = selectedElementIds.length === 1
    ? currentPage?.elements.find((el) => el.id === selectedElementIds[0])
    : null;

  const getPropertyTitle = () => {
    if (selectedElementIds.length === 0) return 'Design';
    if (selectedElementIds.length > 1) return `${selectedElementIds.length} Elements`;

    if (selectedElement) {
      const typeLabels: Record<string, string> = {
        text: 'Text',
        image: 'Image',
        shape: 'Shape',
        line: 'Line',
        video: 'Video',
        icon: 'Icon',
        background: 'Background',
      };
      return typeLabels[selectedElement.type] || 'Properties';
    }

    return 'Properties';
  };

  // rightPanelOpen already had a working setter (RightSidebar's own "nothing
  // selected" view called setRightPanelOpen(false) from its X button) but
  // nothing ever read it here — so closing collapsed only the *inner* content
  // to a thin strip while this outer wrapper stayed pinned at its full w-72,
  // still blocking the canvas underneath on a narrow overlay. Collapsing the
  // outer wrapper itself is what actually gives the canvas back; the free-
  // floating arrow tab is how it reopens (same collapsed affordance
  // RightSidebar already used internally, just now at the level that matters).
  if (!rightPanelOpen) {
    return (
      <button
        onClick={() => setRightPanelOpen(true)}
        title="Show design panel"
        className="absolute lg:relative inset-y-0 lg:inset-auto right-0 z-30 lg:z-auto w-6 flex-shrink-0 bg-white dark:bg-canva-dark-surface border-l border-gray-200 dark:border-canva-dark-border hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center transition-colors"
      >
        <HiOutlineArrowLeft size={14} className="text-gray-400" />
      </button>
    );
  }

  return (
    // See SidePanel.tsx for why this is an overlay below `lg` instead of a
    // fixed-width flex sibling: two such panels never shrinking is what was
    // crushing the canvas and clipping this panel to an unreadable sliver on
    // narrow viewports. Making it an overlay fixed *that*, but with SidePanel
    // also an overlay now, both showing at once just swapped a squeezed-flex
    // pile-up for a stacked-overlay one — still two panels fighting for the
    // same screen. Below `lg`, whichever the user opened from the icon nav
    // (sidePanelTab) wins and this one steps aside entirely, matching a
    // phone-style editor where only one panel is ever on screen; closing it
    // (the X button) brings this back. `lg:flex` restores normal side-by-side
    // display once there's room for both.
    <div className={`${sidePanelTab ? 'hidden lg:flex' : 'flex'} absolute lg:relative inset-y-0 lg:inset-auto right-0 z-30 lg:z-auto w-72 max-w-[calc(100vw-4rem)] bg-white dark:bg-canva-dark-surface border-l border-gray-200 dark:border-canva-dark-border flex-col overflow-hidden flex-shrink-0 shadow-xl lg:shadow-sm animate-slide-in-right`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {getPropertyTitle()}
          </h3>
          {selectedElement && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {selectedElement.name || `${selectedElement.type} element`}
            </p>
          )}
        </div>
        <button
          onClick={() => setRightPanelOpen(false)}
          title="Hide design panel"
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
        >
          <HiOutlineX size={18} />
        </button>
      </div>

      {/* Content - Element-specific properties */}
      <div className="flex-1 overflow-y-auto">
        {!selectedElement && <RightSidebar />}
        {selectedElement?.type === 'text' && <TextProperties />}
        {selectedElement?.type === 'image' && <ImageProperties />}
        {selectedElement?.type === 'shape' && <ShapeProperties />}
        {selectedElement && !['text', 'image', 'shape'].includes(selectedElement.type) && <RightSidebar />}
      </div>
    </div>
  );
}
