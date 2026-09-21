import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import {
  BellRing,
  Check,
  ChevronRight,
  Download,
  History,
  LockKeyhole,
  LogOut,
  Mic2,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Settings,
  Sun,
  UserRoundCog,
} from "lucide-react";
import "./SettingsContextMenu.css";

const MENU_WIDTH = 282;
const SUBMENU_WIDTH = 240;
const VIEWPORT_GAP = 12;

const THEME_OPTIONS = [
  { id: "light", label: "Light", graphic: <Sun aria-hidden="true" size={16} /> },
  { id: "dark", label: "Dark", graphic: <Moon aria-hidden="true" size={16} /> },
  { id: "system", label: "System", graphic: <Monitor aria-hidden="true" size={16} /> },
];

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export default function SettingsContextMenu({
  academicProfiles = [],
  activeAcademicProfileId = "",
  appearanceDisabled = false,
  currentTheme = "light",
  onAppearanceChange,
  onCheckForUpdates,
  onLockApp,
  onLogout,
  onOpenAlertHistory,
  onOpenSettings,
  onRefreshAppData,
  onRestartVoiceAssistant,
  onSwitchAcademicProfile,
  workspaceTransitioning = false,
}) {
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [switchingProfileId, setSwitchingProfileId] = useState("");
  const [profileError, setProfileError] = useState("");
  const showAppearanceMenu = appearanceOpen && !appearanceDisabled;
  const showProfileMenu = profileOpen;
  const profileBusy = Boolean(switchingProfileId) || workspaceTransitioning;

  const closeMenu = ({ restoreFocus = false } = {}) => {
    setMenuPosition(null);
    setAppearanceOpen(false);
    setProfileOpen(false);
    setProfileError("");
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
    }
  };

  const openMenu = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const openToRight = rect.right + 10 + MENU_WIDTH <= window.innerWidth - VIEWPORT_GAP;
    const left = openToRight
      ? rect.right + 10
      : Math.max(VIEWPORT_GAP, rect.left - MENU_WIDTH - 10);
    const availableHeight = Math.max(280, rect.top - VIEWPORT_GAP - 8);

    setAppearanceOpen(false);
    setProfileOpen(false);
    setProfileError("");
    setMenuPosition({
      left: clamp(left, VIEWPORT_GAP, Math.max(VIEWPORT_GAP, window.innerWidth - MENU_WIDTH - VIEWPORT_GAP)),
      bottom: Math.max(VIEWPORT_GAP, window.innerHeight - rect.top + 8),
      maxHeight: availableHeight,
      submenuSide: left + MENU_WIDTH + 8 + SUBMENU_WIDTH <= window.innerWidth - VIEWPORT_GAP
        ? "right"
        : "left",
    });
  };

  useEffect(() => {
    if (!menuPosition) return undefined;

    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) {
        closeMenu();
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (showAppearanceMenu) {
          setAppearanceOpen(false);
          menuRef.current?.querySelector('[data-menu-action="appearance"]')?.focus({ preventScroll: true });
        } else if (showProfileMenu) {
          setProfileOpen(false);
          menuRef.current?.querySelector('[data-menu-action="profile"]')?.focus({ preventScroll: true });
        } else {
          closeMenu({ restoreFocus: true });
        }
      }
    };
    const handleViewportChange = () => closeMenu();

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [menuPosition, showAppearanceMenu, showProfileMenu]);

  useEffect(() => {
    if (!menuPosition) return;
    window.requestAnimationFrame(() => {
      menuRef.current?.querySelector('[data-menu-level="root"]:not(:disabled)')?.focus({ preventScroll: true });
    });
  }, [menuPosition]);

  const runAction = (action) => {
    closeMenu();
    action?.();
  };

  const chooseProfile = async (profile) => {
    if (!profile?.id || profileBusy || profile.deletionPending) return;
    if (profile.id === activeAcademicProfileId) {
      closeMenu();
      return;
    }
    if (!onSwitchAcademicProfile) {
      setProfileError("Profile switching is unavailable right now.");
      return;
    }

    setSwitchingProfileId(profile.id);
    setProfileError("");
    try {
      await onSwitchAcademicProfile(profile);
      closeMenu();
    } catch (error) {
      setProfileError(error?.message || "Could not change the academic profile.");
    } finally {
      setSwitchingProfileId("");
    }
  };

  const handleRootMenuKeyDown = (event) => {
    if (event.defaultPrevented) return;
    if (
      event.key === "ArrowRight"
      && !appearanceDisabled
      && event.target?.dataset?.menuAction === "appearance"
    ) {
      event.preventDefault();
      setAppearanceOpen(true);
      setProfileOpen(false);
      window.requestAnimationFrame(() => {
        menuRef.current?.querySelector('[data-menu-level="theme"]')?.focus({ preventScroll: true });
      });
      return;
    }
    if (event.key === "ArrowRight" && event.target?.dataset?.menuAction === "profile" && !profileBusy) {
      event.preventDefault();
      setAppearanceOpen(false);
      setProfileOpen(true);
      window.requestAnimationFrame(() => {
        menuRef.current?.querySelector('[data-menu-level="profile"]:not(:disabled)')?.focus({ preventScroll: true });
      });
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

    const items = Array.from(
      menuRef.current?.querySelectorAll('[data-menu-level="root"]:not(:disabled)') || [],
    );
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus({ preventScroll: true });
  };

  const handleThemeMenuKeyDown = (event) => {
    if (event.key === "ArrowLeft") {
      event.stopPropagation();
      event.preventDefault();
      setAppearanceOpen(false);
      menuRef.current?.querySelector('[data-menu-action="appearance"]')?.focus({ preventScroll: true });
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.stopPropagation();
    const items = Array.from(menuRef.current?.querySelectorAll('[data-menu-level="theme"]') || []);
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus({ preventScroll: true });
  };

  const handleProfileMenuKeyDown = (event) => {
    if (event.key === "ArrowLeft") {
      event.stopPropagation();
      event.preventDefault();
      setProfileOpen(false);
      menuRef.current?.querySelector('[data-menu-action="profile"]')?.focus({ preventScroll: true });
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.stopPropagation();
    const items = Array.from(
      menuRef.current?.querySelectorAll('[data-menu-level="profile"]:not(:disabled)') || [],
    );
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus({ preventScroll: true });
  };

  const menu = menuPosition && typeof document !== "undefined"
    ? createPortal(
      <div
        className={`settings-context-menu-shell submenu-${menuPosition.submenuSide}`}
        ref={menuRef}
        style={{
          bottom: `${menuPosition.bottom}px`,
          left: `${menuPosition.left}px`,
          maxHeight: `${menuPosition.maxHeight}px`,
        }}
      >
        <div
          aria-label="Settings actions"
          className="settings-context-menu"
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={handleRootMenuKeyDown}
          role="menu"
        >
          <button data-menu-level="root" onClick={() => runAction(onOpenSettings)} role="menuitem" type="button">
            <Settings aria-hidden="true" size={17} />
            <span>Open Settings</span>
          </button>
          <button data-menu-level="root" onClick={() => runAction(onRefreshAppData)} role="menuitem" type="button">
            <RefreshCw aria-hidden="true" size={17} />
            <span>Refresh app data</span>
          </button>
          <div
            className={`settings-context-submenu-anchor${appearanceDisabled ? " is-disabled" : ""}`}
            onMouseEnter={() => {
              if (!appearanceDisabled) {
                setAppearanceOpen(true);
                setProfileOpen(false);
              }
            }}
            onMouseLeave={() => setAppearanceOpen(false)}
          >
            <button
              aria-expanded={showAppearanceMenu}
              aria-haspopup="menu"
              data-menu-action="appearance"
              data-menu-level="root"
              disabled={appearanceDisabled}
              onClick={() => {
                if (!appearanceDisabled) {
                  setAppearanceOpen(true);
                  setProfileOpen(false);
                }
              }}
              role="menuitem"
              title={appearanceDisabled
                ? "Theme choices are unavailable while a background image is active."
                : "Choose the application theme"}
              type="button"
            >
              <Palette aria-hidden="true" size={17} />
              <span>Appearance</span>
              <small>{appearanceDisabled
                ? "Background active"
                : currentTheme === "system" ? "System" : currentTheme === "dark" ? "Dark" : "Light"}</small>
              <ChevronRight aria-hidden="true" className="settings-context-chevron" size={15} />
            </button>
            {showAppearanceMenu && (
              <div
                aria-label="Appearance"
                className="settings-context-submenu"
                onKeyDown={handleThemeMenuKeyDown}
                role="menu"
              >
                {THEME_OPTIONS.map(({ id, label, graphic }) => (
                  <button
                    aria-checked={currentTheme === id}
                    data-menu-level="theme"
                    key={id}
                    onClick={() => runAction(() => onAppearanceChange?.(id))}
                    role="menuitemradio"
                    type="button"
                  >
                    {graphic}
                    <span>{label}</span>
                    {currentTheme === id && <Check aria-hidden="true" className="settings-context-check" size={15} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button data-menu-level="root" onClick={() => runAction(onCheckForUpdates)} role="menuitem" type="button">
            <Download aria-hidden="true" size={17} />
            <span>Check for updates</span>
          </button>

          <div aria-hidden="true" className="settings-context-separator" />

          <button data-menu-level="root" onClick={() => runAction(onLockApp)} role="menuitem" type="button">
            <LockKeyhole aria-hidden="true" size={17} />
            <span>Lock app</span>
          </button>
          <div
            className="settings-context-submenu-anchor"
            onMouseEnter={() => {
              if (!profileBusy) {
                setAppearanceOpen(false);
                setProfileOpen(true);
              }
            }}
            onMouseLeave={() => {
              if (!switchingProfileId) setProfileOpen(false);
            }}
          >
            <button
              aria-expanded={showProfileMenu}
              aria-haspopup="menu"
              data-menu-action="profile"
              data-menu-level="root"
              disabled={profileBusy}
              onClick={() => {
                setAppearanceOpen(false);
                setProfileOpen(true);
              }}
              role="menuitem"
              type="button"
            >
              <UserRoundCog aria-hidden="true" size={17} />
              <span>Switch academic profile</span>
              <ChevronRight aria-hidden="true" className="settings-context-chevron" size={15} />
            </button>
            {showProfileMenu && (
              <div
                aria-label="Choose academic profile"
                className="settings-context-submenu settings-context-profile-submenu"
                onKeyDown={handleProfileMenuKeyDown}
                role="menu"
              >
                <div className="settings-context-profile-heading" role="presentation">Academic profiles</div>
                {academicProfiles.map((profile) => {
                  const isActive = profile.id === activeAcademicProfileId;
                  return (
                    <button
                      aria-checked={isActive}
                      data-menu-level="profile"
                      disabled={profileBusy || Boolean(profile.deletionPending)}
                      key={profile.id}
                      onClick={() => void chooseProfile(profile)}
                      role="menuitemradio"
                      title={profile.deletionPending ? "This profile is being deleted." : undefined}
                      type="button"
                    >
                      <UserRoundCog aria-hidden="true" size={17} />
                      <span className="settings-context-profile-text">
                        <strong>{profile.displayName}</strong>
                        <small>{isActive ? "Current profile" : profile.label}</small>
                      </span>
                      {isActive && <Check aria-hidden="true" className="settings-context-check" size={15} />}
                      {switchingProfileId === profile.id && <span className="settings-context-profile-pending">Switching…</span>}
                    </button>
                  );
                })}
                {academicProfiles.length < 2 && (
                  <p className="settings-context-profile-note">Only one profile is available.</p>
                )}
                {profileError && <p className="settings-context-profile-error" role="alert">{profileError}</p>}
              </div>
            )}
          </div>
          <button data-menu-level="root" onClick={() => runAction(onRestartVoiceAssistant)} role="menuitem" type="button">
            <Mic2 aria-hidden="true" size={17} />
            <span>Restart voice assistant</span>
          </button>
          <button data-menu-level="root" onClick={() => runAction(onOpenAlertHistory)} role="menuitem" type="button">
            <History aria-hidden="true" size={17} />
            <span>View alert history</span>
            <BellRing aria-hidden="true" className="settings-context-trailing-icon" size={14} />
          </button>

          <div aria-hidden="true" className="settings-context-separator" />

          <button
            className="settings-context-danger"
            data-menu-level="root"
            onClick={() => runAction(onLogout)}
            role="menuitem"
            type="button"
          >
            <LogOut aria-hidden="true" size={17} />
            <span>Log out</span>
          </button>
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      <NavLink
        aria-label="Settings. Right-click for quick actions."
        aria-haspopup="menu"
        aria-expanded={Boolean(menuPosition)}
        className={({ isActive }) => isActive ? "settings-icon-btn active" : "settings-icon-btn"}
        onContextMenu={openMenu}
        onKeyDown={(event) => {
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            openMenu(event);
          }
        }}
        ref={triggerRef}
        title="Settings (right-click for quick actions)"
        to="/settings"
      >
        <Settings aria-hidden="true" size={18} />
      </NavLink>
      {menu}
    </>
  );
}
