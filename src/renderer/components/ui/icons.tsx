import type { ReactNode } from "react";
import { LucideProvider } from "lucide-react";

export const ICON_SIZE = 13;

export function IconDefaults({ children }: { children: ReactNode }) {
  return <LucideProvider size={ICON_SIZE}>{children}</LucideProvider>;
}

export {
  Globe as GlobeIcon,
  MapPin as MapPinIcon,
  Plus as PlusIcon,
  Minus as MinusIcon,
  GitBranch as BranchIcon,
  RefreshCw as RefreshIcon,
  Folder as FolderIcon,
  X as CloseIcon,
  Check as CheckIcon,
  Settings as SettingsIcon,
  PanelLeft as SidebarIcon,
  ChevronDown as ChevronDownIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  ChevronUp as ChevronUpIcon,
  UserRound as IdentityIcon,
  Tag as TagIcon,
  Maximize2 as MaximizeIcon,
  Minimize2 as RestoreIcon,
  FileDiff as DiffIcon,
  FolderTree as TreeIcon,
  History as HistoryIcon,
  LoaderCircle as SpinnerIcon,
} from "lucide-react";
