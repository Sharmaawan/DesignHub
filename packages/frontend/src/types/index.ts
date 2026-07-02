export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  provider?: string;
  subscriptionPlan?: string;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  thumbnail?: string;
  pages: Page[];
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
}

export interface CanvasElement {
  id: string;
  type: 'text' | 'image' | 'shape' | 'icon' | 'sticker' | 'chart' | 'table' | 'video' | 'group';
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
  data: TextData | ImageData | ShapeData | IconData | ChartData | TableData | VideoData;
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
}

export interface ShapeData {
  type: 'shape';
  shapeType: 'rectangle' | 'circle' | 'triangle' | 'star' | 'pentagon' | 'hexagon' | 'arrow' | 'line' | 'heart' | 'diamond';
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
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
