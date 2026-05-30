import React, { useState } from "react";

export type PageType = "canvasA" | "canvasB" | "canvasC" | "canvasSettings";

interface SidebarProps {
  activePage: PageType;
  onNavigate: (page: PageType) => void;
}

const Icon = ({ path }: { path: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    className="h-[18px] w-[18px]"
  >
    <path d={path} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MENU_ITEMS: { id: PageType; label: string; icon: string }[] = [
  {
    id: "canvasA",
    label: "Ana Ekran",
    icon: "M3 10.5 12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-3.75V14.25h-7.5V21H4.5A1.5 1.5 0 0 1 3 19.5v-9Z",
  },
  {
    id: "canvasC",
    label: "Motorlar",
    icon: "M10 3h4l1 2 2 1 2-1 2 4-1 2 1 2-2 4-2-1-2 1-1 2h-4l-1-2-2-1-2 1-2-4 1-2-1-2 2-4 2 1 2-1 1-2Zm2 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z",
  },
  {
    id: "canvasB",
    label: "Çeviri Katmanı",
    icon: "M4 6.75A1.75 1.75 0 0 1 5.75 5h12.5A1.75 1.75 0 0 1 20 6.75v8.5A1.75 1.75 0 0 1 18.25 17H5.75A1.75 1.75 0 0 1 4 15.25v-8.5Zm3.5 12.25h9",
  },
  {
    id: "canvasSettings",
    label: "Ayarlar",
    icon: "M12 3v3m0 12v3m9-9h-3M6 12H3m15.364 6.364-2.121-2.121M7.757 7.757 5.636 5.636m12.728 0-2.121 2.121M7.757 16.243l-2.121 2.121M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
  },
];

const SIDEBAR_WIDTH = { expanded: 172, compact: 60 } as const;
const ICON_SHELL_SIZE = 36;
const COMPACT_ICON_PAD_LEFT = 2;
const EXPANDED_ICON_PAD_LEFT = 10;

const SidebarItem: React.FC<{
  item: { id: PageType; label: string; icon: string };
  activePage: PageType;
  expanded: boolean;
  onNavigate: (page: PageType) => void;
}> = ({ item, activePage, expanded, onNavigate }) => {
  const isActive = activePage === item.id;
  const transition = `padding-left var(--dur-standard) ease,
    padding-right var(--dur-standard) ease,
    background 150ms ease, color 150ms ease`;

  return (
    <button
      type="button"
      onClick={() => onNavigate(item.id)}
      className={`app-sidebar-button app-button-halo flex h-11 items-center ${isActive ? "is-active" : ""}`}
      title={!expanded ? item.label : undefined}
      style={{
        justifyContent: "flex-start",
        gap: 10,
        paddingLeft: expanded ? EXPANDED_ICON_PAD_LEFT : COMPACT_ICON_PAD_LEFT,
        paddingRight: expanded ? 12 : 0,
        transition,
      }}
    >
      {isActive && <div className="app-sidebar-active" />}
      <div
        className={`app-sidebar-icon-shell z-10 flex shrink-0 items-center justify-center rounded-[10px] ${isActive ? "is-active" : ""}`}
        style={{ width: ICON_SHELL_SIZE, height: ICON_SHELL_SIZE }}
      >
        <Icon path={item.icon} />
      </div>
      <span
        style={{
          overflow: "hidden",
          whiteSpace: "nowrap",
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1,
          color: "rgba(255,255,255,0.78)",
          zIndex: 10,
          maxWidth: expanded ? 110 : 0,
          opacity: expanded ? 1 : 0,
          transition: `max-width var(--dur-standard) ease,
            opacity ${expanded ? "var(--dur-fast)" : "var(--dur-standard)"} ease`,
        }}
      >
        {item.label}
      </span>
    </button>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({ activePage, onNavigate }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      className="app-sidebar relative z-50 flex h-full flex-shrink-0 flex-col border-r transition-[width] duration-200"
      style={{
        width: expanded ? SIDEBAR_WIDTH.expanded : SIDEBAR_WIDTH.compact,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="app-sidebar-button flex mb-3 mt-3 h-10 items-center justify-center"
        title={expanded ? "Daralt" : "Genişlet"}
      >
        <div className={`app-hamburger ${expanded ? "is-open" : ""}`}>
          <span className="app-hamburger-line" />
          <span className="app-hamburger-line" />
          <span className="app-hamburger-line" />
        </div>
      </button>

      <div className="flex flex-1 flex-col px-0">
        <div className="flex flex-1 flex-col gap-0">
          {MENU_ITEMS.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              activePage={activePage}
              expanded={expanded}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
    </aside>
  );
};
