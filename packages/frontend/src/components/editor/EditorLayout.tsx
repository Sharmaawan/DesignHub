import { ReactNode } from 'react';
import IconNavigation from './IconNavigation';
import SidePanel from './SidePanel';
import RightPropertiesPanel from './RightPropertiesPanel';

interface EditorLayoutProps {
  children: ReactNode;
}

/**
 * Modern Canva-like editor layout:
 * [Icon Nav] [Side Panel] [Canvas] [Properties Panel]
 */
export default function EditorLayout({ children }: EditorLayoutProps) {
  return (
    // `relative` gives SidePanel/RightPropertiesPanel a positioning root for their
    // narrow-viewport overlay mode (see SidePanel.tsx) that excludes the toolbar
    // above this row — a `fixed` overlay would measure from the actual browser
    // viewport instead and cover the toolbar.
    <div className="flex-1 flex overflow-hidden relative">
      {/* Icon Navigation (left) */}
      <IconNavigation />

      {/* Dynamic Side Panel */}
      <SidePanel />

      {/* Main Canvas Area */}
      {children}

      {/* Right Properties Panel */}
      <RightPropertiesPanel />
    </div>
  );
}
