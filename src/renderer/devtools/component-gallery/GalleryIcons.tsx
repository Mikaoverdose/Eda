import { t } from "@shared/i18n";
import type { LucideIcon } from "lucide-react";
import { SpinnerIcon } from "../../components/ui/icons";
import {
  BranchIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CloseIcon,
  DiffIcon,
  FolderIcon,
  HistoryIcon,
  IconDefaults,
  IdentityIcon,
  MaximizeIcon,
  MinusIcon,
  PlusIcon,
  RefreshIcon,
  RestoreIcon,
  SettingsIcon,
  SidebarIcon,
  TagIcon,
  TreeIcon,
} from "../../components/ui/index";
import { Name, Sample } from "./GallerySample";

const ICONS: { name: string; icon: LucideIcon }[] = [
  { name: "BranchIcon", icon: BranchIcon },
  { name: "CheckIcon", icon: CheckIcon },
  { name: "ChevronDownIcon", icon: ChevronDownIcon },
  { name: "ChevronLeftIcon", icon: ChevronLeftIcon },
  { name: "ChevronRightIcon", icon: ChevronRightIcon },
  { name: "ChevronUpIcon", icon: ChevronUpIcon },
  { name: "CloseIcon", icon: CloseIcon },
  { name: "DiffIcon", icon: DiffIcon },
  { name: "FolderIcon", icon: FolderIcon },
  { name: "HistoryIcon", icon: HistoryIcon },
  { name: "IdentityIcon", icon: IdentityIcon },
  { name: "MaximizeIcon", icon: MaximizeIcon },
  { name: "MinusIcon", icon: MinusIcon },
  { name: "PlusIcon", icon: PlusIcon },
  { name: "RefreshIcon", icon: RefreshIcon },
  { name: "RestoreIcon", icon: RestoreIcon },
  { name: "SettingsIcon", icon: SettingsIcon },
  { name: "SidebarIcon", icon: SidebarIcon },
  { name: "SpinnerIcon", icon: SpinnerIcon },
  { name: "TagIcon", icon: TagIcon },
  { name: "TreeIcon", icon: TreeIcon },
];

export function GalleryIcons() {
  return (
    <>
      <Sample id="gallery-icons" title={t("settings.componentGallery.icons")}>
        <IconDefaults>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {ICONS.map(({ name, icon: Icon }) => (
              <div
                key={name}
                className="gallery-icon flex min-w-0 items-center gap-2 rounded-md border border-border-subtle bg-bg-inset px-3 py-3 text-xs text-text-secondary"
              >
                <Icon aria-hidden="true" />
                <span className="min-w-0 truncate">{name}</span>
              </div>
            ))}
          </div>
        </IconDefaults>

        <Name>{t("settings.componentGallery.iconDefaultsIconsTsx")}</Name>
      </Sample>
    </>
  );
}
