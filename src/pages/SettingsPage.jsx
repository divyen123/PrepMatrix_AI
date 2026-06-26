import { useState, useEffect, useRef } from "react";
import { Save, Shield, Palette, User, Check, Settings2, Target, Download, Upload, Trash2, Volume2, Mic, Image as ImageIcon } from "lucide-react";
import api from "../utils/apiClient";
import BACKGROUND_PRESETS from "../utils/backgroundPresets";
import { toast } from "react-toastify";

const COLOR_PRESETS = [
  { name: "Teal (Default)", light: "7, 143, 120", dark: "36, 199, 177" },
  { name: "Blue", light: "29, 78, 216", dark: "59, 130, 246" },
  { name: "Greyish White", light: "100, 116, 139", dark: "226, 232, 240" },
  { name: "Indigo", light: "67, 56, 202", dark: "99, 102, 241" },
  { name: "Orange", light: "194, 65, 12", dark: "249, 115, 22" },
  { name: "Rose", light: "190, 24, 74", dark: "244, 63, 94" },
];

// Helper to convert hex to rgb string: "#0d9488" -> "13, 148, 136"
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : null;
}

function ToggleSwitch({ checked, onChange, label, subtitle }) {
  return (
    <div className="toggle-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <strong style={{ fontSize: '0.95rem' }}>{label}</strong>
        {subtitle && <p className="card-subtext" style={{ margin: '4px 0 0', fontSize: '0.82rem' }}>{subtitle}</p>}
      </div>
      <label className="toggle-switch-label" style={{ position: 'relative', display: 'inline-block', width: '48px', height: '26px', cursor: 'pointer' }}>
        <input type="checkbox" checked={checked} onChange={onChange} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
        <span style={{
          position: 'absolute', inset: 0, borderRadius: '999px',
          background: checked ? 'rgba(var(--accent-rgb), 0.6)' : 'var(--surface-muted)',
          border: `1px solid ${checked ? 'rgba(var(--accent-rgb), 0.4)' : 'var(--border)'}`,
          transition: 'all 0.25s ease'
        }}>
          <span style={{
            position: 'absolute', top: '3px', left: checked ? '24px' : '3px',
            width: '18px', height: '18px', borderRadius: '50%',
            background: checked ? 'var(--accent)' : 'var(--text-muted)',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
          }} />
        </span>
      </label>
    </div>
  );
}

function SettingsPage({
  userProfile, setUserProfile, setAcademicLevel, setAcademicTrack,
  darkMode, setDarkMode, subjects, schedule, completed, materialBookmarks,
  academicLevel, academicTrack, setSubjects, setSchedule, setCompleted,
  setMaterialBookmarks, setNotification, onAccountDeleted
}) {
  // Account settings state
  const [username, setUsername] = useState(userProfile?.username || "");
  const [age, setAge] = useState(userProfile?.age || "");
  const [schoolType, setSchoolType] = useState(userProfile?.schoolType || "college");
  const [institutionName, setInstitutionName] = useState(userProfile?.institutionName || "");
  const [grade, setGrade] = useState(userProfile?.grade || "");
  const [degree, setDegree] = useState(userProfile?.degree || "");
  const [savingProfile, setSavingProfile] = useState(false);

  // Security state
  const [email, setEmail] = useState(userProfile?.email || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // System Preferences state
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const stored = localStorage.getItem("prepmatrix_sound_enabled");
    return stored === null ? true : stored === "true";
  });
  const [voiceReplies, setVoiceReplies] = useState(() => {
    const stored = localStorage.getItem("prepmatrix_voice_replies");
    return stored === null ? true : stored === "true";
  });

  // Study Target Goals state
  const [dailyTarget, setDailyTarget] = useState(() => {
    return parseFloat(localStorage.getItem("prepmatrix_daily_target") || "4");
  });
  const [weeklyReview, setWeeklyReview] = useState(() => {
    return localStorage.getItem("prepmatrix_weekly_review") || "2";
  });

  // Data Management state
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Appearance state
  const [fontSize, setFontSize] = useState(
    localStorage.getItem("prepmatrix_font_size") || "medium"
  );
  const [cardSize, setCardSize] = useState(
    localStorage.getItem("prepmatrix_card_size") || "cozy"
  );

  // Background presets and custom state
  const [bgLight, setBgLight] = useState(
    localStorage.getItem("prepmatrix_bg_light") || "#e2e8f0"
  );
  const [bgDark, setBgDark] = useState(
    localStorage.getItem("prepmatrix_bg_dark") || "#1e293b"
  );

  // Glassy toggles state
  const [glassyCards, setGlassyCards] = useState(() => {
    const stored = localStorage.getItem("prepmatrix_glassy_panels");
    return stored === null ? true : stored === "true";
  });
  const [glassyButtons, setGlassyButtons] = useState(() => {
    const stored = localStorage.getItem("prepmatrix_glassy_buttons");
    return stored === null ? true : stored === "true";
  });

  // Font family and weight style configurations
  const [fontFamilyStyle, setFontFamilyStyle] = useState(
    localStorage.getItem("prepmatrix_font_style") || "sans"
  );
  const [fontWeightStyle, setFontWeightStyle] = useState(
    localStorage.getItem("prepmatrix_font_weight") || "regular"
  );
  const [bgImageId, setBgImageId] = useState(
    localStorage.getItem("prepmatrix_bg_image_id") || ""
  );
  const [bgOverlayOpacity, setBgOverlayOpacity] = useState(
    parseFloat(localStorage.getItem("prepmatrix_bg_overlay_opacity") || "0.55")
  );

  // Color Palette state
  const [customColorLight, setCustomColorLight] = useState("#078f78");
  const [customColorDark, setCustomColorDark] = useState("#24c7b1");
  const [accentRgbLight, setAccentRgbLight] = useState(
    localStorage.getItem("prepmatrix_accent_rgb_light") || "7, 143, 120"
  );
  const [accentRgbDark, setAccentRgbDark] = useState(
    localStorage.getItem("prepmatrix_accent_rgb_dark") || "36, 199, 177"
  );
  const [transparency, setTransparency] = useState(
    parseFloat(localStorage.getItem("prepmatrix_accent_opacity") || "0.16")
  );
  const [contrast, setContrast] = useState(
    parseFloat(localStorage.getItem("prepmatrix_border_opacity") || "0.3")
  );

  const savedRef = useRef(false);
  const deleteConfirmRef = useRef(null);

  // Dynamic Typography Helpers
  const applyFontFamilyVars = (style) => {
    let base = '"Manrope", sans-serif';
    let display = '"Space Grotesk", sans-serif';

    if (style === "clean") {
      base = '"Inter", sans-serif';
      display = '"Outfit", sans-serif';
    } else if (style === "rounded") {
      base = '"Nunito", sans-serif';
      display = '"Quicksand", sans-serif';
    } else if (style === "geometric") {
      base = '"Poppins", sans-serif';
      display = '"Raleway", sans-serif';
    } else if (style === "humanist") {
      base = '"Source Sans 3", sans-serif';
      display = '"DM Sans", sans-serif';
    } else if (style === "editorial") {
      base = '"Plus Jakarta Sans", sans-serif';
      display = '"Raleway", sans-serif';
    } else if (style === "serif") {
      base = '"Lora", serif';
      display = '"Playfair Display", serif';
    } else if (style === "classic") {
      base = '"Merriweather", serif';
      display = '"Crimson Text", serif';
    } else if (style === "mono") {
      base = '"Fira Code", monospace';
      display = '"Space Mono", monospace';
    }

    document.documentElement.style.setProperty("--font-family-base", base);
    document.body.style.setProperty("--font-family-base", base);
    document.documentElement.style.setProperty("--font-family-display", display);
    document.body.style.setProperty("--font-family-display", display);
  };

  const applyFontWeightVars = (weight) => {
    let normal = "400";
    let medium = "500";
    let bold = "600";
    let title = "700";

    if (weight === "light") {
      normal = "300";
      medium = "400";
      bold = "500";
      title = "600";
    } else if (weight === "medium") {
      normal = "500";
      medium = "600";
      bold = "700";
      title = "800";
    } else if (weight === "bold") {
      normal = "600";
      medium = "700";
      bold = "800";
      title = "900";
    }

    document.documentElement.style.setProperty("--font-weight-normal", normal);
    document.body.style.setProperty("--font-weight-normal", normal);
    
    document.documentElement.style.setProperty("--font-weight-medium", medium);
    document.body.style.setProperty("--font-weight-medium", medium);
    
    document.documentElement.style.setProperty("--font-weight-bold", bold);
    document.body.style.setProperty("--font-weight-bold", bold);
    
    document.documentElement.style.setProperty("--font-weight-title", title);
    document.body.style.setProperty("--font-weight-title", title);
  };

  // Store initial settings for reverting if unsaved
  const initialSettings = useRef({
    darkMode: darkMode,
    fontSize: localStorage.getItem("prepmatrix_font_size") || "medium",
    cardSize: localStorage.getItem("prepmatrix_card_size") || "cozy",
    accentRgbLight: localStorage.getItem("prepmatrix_accent_rgb_light") || "7, 143, 120",
    accentRgbDark: localStorage.getItem("prepmatrix_accent_rgb_dark") || "36, 199, 177",
    transparency: localStorage.getItem("prepmatrix_accent_opacity") || "0.16",
    contrast: localStorage.getItem("prepmatrix_border_opacity") || "0.3",
    bgLight: localStorage.getItem("prepmatrix_bg_light") || "#f8fafc",
    bgDark: localStorage.getItem("prepmatrix_bg_dark") || "#090d16",
    glassyCards: localStorage.getItem("prepmatrix_glassy_panels") !== "false",
    glassyButtons: localStorage.getItem("prepmatrix_glassy_buttons") !== "false",
    fontStyle: localStorage.getItem("prepmatrix_font_style") || "sans",
    fontWeight: localStorage.getItem("prepmatrix_font_weight") || "regular",
    bgImageId: localStorage.getItem("prepmatrix_bg_image_id") || "",
    bgOverlayOpacity: parseFloat(localStorage.getItem("prepmatrix_bg_overlay_opacity") || "0.55"),
  });

  // 1. Real-time preview of style options on change
  useEffect(() => {
    const isDark = darkMode;
    document.body.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("dark", isDark);

    const activeRgb = isDark ? accentRgbDark : accentRgbLight;
    document.documentElement.style.setProperty("--accent-rgb", activeRgb);
    document.body.style.setProperty("--accent-rgb", activeRgb);

    document.documentElement.style.setProperty("--accent", `rgb(${activeRgb})`);
    document.body.style.setProperty("--accent", `rgb(${activeRgb})`);

    document.documentElement.style.setProperty("--accent-opacity", transparency.toString());
    document.body.style.setProperty("--accent-opacity", transparency.toString());
    
    document.documentElement.style.setProperty("--border-opacity", contrast.toString());
    document.body.style.setProperty("--border-opacity", contrast.toString());

    document.documentElement.style.setProperty(
      "--base-font-size",
      fontSize === "small" ? "14px" : fontSize === "large" ? "18px" : "16px"
    );
    document.body.style.setProperty(
      "--base-font-size",
      fontSize === "small" ? "14px" : fontSize === "large" ? "18px" : "16px"
    );

    document.documentElement.style.setProperty(
      "--card-padding",
      cardSize === "compact" ? "18px" : cardSize === "spacious" ? "40px" : "30px"
    );
    document.body.style.setProperty(
      "--card-padding",
      cardSize === "compact" ? "18px" : cardSize === "spacious" ? "40px" : "30px"
    );
    
    document.documentElement.style.setProperty(
      "--radius-lg",
      cardSize === "compact" ? "16px" : cardSize === "spacious" ? "32px" : "24px"
    );
    document.body.style.setProperty(
      "--radius-lg",
      cardSize === "compact" ? "16px" : cardSize === "spacious" ? "32px" : "24px"
    );

    // Apply Background colors
    const activeBg = isDark ? bgDark : bgLight;
    document.documentElement.style.setProperty("--bg", activeBg);
    document.body.style.setProperty("--bg", activeBg);
    
    document.documentElement.style.setProperty("--bg-secondary", activeBg);
    document.body.style.setProperty("--bg-secondary", activeBg);

    // Apply Glassy toggles
    document.body.classList.toggle("no-glass-cards", !glassyCards);
    document.body.classList.toggle("no-glass-buttons", !glassyButtons);

    // Apply custom typography options
    applyFontFamilyVars(fontFamilyStyle);
    applyFontWeightVars(fontWeightStyle);

    // Background image live-preview
    if (bgImageId) {
      const imgPreset = BACKGROUND_PRESETS.find(p => p.id === bgImageId);
      if (imgPreset) {
        document.body.classList.add("has-bg-image");
        document.documentElement.style.setProperty("--bg-image", `url(${imgPreset.file})`);
        document.documentElement.style.setProperty("--bg-surface-rgb", imgPreset.surfaceRgb);
        document.documentElement.style.setProperty("--bg-overlay-opacity", bgOverlayOpacity.toString());
        document.documentElement.style.setProperty("--accent-rgb", imgPreset.accentRgb);
        document.body.style.setProperty("--accent-rgb", imgPreset.accentRgb);
        document.documentElement.style.setProperty("--accent", `rgb(${imgPreset.accentRgb})`);
        document.body.style.setProperty("--accent", `rgb(${imgPreset.accentRgb})`);
      }
    } else {
      document.body.classList.remove("has-bg-image");
      document.documentElement.style.removeProperty("--bg-image");
      document.documentElement.style.removeProperty("--bg-surface-rgb");
      document.documentElement.style.removeProperty("--bg-overlay-opacity");
    }

  }, [
    darkMode, accentRgbLight, accentRgbDark, transparency, contrast, fontSize, cardSize,
    bgLight, bgDark, glassyCards, glassyButtons, fontFamilyStyle, fontWeightStyle, bgImageId, bgOverlayOpacity
  ]);

  // 2. Revert styles on unmount if changes were not saved
  useEffect(() => {
    const initialSnapshot = initialSettings.current;

    return () => {
      if (!savedRef.current) {
        const init = initialSnapshot;
        const isDark = init.darkMode;
        setDarkMode(isDark);
        document.body.classList.toggle("dark", isDark);
        document.documentElement.classList.toggle("dark", isDark);

        document.documentElement.style.setProperty(
          "--base-font-size",
          init.fontSize === "small" ? "14px" : init.fontSize === "large" ? "18px" : "16px"
        );
        document.body.style.setProperty(
          "--base-font-size",
          init.fontSize === "small" ? "14px" : init.fontSize === "large" ? "18px" : "16px"
        );

        document.documentElement.style.setProperty(
          "--card-padding",
          init.cardSize === "compact" ? "18px" : init.cardSize === "spacious" ? "40px" : "30px"
        );
        document.body.style.setProperty(
          "--card-padding",
          init.cardSize === "compact" ? "18px" : init.cardSize === "spacious" ? "40px" : "30px"
        );
        
        document.documentElement.style.setProperty(
          "--radius-lg",
          init.cardSize === "compact" ? "16px" : init.cardSize === "spacious" ? "32px" : "24px"
        );
        document.body.style.setProperty(
          "--radius-lg",
          init.cardSize === "compact" ? "16px" : init.cardSize === "spacious" ? "32px" : "24px"
        );
        
        const activeRgb = isDark ? init.accentRgbDark : init.accentRgbLight;
        document.documentElement.style.setProperty("--accent-rgb", activeRgb);
        document.body.style.setProperty("--accent-rgb", activeRgb);
        
        document.documentElement.style.setProperty("--accent", `rgb(${activeRgb})`);
        document.body.style.setProperty("--accent", `rgb(${activeRgb})`);

        document.documentElement.style.setProperty("--accent-opacity", init.transparency);
        document.body.style.setProperty("--accent-opacity", init.transparency);
        
        document.documentElement.style.setProperty("--border-opacity", init.contrast);
        document.body.style.setProperty("--border-opacity", init.contrast);

        // Revert Background colors
        const activeBg = isDark ? init.bgDark : init.bgLight;
        document.documentElement.style.setProperty("--bg", activeBg);
        document.body.style.setProperty("--bg", activeBg);
        document.documentElement.style.setProperty("--bg-secondary", activeBg);
        document.body.style.setProperty("--bg-secondary", activeBg);

        // Revert Glassy toggles
        document.body.classList.toggle("no-glass-cards", !init.glassyCards);
        document.body.classList.toggle("no-glass-buttons", !init.glassyButtons);

        // Revert typography choices
        applyFontFamilyVars(init.fontStyle);
        applyFontWeightVars(init.fontWeight);

        // Revert background image
        if (init.bgImageId) {
          const imgPreset = BACKGROUND_PRESETS.find(p => p.id === init.bgImageId);
          if (imgPreset) {
            document.body.classList.add("has-bg-image");
            document.documentElement.style.setProperty("--bg-image", `url(${imgPreset.file})`);
            document.documentElement.style.setProperty("--bg-surface-rgb", imgPreset.surfaceRgb);
            document.documentElement.style.setProperty("--bg-overlay-opacity", init.bgOverlayOpacity.toString());
            document.documentElement.style.setProperty("--accent-rgb", imgPreset.accentRgb);
            document.body.style.setProperty("--accent-rgb", imgPreset.accentRgb);
            document.documentElement.style.setProperty("--accent", `rgb(${imgPreset.accentRgb})`);
            document.body.style.setProperty("--accent", `rgb(${imgPreset.accentRgb})`);
          }
        } else {
          document.body.classList.remove("has-bg-image");
          document.documentElement.style.removeProperty("--bg-image");
          document.documentElement.style.removeProperty("--bg-surface-rgb");
          document.documentElement.style.removeProperty("--bg-overlay-opacity");
        }
      }
    };
  }, [setDarkMode]);

  // Persist toggle preferences to localStorage
  useEffect(() => {
    localStorage.setItem("prepmatrix_sound_enabled", String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem("prepmatrix_voice_replies", String(voiceReplies));
  }, [voiceReplies]);

  useEffect(() => {
    if (!confirmDeleteAccount) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (deleteConfirmRef.current && !deleteConfirmRef.current.contains(event.target)) {
        setConfirmDeleteAccount(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setConfirmDeleteAccount(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [confirmDeleteAccount]);

  // Save profile & account settings (with loading guard and proper error handling)
  const handleSaveAccount = async () => {
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      const payload = {
        username,
        age: Number(age) || null,
        schoolType,
        institutionName,
        academicLevel: schoolType === "school" ? "School" : "College",
        academicTrack: schoolType === "school" ? "School Board" : "General",
        grade: schoolType === "school" ? grade : "",
        degree: schoolType === "college" ? degree : "",
      };

      const response = await api.updateProfile(payload);
      setUserProfile(response.user);

      // Update parent hooks
      setAcademicLevel(response.user.academicLevel);
      setAcademicTrack(response.user.academicTrack);

      toast.success("Account profile updated successfully!");
    } catch (error) {
      toast.error(error?.message || "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  // Save security settings
  const handleSaveSecurity = async () => {
    try {
      if (password && password !== confirmPassword) {
        toast.error("Passwords do not match.");
        return;
      }

      const payload = { email };
      if (password) {
        payload.password = password;
        payload.confirmPassword = confirmPassword;
      }

      const response = await api.updateProfile(payload);
      setUserProfile(response.user);
      setPassword("");
      setConfirmPassword("");
      toast.success("Security credentials updated successfully!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update security credentials.");
    }
  };

  // Save study target goals
  const handleSaveStudyTargets = () => {
    localStorage.setItem("prepmatrix_daily_target", String(dailyTarget));
    localStorage.setItem("prepmatrix_weekly_review", weeklyReview);
    toast.success("Study target goals saved!");
  };

  // Export backup
  const handleExportBackup = () => {
    const data = {
      subjects,
      schedule,
      completed,
      materialBookmarks,
      academicLevel,
      academicTrack,
      darkMode,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().split("T")[0];
    a.href = url;
    a.download = `prepmatrix-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Backup exported successfully!");
  };

  // Import backup
  const handleImportBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.subjects) setSubjects(data.subjects);
        if (data.schedule) setSchedule(data.schedule);
        if (data.completed) setCompleted(data.completed);
        if (data.materialBookmarks) setMaterialBookmarks(data.materialBookmarks);
        if (data.academicLevel) setAcademicLevel(data.academicLevel);
        if (data.academicTrack) setAcademicTrack(data.academicTrack);
        if (typeof data.darkMode === "boolean") setDarkMode(data.darkMode);
        toast.success("Backup imported and workspace restored!");
      } catch {
        toast.error("Invalid backup file. Please upload a valid JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Reset entire workspace
  const handleResetWorkspace = () => {
    setSubjects([]);
    setSchedule([]);
    setCompleted([]);
    setMaterialBookmarks([]);
    setConfirmReset(false);
    toast.success("Workspace has been reset to defaults.");
  };

  const handleDeleteAccount = async () => {
    if (deletingAccount) return;
    setDeletingAccount(true);

    try {
      await api.deleteAccount();
      setConfirmDeleteAccount(false);
      setSubjects([]);
      setSchedule([]);
      setCompleted([]);
      setMaterialBookmarks([]);
      setNotification?.("Account deleted successfully.");
      onAccountDeleted?.();
      toast.success("Account deleted successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete account.");
    } finally {
      setDeletingAccount(false);
    }
  };

  // Apply appearance styles to DOM
  const applyAppearanceStyles = (theme, font, card, rgbLight, rgbDark, opacity, borderOp, bgL, bgD, glassC, glassB, fontS, fontW, bgImgId, bgOvOpacity) => {
    // 1. Theme
    localStorage.setItem("prepmatrix_default_theme", theme);
    
    // 2. Font Size
    localStorage.setItem("prepmatrix_font_size", font);
    document.documentElement.style.setProperty(
      "--base-font-size",
      font === "small" ? "14px" : font === "large" ? "18px" : "16px"
    );
    document.body.style.setProperty(
      "--base-font-size",
      font === "small" ? "14px" : font === "large" ? "18px" : "16px"
    );

    // 3. Card Size
    localStorage.setItem("prepmatrix_card_size", card);
    document.documentElement.style.setProperty(
      "--card-padding",
      card === "compact" ? "18px" : card === "spacious" ? "40px" : "30px"
    );
    document.body.style.setProperty(
      "--card-padding",
      card === "compact" ? "18px" : card === "spacious" ? "40px" : "30px"
    );
    document.documentElement.style.setProperty(
      "--radius-lg",
      card === "compact" ? "16px" : card === "spacious" ? "32px" : "24px"
    );
    document.body.style.setProperty(
      "--radius-lg",
      card === "compact" ? "16px" : card === "spacious" ? "32px" : "24px"
    );

    // 4. Accent Color
    localStorage.setItem("prepmatrix_accent_rgb_light", rgbLight);
    localStorage.setItem("prepmatrix_accent_rgb_dark", rgbDark);
    
    // Determine active rgb based on body class (dark/light)
    const isDark = document.body.classList.contains("dark");
    const activeRgb = isDark ? rgbDark : rgbLight;
    document.documentElement.style.setProperty("--accent-rgb", activeRgb);
    document.body.style.setProperty("--accent-rgb", activeRgb);
    
    document.documentElement.style.setProperty("--accent", `rgb(${activeRgb})`);
    document.body.style.setProperty("--accent", `rgb(${activeRgb})`);

    // 5. Transparency & Contrast
    localStorage.setItem("prepmatrix_accent_opacity", opacity.toString());
    localStorage.setItem("prepmatrix_border_opacity", borderOp.toString());
    document.documentElement.style.setProperty("--accent-opacity", opacity.toString());
    document.body.style.setProperty("--accent-opacity", opacity.toString());
    document.documentElement.style.setProperty("--border-opacity", borderOp.toString());
    document.body.style.setProperty("--border-opacity", borderOp.toString());

    // 6. Background colors
    localStorage.setItem("prepmatrix_bg_light", bgL);
    localStorage.setItem("prepmatrix_bg_dark", bgD);
    const activeBg = isDark ? bgD : bgL;
    document.documentElement.style.setProperty("--bg", activeBg);
    document.body.style.setProperty("--bg", activeBg);
    document.documentElement.style.setProperty("--bg-secondary", activeBg);
    document.body.style.setProperty("--bg-secondary", activeBg);

    // 7. Glassy states
    localStorage.setItem("prepmatrix_glassy_panels", String(glassC));
    localStorage.setItem("prepmatrix_glassy_buttons", String(glassB));
    document.body.classList.toggle("no-glass-cards", !glassC);
    document.body.classList.toggle("no-glass-buttons", !glassB);

    // 8. Typography choices
    localStorage.setItem("prepmatrix_font_style", fontS);
    localStorage.setItem("prepmatrix_font_weight", fontW);
    applyFontFamilyVars(fontS);
    applyFontWeightVars(fontW);

    // 9. Background Image
    localStorage.setItem("prepmatrix_bg_image_id", bgImgId || "");
    localStorage.setItem("prepmatrix_bg_overlay_opacity", String(bgOvOpacity));
    if (bgImgId) {
      const imgPreset = BACKGROUND_PRESETS.find(p => p.id === bgImgId);
      if (imgPreset) {
        document.body.classList.add("has-bg-image");
        document.documentElement.style.setProperty("--bg-image", `url(${imgPreset.file})`);
        document.documentElement.style.setProperty("--bg-surface-rgb", imgPreset.surfaceRgb);
        document.documentElement.style.setProperty("--bg-overlay-opacity", String(bgOvOpacity));
        document.documentElement.style.setProperty("--accent-rgb", imgPreset.accentRgb);
        document.body.style.setProperty("--accent-rgb", imgPreset.accentRgb);
        document.documentElement.style.setProperty("--accent", `rgb(${imgPreset.accentRgb})`);
        document.body.style.setProperty("--accent", `rgb(${imgPreset.accentRgb})`);
      }
    } else {
      document.body.classList.remove("has-bg-image");
      document.documentElement.style.removeProperty("--bg-image");
      document.documentElement.style.removeProperty("--bg-surface-rgb");
      document.documentElement.style.removeProperty("--bg-overlay-opacity");
    }
  };

  // Save appearance settings
  const handleSaveAppearance = () => {
    savedRef.current = true; // Mark as saved to prevent unmount reversion

    applyAppearanceStyles(
      darkMode ? "dark" : "light",
      fontSize,
      cardSize,
      accentRgbLight,
      accentRgbDark,
      transparency,
      contrast,
      bgLight,
      bgDark,
      glassyCards,
      glassyButtons,
      fontFamilyStyle,
      fontWeightStyle,
      bgImageId,
      bgOverlayOpacity
    );


    toast.success("Appearance configurations applied successfully!");
  };

  const handleSelectPreset = (preset) => {
    setAccentRgbLight(preset.light);
    setAccentRgbDark(preset.dark);
  };

  const handleCustomColorChange = (hex, mode) => {
    const rgb = hexToRgb(hex);
    if (rgb) {
      if (mode === "light") {
        setCustomColorLight(hex);
        setAccentRgbLight(rgb);
      } else {
        setCustomColorDark(hex);
        setAccentRgbDark(rgb);
      }
    }
  };

  return (
    <section className="settings-page route-stage">
      <div className="compact-intro">
        <span className="section-tag" style={{ marginBottom: '12px' }}>PREFERENCES</span>
        <h2>Settings</h2>
        <p className="card-subtext">Manage profile, update password, and customize application appearance.</p>
      </div>

      <div className="dashboard-feature-grid" style={{ marginTop: "24px" }}>
        
        {/* Profile Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <span className="section-tag" style={{ marginBottom: '12px' }}>ACCOUNT</span>
            <h3 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <User size={20} className="status-success" /> Profile & Institution
            </h3>
            <p className="card-subtext">Update your personal details and academic institution properties.</p>
          </div>
          
          <div className="form-grid">
            <label className="field-stack">
              <span>Full Name</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="User name"
              />
            </label>
            <label className="field-stack">
              <span>Age</span>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Age"
              />
            </label>
          </div>

          <div className="form-grid">
            <label className="field-stack">
              <span>Education Level</span>
              <select
                value={schoolType}
                onChange={(e) => setSchoolType(e.target.value)}
              >
                <option value="school">School</option>
                <option value="college">College / University</option>
              </select>
            </label>
            <label className="field-stack">
              <span>Institution Name</span>
              <input
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                placeholder="e.g. Stanford University"
              />
            </label>
          </div>

          <div>
            {schoolType === "school" ? (
              <label className="field-stack">
                <span>Grade / Class</span>
                <input
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  placeholder="e.g. Grade 10, Class A"
                />
              </label>
            ) : (
              <label className="field-stack">
                <span>Degree / Major</span>
                <input
                  value={degree}
                  onChange={(e) => setDegree(e.target.value)}
                  placeholder="e.g. B.S. Computer Science"
                />
              </label>
            )}
          </div>

          <button
            onClick={handleSaveAccount}
            disabled={savingProfile}
            style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: "8px", opacity: savingProfile ? 0.6 : 1 }}
          >
            <Save size={16} /> {savingProfile ? "Saving..." : "Save Profile"}
          </button>
        </div>

        {/* Security Credentials */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <span className="section-tag" style={{ marginBottom: '12px' }}>SECURITY</span>
            <h3 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <Shield size={20} className="status-warning" /> Credentials & Security
            </h3>
            <p className="card-subtext">Update your login email and choose a strong password.</p>
          </div>

          <label className="field-stack">
            <span>Email Address</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </label>

          <div className="form-grid">
            <label className="field-stack">
              <span>New Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
            <label className="field-stack">
              <span>Confirm Password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </label>
          </div>

          <button
            onClick={handleSaveSecurity}
            style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: "8px" }}
          >
            <Save size={16} /> Update Credentials
          </button>
        </div>

        {/* System Preferences & Toggles */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <span className="section-tag" style={{ marginBottom: '12px' }}>SYSTEM</span>
            <h3 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <Settings2 size={20} className="status-success" /> System Preferences & Toggles
            </h3>
            <p className="card-subtext">Configure audio feedback and AI companion voice settings.</p>
          </div>

          <ToggleSwitch
            checked={soundEnabled}
            onChange={() => setSoundEnabled((prev) => !prev)}
            label="Completion Sound Effects"
            subtitle="Play audio chimes when clearing scheduled days or unlocking streaks"
          />

          <ToggleSwitch
            checked={voiceReplies}
            onChange={() => setVoiceReplies((prev) => !prev)}
            label="AI Voice Replies"
            subtitle="Enable spoken feedback from the AI study companion"
          />
        </div>

        {/* Study Target Goals */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <span className="section-tag" style={{ marginBottom: '12px' }}>GOALS</span>
            <h3 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <Target size={20} className="status-success" /> Study Target Goals
            </h3>
            <p className="card-subtext">Set daily study hours and weekly review frequency targets.</p>
          </div>

          <div className="form-grid">
            <label className="field-stack">
              <span>Daily Study Target (hours)</span>
              <input
                type="number"
                min="1"
                max="16"
                step="0.5"
                value={dailyTarget}
                onChange={(e) => setDailyTarget(parseFloat(e.target.value) || 1)}
              />
            </label>
            <label className="field-stack">
              <span>Weekly Review Target</span>
              <select
                value={weeklyReview}
                onChange={(e) => setWeeklyReview(e.target.value)}
              >
                <option value="1">1 review/week</option>
                <option value="2">2 reviews/week</option>
                <option value="3">3 reviews/week</option>
                <option value="daily">Daily reviews</option>
              </select>
            </label>
          </div>

          <button
            onClick={handleSaveStudyTargets}
            style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: "8px" }}
          >
            <Save size={16} /> Save Study Targets
          </button>
        </div>

        {/* Appearance Configuration */}
        <div className="card dashboard-full-span" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <span className="section-tag" style={{ marginBottom: '12px' }}>APPEARANCE</span>
            <h3 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <Palette size={20} className="status-success" /> Custom Color Palette & Layout
            </h3>
            <p className="card-subtext">Change default startup theme, font/card scales, and set color values with transparency & contrast controls.</p>
          </div>

          {/* Background Image Picker */}
          <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "18px" }}>
            <span className="card-subtext" style={{ fontSize: "0.8rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
              <ImageIcon size={14} /> Background Theme
            </span>
            <p className="card-subtext" style={{ marginBottom: "12px", fontSize: "0.82rem" }}>
              Choose an image background or use the color palette theme. Image backgrounds automatically set matching theme colours.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "10px" }}>
              {/* None / Color Palette option */}
              <button
                onClick={() => setBgImageId("")}
                type="button"
                style={{
                  aspectRatio: "16 / 10",
                  border: bgImageId === "" ? "2.5px solid var(--accent)" : "1.5px solid var(--border)",
                  borderRadius: "12px",
                  background: "linear-gradient(135deg, var(--surface), var(--surface-strong))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden",
                  fontSize: "0.78rem",
                  color: "var(--text)",
                  fontWeight: 600,
                  gap: "5px",
                  transition: "all 0.2s ease",
                }}
              >
                <Palette size={15} /> Color Palette
                {bgImageId === "" && <Check size={12} style={{ position: "absolute", top: "5px", right: "5px", color: "var(--accent)" }} />}
              </button>

              {/* Image thumbnails */}
              {BACKGROUND_PRESETS.map((preset) => {
                const isActive = bgImageId === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => setBgImageId(preset.id)}
                    type="button"
                    style={{
                      aspectRatio: "16 / 10",
                      border: isActive ? `2.5px solid rgb(${preset.accentRgb})` : "1.5px solid var(--border)",
                      borderRadius: "12px",
                      backgroundImage: `url(${preset.file})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      cursor: "pointer",
                      position: "relative",
                      overflow: "hidden",
                      padding: 0,
                      transition: "all 0.2s ease",
                      boxShadow: isActive ? `0 0 0 1px rgb(${preset.accentRgb}), 0 4px 12px rgba(${preset.accentRgb}, 0.25)` : "none",
                    }}
                  >
                    <span style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      padding: "16px 8px 5px",
                      background: "linear-gradient(transparent, rgba(0,0,0,0.65))",
                      color: "#fff",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      textAlign: "left",
                      letterSpacing: "0.02em",
                    }}>
                      {preset.name}
                    </span>
                    {isActive && <Check size={13} style={{ position: "absolute", top: "5px", right: "5px", color: "#fff", filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }} />}
                  </button>
                );
              })}
            </div>

            {/* Brightness/Dimness Slider — only visible when an image bg is selected */}
            {bgImageId && (
              <div style={{ marginTop: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)" }}>Background Brightness</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                    {Math.round((1 - bgOverlayOpacity) * 100)}%
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Dim</span>
                  <input
                    type="range"
                    min="0.05"
                    max="0.85"
                    step="0.05"
                    value={bgOverlayOpacity}
                    onChange={(e) => setBgOverlayOpacity(parseFloat(e.target.value))}
                    style={{
                      flex: 1,
                      accentColor: "rgb(var(--accent-rgb))",
                      height: "6px",
                      cursor: "pointer",
                    }}
                  />
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Bright</span>
                </div>
              </div>
            )}
          </div>

          <div className="workspace-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
            
            {/* Left Column: Layout & Typography */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="form-grid">
                <label className="field-stack">
                  <span>Font Scale</span>
                  <select
                    value={fontSize}
                    onChange={(e) => setFontSize(e.target.value)}
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium (Default)</option>
                    <option value="large">Large</option>
                  </select>
                </label>

                <label className="field-stack">
                  <span>Card Scale</span>
                  <select
                    value={cardSize}
                    onChange={(e) => setCardSize(e.target.value)}
                  >
                    <option value="compact">Compact</option>
                    <option value="cozy">Cozy (Default)</option>
                    <option value="spacious">Spacious</option>
                  </select>
                </label>
              </div>

              <div className="form-grid">
                <label className="field-stack">
                  <span>Font Style (Family)</span>
                  <select
                    value={fontFamilyStyle}
                    onChange={(e) => setFontFamilyStyle(e.target.value)}
                  >
                    <option value="sans">Modern Sans (Manrope / Space Grotesk)</option>
                    <option value="clean">Sleek Clean (Inter / Outfit)</option>
                    <option value="rounded">Rounded Friendly (Nunito / Quicksand)</option>
                    <option value="geometric">Geometric Modern (Poppins / Raleway)</option>
                    <option value="humanist">Humanist Neutral (Source Sans 3 / DM Sans)</option>
                    <option value="editorial">Editorial Sharp (Plus Jakarta Sans / Raleway)</option>
                    <option value="serif">Elegant Serif (Lora / Playfair Display)</option>
                    <option value="classic">Classic Serif (Merriweather / Crimson Text)</option>
                    <option value="mono">Tech Mono (Fira Code / Space Mono)</option>
                  </select>
                </label>

                <label className="field-stack">
                  <span>Font Weight Modifier</span>
                  <select
                    value={fontWeightStyle}
                    onChange={(e) => setFontWeightStyle(e.target.value)}
                  >
                    <option value="light">Light</option>
                    <option value="regular">Regular (Default)</option>
                    <option value="medium">Medium</option>
                    <option value="bold">Bold</option>
                  </select>
                </label>
              </div>
            </div>

            {/* Right Column: Customization Presets & Glassmorphism */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "14px" }}>
                <span className="card-subtext" style={{ fontSize: "0.8rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "8px" }}>Glassmorphism Customization</span>
                <ToggleSwitch
                  checked={glassyCards}
                  onChange={() => setGlassyCards((prev) => !prev)}
                  label="Glassy Cards & Panels"
                  subtitle="Apply glass blur and transparency to containers"
                />
              </div>

              <div className="field-stack">
                <span>Preset Accent Color Palette</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginTop: "8px" }}>
                  {COLOR_PRESETS.map((preset) => {
                    const isActive = accentRgbLight === preset.light;
                    return (
                      <button
                        key={preset.name}
                        onClick={() => handleSelectPreset(preset)}
                        type="button"
                        style={{
                          minHeight: "40px",
                          padding: "6px 12px",
                          fontSize: "0.82rem",
                          border: isActive ? "2px solid var(--accent)" : "1px solid var(--border)",
                          background: `rgba(${preset.light}, 0.1)`,
                          color: `rgb(${preset.light})`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                          borderRadius: "8px"
                        }}
                      >
                        {preset.name}
                        {isActive && <Check size={12} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>

          <button
            onClick={handleSaveAppearance}
            style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: "8px" }}
          >
            <Save size={16} /> Save Appearance Settings
          </button>
        </div>

        {/* Data Management & Danger Zone */}
        <div className="card dashboard-full-span" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <span className="section-tag" style={{ marginBottom: '12px' }}>DATA</span>
            <h3 style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <Download size={20} className="status-warning" /> Data Management & Danger Zone
            </h3>
            <p className="card-subtext">Export, import, or reset your study workspace data.</p>
          </div>

          <div className="form-grid">
            <div className="field-stack">
              <span>Export Backup</span>
              <button
                onClick={handleExportBackup}
                style={{ display: "flex", alignItems: "center", gap: "8px", width: "fit-content" }}
              >
                <Download size={16} /> Download Backup (.json)
              </button>
            </div>

            <div className="field-stack">
              <span>Import Backup</span>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", padding: "8px 16px", border: "1px solid var(--border)", borderRadius: "8px", width: "fit-content", fontSize: "0.9rem" }}>
                <Upload size={16} /> Upload Backup File
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportBackup}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
            <div className="field-stack">
              <span style={{ color: "var(--text-muted)" }}>Reset Entire Workspace</span>
              <p className="card-subtext" style={{ marginBottom: "8px" }}>This will clear all subjects, schedules, completed items, and bookmarks. This action cannot be undone.</p>
              {!confirmReset ? (
                <button
                  onClick={() => setConfirmReset(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: "8px", width: "fit-content",
                    background: "rgba(239, 68, 68, 0.1)", color: "#ef4444",
                    border: "1px solid rgba(239, 68, 68, 0.3)"
                  }}
                >
                  <Trash2 size={16} /> Reset Workspace
                </button>
              ) : (
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    onClick={handleResetWorkspace}
                    style={{
                      display: "flex", alignItems: "center", gap: "8px",
                      background: "rgba(239, 68, 68, 0.2)", color: "#ef4444",
                      border: "1px solid rgba(239, 68, 68, 0.5)", fontWeight: 600
                    }}
                  >
                    <Trash2 size={16} /> Confirm Reset
                  </button>
                  <button
                    onClick={() => setConfirmReset(false)}
                    style={{ display: "flex", alignItems: "center", gap: "8px" }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          <div style={{ borderTop: "1px solid rgba(239, 68, 68, 0.24)", paddingTop: "16px" }}>
            <div className="field-stack" style={{ position: "relative" }}>
              <span style={{ color: "var(--danger)", fontWeight: 800 }}>Delete Account</span>
              <p className="card-subtext" style={{ marginBottom: "8px" }}>
                Permanently remove your account and all PrepMatrix data from the database.
              </p>
              <button
                className="confirm-danger-btn"
                onClick={() => setConfirmDeleteAccount(true)}
                style={{ display: "flex", alignItems: "center", gap: "8px", width: "fit-content" }}
                type="button"
              >
                <Trash2 size={16} /> Delete Account
              </button>

              {confirmDeleteAccount && (
                <div
                  className="delete-confirm-popover"
                  ref={deleteConfirmRef}
                  style={{
                    position: "absolute",
                    bottom: "55px",
                    left: "0",
                    width: "320px",
                    padding: "16px",
                    background: "var(--surface)",
                    backdropFilter: "blur(28px)",
                    border: "1px solid rgba(239, 68, 68, 0.45)",
                    borderRadius: "12px",
                    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.15)",
                    zIndex: 10,
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px"
                  }}
                >
                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                    <Trash2 size={18} style={{ color: "#ef4444", marginTop: "2px", flexShrink: 0 }} />
                    <div>
                      <strong style={{ fontSize: "0.95rem", color: "var(--text-strong)", display: "block", marginBottom: "4px" }}>Delete Account?</strong>
                      <p className="card-subtext" style={{ margin: 0, fontSize: "0.82rem", lineHeight: "1.4" }}>
                        This permanently removes all your workspace data, profile, and active sessions. This cannot be undone.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
                    <button
                      className="secondary-btn"
                      disabled={deletingAccount}
                      onClick={() => setConfirmDeleteAccount(false)}
                      style={{ padding: "6px 12px", fontSize: "0.82rem" }}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="confirm-danger-btn"
                      disabled={deletingAccount}
                      onClick={handleDeleteAccount}
                      style={{
                        padding: "6px 12px", fontSize: "0.82rem",
                        background: "rgba(239, 68, 68, 0.15)", color: "#ef4444",
                        border: "1px solid rgba(239, 68, 68, 0.4)", fontWeight: 600
                      }}
                      type="button"
                    >
                      {deletingAccount ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

export default SettingsPage;
