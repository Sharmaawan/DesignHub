export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  provider?: string;
  subscriptionPlan?: string;
  // Org-team role: 'admin' (approver) or 'editor' (maker). Set at login.
  role?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  thumbnail?: string;
  pages: Page[];
  // Write-only mirror of `pages` sent to the backend's `canvasData` JSON column —
  // see stores/projectStore.ts's loadProjects for how it's read back into `pages`.
  canvasData?: Page[];
  ownerId: string;
  collaborators: string[];
  folderId?: string;
  isFavorite: boolean;
  isTemplate: boolean;
  templateCategory?: string;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string;
}

export interface Page {
  id: string;
  name: string;
  elements: CanvasElement[];
  backgroundColor: string;
  width: number;
  height: number;
  // Set via an image element's "Set as background" action — deliberately a page-level
  // property, not a CanvasElement, so it's automatically excluded from selection,
  // dragging, resizing, deletion, and z-order reordering, and always renders behind
  // every element with no extra locking logic needed. Opaque and fully covers the
  // page, so it visually overrides backgroundColor while set — picking a new
  // background color/gradient clears it (see setPageBackgroundColor), matching real
  // Canva's single-slot page background.
  backgroundImage?: PageBackgroundImage;
  // Present only on pages built by "Make Editable". Loading a page never re-runs
  // decomposition — this is just the record of what was done and from which source.
  decomposition?: PageDecomposition;
  // Video timeline — undefined on every non-video page, preserving today's static-slide behavior.
  duration?: number;
  tracks?: Track[];
  // How this page transitions IN when it becomes the current scene (Preview
  // auto-advance, multi-scene export) — undefined/'none' means an instant cut,
  // today's exact existing behavior.
  transition?: PageTransition;
}

// Crop fields are percentages (0-100) of the SOURCE image, same convention as
// ImageData's cropX/Y/Width/Height — computed once, at "Set as background" time, to
// cover the page's exact dimensions (letterbox-free, center-cropped).
export interface PageBackgroundImage {
  src: string;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
}

export interface Track {
  id: string;
  type: 'video' | 'text' | 'audio';
  name: string;
  locked?: boolean;
  muted?: boolean;
  hidden?: boolean;
}

export interface CanvasElement {
  id: string;
  type: 'text' | 'image' | 'shape' | 'icon' | 'sticker' | 'chart' | 'table' | 'video' | 'audio' | 'group' | 'drawing';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  name: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  shadow?: ElementShadow;
  filters?: ImageFilter[];
  zIndex: number;
  groupId?: string;
  // Video timeline — set only when this element is a clip on a track; undefined means
  // it behaves exactly as a static, spatially-placed element (today's behavior).
  trackId?: string;
  timelineStart?: number;
  timelineEnd?: number;
  // Entrance animation — undefined/'none' means no animation, today's exact existing
  // behavior. Single canonical field for every element type (text included); replaces
  // the old text-only `data.animation` string, which is still read as a one-time
  // migration fallback wherever this is undefined (see readElementAnimation).
  animation?: ElementAnimation;
  // Set only on elements produced by "Make Editable" (flat image -> layers). Absent on
  // everything else, so all existing designs/templates are unaffected.
  /** 0-1 confidence that this layer is a faithful, cleanly separated reconstruction. */
  confidence?: number;
  editable?: boolean;
  /** Which detected region of which source image this layer came from — makes ids stable and re-decomposition detectable. */
  source?: ElementSource;
  // Progressive/non-destructive decomposition (see designDecomposition/DesignDecomposer.ts):
  // only meaningful when `source` is set. A text layer starts `revealed: false` — its real
  // pixels are still only visible through page.backgroundImage (the untouched original)
  // underneath, and this element itself renders nothing yet — until the user actually edits
  // it, at which point reconstructElementRegion() cleans just that region and this flips to
  // true. Object layers (logos/photos/icons) never need this: their cutout image already
  // occludes the original 1:1 the moment they're created, so they render immediately;
  // `revealed` on an object instead just tracks whether ITS background hole has been
  // cleaned yet (done lazily on first move/delete, not on creation).
  revealed?: boolean;
  /** Set when reconstructElementRegion() reported this element's region can't be reconstructed cleanly — the original pixels are left untouched and this element must stay flattened/non-editable rather than risk a visible patch. */
  requiresFlattenedEditing?: boolean;
  data: TextData | ImageData | ShapeData | IconData | ChartData | TableData | VideoData | AudioData | DrawingData;
}

export interface ElementSource {
  regionId: string;
  sourceHash: string;
  version: string;
  role: 'text' | 'logo' | 'badge' | 'icon' | 'qr' | 'photo' | 'decorative' | 'shape' | 'panel';
}

export interface PageDecomposition {
  version: string;
  status: 'completed';
  createdAt: string;
  /** SHA-256 of the original uploaded file — the idempotency key. */
  sourceHash: string;
  /** The untouched original upload — page.backgroundImage starts out pointing at this exact file and is only ever progressively patched from here, never regenerated from scratch. */
  originalUrl: string;
  /** Regions that were deliberately left flattened in the background, and why. */
  flattened: { kind: string; label: string; reason: string }[];
  /**
   * Every text region Stage 1 analysis found (accepted or not), kept around so
   * a later on-demand reconstructElementRegion() call can pass the full
   * neighbor list back to the server (generateTextMask needs every sibling
   * region, not just the one being reconstructed, to model the local
   * background correctly). Without this, editing text after a reload would
   * have no way to re-derive it short of re-running OCR.
   */
  textRegions: { id: string; x: number; y: number; width: number; height: number; core?: { x: number; y: number; width: number; height: number } }[];
}

export interface TextData {
  type: 'text';
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline' | 'line-through';
  textAlign: 'left' | 'center' | 'right' | 'justify';
  color: string;
  lineHeight: number;
  letterSpacing: number;
  textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  outline?: { color: string; width: number };
  shadow?: { color: string; blur: number; offsetX: number; offsetY: number };
  gradient?: { type: 'linear' | 'radial'; colors: string[]; angle: number };
  curvature?: number;
  /** Background color drawn behind the text box, like a highlighter/marker stroke. */
  highlightColor?: string;
  /** Renders as an outline in `color` with a transparent fill instead of a solid fill. */
  hollow?: boolean;
}

export interface ImageData {
  type: 'image';
  src: string;
  originalSrc?: string;
  objectFit: 'cover' | 'contain' | 'fill' | 'none';
  borderRadius: number;
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  filters: string[];
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  // Animated stickers/GIFs — rendered via a live looping <img> sampled every
  // animation frame instead of the static cached bitmap used for photos, since
  // Konva's image cache() (needed for the brightness/contrast/etc. filters above)
  // bakes in a single frame and would otherwise freeze the animation.
  animated?: boolean;
}

export interface ShapeData {
  type: 'shape';
  shapeType: 'rectangle' | 'circle' | 'triangle' | 'star' | 'pentagon' | 'hexagon' | 'arrow' | 'line' | 'heart' | 'diamond';
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
  /** Dash pattern for line/arrow shapes, e.g. [8,6] for dashed, [2,4] for dotted. Solid when absent. */
  dash?: number[];
  /** Arrowhead placement for 'arrow' shapes. Single head at the end when absent. */
  arrowHeads?: 'end' | 'both';
  /** Marks a circle/rectangle shape as a Frame — an empty photo slot until frameImage is set. */
  isFrameSlot?: boolean;
  /** The photo currently filling a frame slot, clipped to the shape's own geometry via fillPatternImage. */
  frameImage?: {
    src: string;
    /** Cover-fit zoom multiplier; 1 = just covers the frame. */
    scale?: number;
    offsetX?: number;
    offsetY?: number;
  };
}

export interface IconData {
  type: 'icon';
  iconSet: string;
  iconName: string;
  svgPath: string;
  fill: string;
  /** Multiple path fragments for compound/multi-shape SVG icons; svgPath is used when absent. */
  svgPaths?: string[];
  /** Per-path fill color, parallel to svgPaths. 'currentColor'/'none' falls back to `fill`. */
  iconFills?: string[];
  /** Original SVG viewBox size — used to scale the icon without distorting its aspect ratio. */
  viewBoxWidth?: number;
  viewBoxHeight?: number;
  /** @deprecated use viewBoxWidth/viewBoxHeight — kept for icons inserted before that split. */
  viewBoxSize?: number;
}

export interface ChartData {
  type: 'chart';
  chartType: 'bar' | 'line' | 'pie' | 'doughnut';
  data: { label: string; value: number; color: string }[];
  showLabels: boolean;
  showLegend: boolean;
}

export interface TableData {
  type: 'table';
  rows: number;
  cols: number;
  cells: string[][];
  headerRow: boolean;
  borderColor: string;
  headerBgColor: string;
  headerTextColor: string;
  cellTextColor: string;
}

export interface VideoData {
  type: 'video';
  src: string;
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
  startTime: number;
  endTime: number;
  // All optional — absent means "unchanged from today's behavior," so existing
  // saved projects render/export exactly as before without needing a migration.
  volume?: number;
  brightness?: number;
  contrast?: number;
  playbackRate?: number;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  flipH?: boolean;
  flipV?: boolean;
  borderRadius?: number;
  reverse?: boolean;
}

export interface AudioData {
  type: 'audio';
  src: string;
  volume: number;
  muted: boolean;
  loop: boolean;
  startTime: number;
  endTime: number;
  fadeIn?: number;
  fadeOut?: number;
}

export interface DrawingData {
  type: 'drawing';
  tool: 'pen' | 'highlighter' | 'eraser';
  // Points are stored relative to the element's own x/y (not absolute page coords),
  // matching how every other element type positions itself — keeps drag/resize/rotate
  // working on drawings the same way they already work on everything else.
  points: number[];
  stroke: string;
  strokeWidth: number;
}

export interface ElementShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}

export interface ImageFilter {
  name: string;
  value: number;
}

export interface Comment {
  id: string;
  projectId: string;
  pageId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  elementId?: string;
  x: number;
  y: number;
  resolved: boolean;
  replies: CommentReply[];
  createdAt: string;
}

export interface CommentReply {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: string;
}

export interface Version {
  id: string;
  projectId: string;
  name: string;
  thumbnail?: string;
  data: Project;
  createdBy: string;
  createdAt: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string;
  color?: string;
  projectCount: number;
  createdAt: string;
}

export interface Template {
  id: string;
  name: string;
  category: string;
  thumbnail: string;
  tags: string[];
  data: Project;
  isPro: boolean;
  ownerId?: string | null;
  deletedAt?: string | null;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  timestamp: string;
}

// ===== NEW TYPES FOR HOMEPAGE UPGRADE =====

export interface Notification {
  id: string;
  userId: string;
  type: 'comment' | 'share' | 'mention' | 'team_invite' | 'export_complete' | 'collaboration' | 'system';
  title: string;
  message: string;
  read: boolean;
  actionUrl?: string;
  actorName?: string;
  actorAvatar?: string;
  createdAt: string;
}

export interface TeamInvite {
  id: string;
  email: string;
  teamId: string;
  teamName: string;
  invitedBy: string;
  invitedByName: string;
  inviteToken: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  role: 'viewer' | 'editor' | 'admin';
  expiresAt: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  plan: 'free' | 'pro' | 'teams' | 'enterprise';
  memberCount: number;
  createdAt: string;
}

export interface QuickAccessCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
  usageCount: number;
  route?: string;
  action?: string;
}

export interface WhatsNewItem {
  id: string;
  title: string;
  description: string;
  category: 'product_update' | 'new_template' | 'ai_feature' | 'seasonal' | 'team_feature';
  image?: string;
  badge?: string;
  link?: string;
  publishedAt: string;
  isActive: boolean;
}

export interface RecentActivity {
  id: string;
  userId: string;
  projectId?: string;
  projectName?: string;
  action: 'created' | 'edited' | 'shared' | 'exported' | 'commented' | 'uploaded';
  timestamp: string;
}

export interface SearchSuggestion {
  id: string;
  text: string;
  type: 'recent' | 'template' | 'project' | 'popular';
  icon?: string;
  thumbnail?: string;
}

export interface DesignType {
  id: string;
  label: string;
  icon: string;
  width: number;
  height: number;
  category: string;
  description?: string;
}

export type PageTransitionType = 'none' | 'fade' | 'slide' | 'wipe' | 'dissolve' | 'pan' | 'rise' | 'flow' | 'matchAndMove';

export interface PageTransition {
  type: PageTransitionType;
  duration: number;
  delay: number;
  direction?: 'left' | 'right' | 'up' | 'down';
}

export type ElementAnimationType = 'none' | 'fadeIn' | 'pop' | 'bounce' | 'slide' | 'rise' | 'zoom' | 'rotate' | 'typewriter' | 'pulse';

export interface ElementAnimation {
  type: ElementAnimationType;
  duration: number;
  delay: number;
  direction?: 'left' | 'right' | 'up' | 'down';
}

export interface LayerItem {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  children?: string[];
  parentId?: string;
}
