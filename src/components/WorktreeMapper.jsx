import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { 
  Maximize2, 
  Minimize2, 
  Plus, 
  Minus,
  Save, 
  Trash2, 
  Lock, 
  Unlock, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Edit2, 
  X, 
  Check, 
  Download, 
  PlusCircle, 
  Folder,
  AlertTriangle,
  Search
} from "lucide-react";
import confetti from "canvas-confetti";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import apiClient from "../utils/apiClient";
import { toast, ToastContainer } from "react-toastify";

// Default curated templates
const MOOD_PRESETS = [
  {
    id: "unwind-calm",
    name: "Unwind & Calm Plan",
    description: "Click nodes to mark complete",
    nodes: [
      { id: "root", label: "🧘 Calm Ritual Start", x: 420, y: 40, parentId: null, completed: false, isRoot: true },
      { id: "n1", label: "1. 4 7 8 Breathing", x: 300, y: 160, parentId: "root", completed: false },
      { id: "n2", label: "2. Shoulder Stretch", x: 540, y: 160, parentId: "root", completed: false },
      { id: "n3", label: "3. Warm Hydration", x: 420, y: 280, parentId: "n1", completed: false },
      { id: "n4", label: "🍀 Fully Relaxed!", x: 420, y: 400, parentId: "n3", completed: false }
    ]
  },
  {
    id: "focus-booster",
    name: "Focus Booster Plan",
    description: "Build deep attention channels",
    nodes: [
      { id: "root", label: "⚡ Deep Work Session", x: 420, y: 40, parentId: null, completed: false, isRoot: true },
      { id: "n1", label: "1. Notifications to Zero", x: 300, y: 160, parentId: "root", completed: false },
      { id: "n2", label: "2. 25m Focus Sprint", x: 540, y: 160, parentId: "root", completed: false },
      { id: "n3", label: "3. Quick Stretching", x: 420, y: 280, parentId: "n1", completed: false },
      { id: "n4", label: "🔥 Flow State Achieved!", x: 420, y: 400, parentId: "n3", completed: false }
    ]
  },
  {
    id: "revision-marathon",
    name: "Revision Sprint",
    description: "Structure key concept reviews",
    nodes: [
      { id: "root", label: "📚 Revision Sprint Start", x: 420, y: 40, parentId: null, completed: false, isRoot: true },
      { id: "n1", label: "1. Active Recall Session", x: 300, y: 160, parentId: "root", completed: false },
      { id: "n2", label: "2. Weak Spot Review", x: 540, y: 160, parentId: "root", completed: false },
      { id: "n3", label: "3. Flashcard Drill", x: 420, y: 280, parentId: "n1", completed: false },
      { id: "n4", label: "🎯 Subject Mastered!", x: 420, y: 400, parentId: "n3", completed: false }
    ]
  }
];

function WorktreeMapper() {
  const [activeTab, setActiveTab] = useState("presets"); // "presets" | "builder"
  const [activePresetId, setActivePresetId] = useState("unwind-calm");
  const [nodes, setNodes] = useState(MOOD_PRESETS[0].nodes);
  const [worktreeName, setWorktreeName] = useState("My Worktree Mind Map");
  const [savedWorktrees, setSavedWorktrees] = useState([]);
  const [activeWorktreeId, setActiveWorktreeId] = useState(null);

  // Form states for builder
  const [newNodeLabel, setNewNodeLabel] = useState("");
  const [newNodeParentId, setNewNodeParentId] = useState("");
  const [parentSearch, setParentSearch] = useState("");
  const [parentDropdownOpen, setParentDropdownOpen] = useState(false);

  // Viewport zoom & pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isLocked, setIsLocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isFullscreenRef = useRef(false);

  // Interaction states
  const [draggedNodeId, setDraggedNodeId] = useState(null);
  const [renamingNode, setRenamingNode] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const parentDropdownRef = useRef(null);
  const isDraggingCanvas = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Keep isFullscreenRef in sync for use in event callbacks
  useEffect(() => { isFullscreenRef.current = isFullscreen; }, [isFullscreen]);

  // Toast helper — routes to fullscreen container when in fullscreen mode
  const showToast = useCallback((type, msg, opts = {}) => {
    const options = isFullscreenRef.current
      ? { ...opts, containerId: "worktree-fs-toast" }
      : opts;
    toast[type](msg, options);
  }, []);

  // Close parent dropdown when clicking outside
  useEffect(() => {
    if (!parentDropdownOpen) return undefined;
    const handler = (e) => {
      if (parentDropdownRef.current && !parentDropdownRef.current.contains(e.target)) {
        setParentDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [parentDropdownOpen]);

  // Load saved history
  const loadHistory = async () => {
    try {
      const data = await apiClient.get("/api/worktrees");
      if (data?.worktrees) {
        setSavedWorktrees(data.worktrees);
      }
    } catch (err) {
      console.error("Failed to load saved worktrees", err);
    }
  };

  useEffect(() => {
    loadHistory();
    if (window.innerWidth < 768) {
      setZoom(0.65);
      setPan({ x: -100, y: 15 });
    }
  }, []);

  useEffect(() => {
    if (isFullscreen) {
      document.body.classList.add("worktree-fullscreen-active");
    } else {
      document.body.classList.remove("worktree-fullscreen-active");
    }
    return () => {
      document.body.classList.remove("worktree-fullscreen-active");
    };
  }, [isFullscreen]);

  // Set default parent dropdown value when nodes update
  useEffect(() => {
    if (nodes.length > 0 && !newNodeParentId) {
      setNewNodeParentId(nodes[0].id);
    }
  }, [nodes]);

  // Canvas Pan Handlers
  const handleMouseDown = (e) => {
    if (isLocked) return;
    if (e.target.classList.contains("worktree-canvas-viewport") || e.target.tagName === "svg" || e.target.tagName === "path") {
      e.stopPropagation();
      isDraggingCanvas.current = true;
      dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e) => {
    if (draggedNodeId && !isLocked) {
      e.stopPropagation();
      const rect = canvasRef.current.getBoundingClientRect();
      const x = Math.round((e.clientX - rect.left) / zoom);
      const y = Math.round((e.clientY - rect.top) / zoom);
      setNodes((prev) =>
        prev.map((node) => (node.id === draggedNodeId ? { ...node, x, y } : node))
      );
    } else if (isDraggingCanvas.current) {
      e.stopPropagation();
      setPan({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y
      });
    }
  };

  const handleMouseUp = () => {
    isDraggingCanvas.current = false;
    setDraggedNodeId(null);
  };

  // Touch Handlers for Mobile Devices
  const handleTouchStart = (e) => {
    if (isLocked || e.touches.length === 0) return;
    const touch = e.touches[0];
    if (e.target.classList.contains("worktree-canvas-viewport") || e.target.tagName === "svg" || e.target.tagName === "path") {
      e.stopPropagation();
      isDraggingCanvas.current = true;
      dragStart.current = { x: touch.clientX - pan.x, y: touch.clientY - pan.y };
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 0) return;
    const touch = e.touches[0];

    if (draggedNodeId && !isLocked) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      const rect = canvasRef.current.getBoundingClientRect();
      const x = Math.round((touch.clientX - rect.left) / zoom);
      const y = Math.round((touch.clientY - rect.top) / zoom);
      setNodes((prev) =>
        prev.map((node) => (node.id === draggedNodeId ? { ...node, x, y } : node))
      );
    } else if (isDraggingCanvas.current) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      setPan({
        x: touch.clientX - dragStart.current.x,
        y: touch.clientY - dragStart.current.y
      });
    }
  };

  const handleTouchEnd = () => {
    isDraggingCanvas.current = false;
    setDraggedNodeId(null);
  };

  // Zoom compensation logic to keep map centered
  const handleZoomChange = (factor) => {
    setZoom((prevZoom) => {
      const nextZoom = Math.max(0.4, Math.min(2, prevZoom + factor));
      const centerX = window.innerWidth < 768 ? 200 : 350;
      const centerY = 150;
      setPan((prevPan) => ({
        x: prevPan.x - centerX * (nextZoom - prevZoom),
        y: prevPan.y - centerY * (nextZoom - prevZoom)
      }));
      return nextZoom;
    });
  };

  const handleWheel = (e) => {
    if (isLocked) return;
    e.preventDefault();
    e.stopPropagation();
    const factor = e.deltaY < 0 ? 0.05 : -0.05;
    handleZoomChange(factor);
  };

  // Preset trigger
  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setNodes(preset.nodes);
    setWorktreeName(preset.name);
    setActiveWorktreeId(null);
    if (window.innerWidth < 768) {
      setZoom(0.65);
      setPan({ x: -100, y: 15 });
    } else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  };

  // Add new node in Builder mode
  const handleAddNode = (e) => {
    e.preventDefault();
    if (!newNodeLabel.trim()) {
      showToast("warning", "Please enter a node label");
      return;
    }

    const parent = nodes.find((n) => n.id === newNodeParentId);
    const isMobile = window.innerWidth < 768;
    let x = isMobile ? 140 : 300;
    let y = 100;

    if (parent) {
      const siblings = nodes.filter((n) => n.parentId === parent.id);
      const spread = isMobile ? 120 : 160;
      const offset = (siblings.length - (siblings.length / 2)) * spread;
      x = parent.x + offset;
      y = parent.y + 120;
    }

    const newNode = {
      id: `node_${Date.now()}`,
      label: newNodeLabel.trim(),
      x,
      y,
      parentId: parent ? parent.id : null,
      completed: false
    };

    setNodes((prev) => [...prev, newNode]);
    setNewNodeLabel("");
    showToast("success", `Node "${newNode.label}" added!`);
  };

  // Toggle completion & confetti trigger on final leaf node
  const handleToggleNodeCompleted = (nodeId) => {
    setNodes((prev) => {
      const updated = prev.map((n) => {
        if (n.id === nodeId) {
          const nextCompleted = !n.completed;
          if (nextCompleted) {
            // Trigger quick confetti
            confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
          }
          return { ...n, completed: nextCompleted };
        }
        return n;
      });
      return updated;
    });
  };

  // Rename node modal triggers
  const handleStartRename = (node) => {
    setRenamingNode(node);
    setEditingText(node.label);
  };

  const handleSaveRename = () => {
    if (renamingNode && editingText.trim()) {
      setNodes((prev) =>
        prev.map((n) => (n.id === renamingNode.id ? { ...n, label: editingText.trim() } : n))
      );
    }
    setRenamingNode(null);
  };

  // Delete node from custom list
  const handleDeleteNode = (nodeId) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (node?.isRoot) {
      toast.error("Cannot delete root node");
      return;
    }
    // Set child nodes parent references to this node's parent to avoid orphan subtrees
    const parentId = node?.parentId || null;
    setNodes((prev) =>
      prev
        .filter((n) => n.id !== nodeId)
        .map((n) => (n.parentId === nodeId ? { ...n, parentId } : n))
    );
  };

  // Create clean slate Custom map
  const handleCreateNew = () => {
    const isMobile = window.innerWidth < 768;
    setNodes([
      { id: "root", label: "🎯 Custom Mind Map", x: isMobile ? 200 : 420, y: 50, parentId: null, completed: false, isRoot: true }
    ]);
    setWorktreeName("New Custom Mind Map");
    setActiveWorktreeId(null);
    if (isMobile) {
      setZoom(0.65);
      setPan({ x: -50, y: 15 });
    } else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
    showToast("info", "Created new custom plan");
  };

  // Save/Update Worktree in database
  const handleSaveWorktree = async () => {
    if (!worktreeName.trim()) {
      showToast("warning", "Please specify a name for the Mind Map");
      return;
    }

    try {
      if (activeWorktreeId) {
        await apiClient.put(`/api/worktrees/${activeWorktreeId}`, {
          name: worktreeName.trim(),
          nodes
        });
        showToast("success", "Mind Map updated successfully!");
      } else {
        const res = await apiClient.post("/api/worktrees", {
          name: worktreeName.trim(),
          nodes
        });
        if (res?.id) {
          setActiveWorktreeId(res.id);
          showToast("success", "Mind Map saved successfully!");
        }
      }
      loadHistory();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save mind map";
      showToast("error", msg);
      console.error("Save worktree error:", err);
    }
  };

  // Load from history
  const handleLoadWorktree = (wt) => {
    setNodes(wt.nodes);
    setWorktreeName(wt.name);
    setActiveWorktreeId(wt.id);
    setActiveTab("builder");
    if (window.innerWidth < 768) {
      setZoom(0.65);
      setPan({ x: -100, y: 15 });
    } else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
    showToast("success", `Loaded "${wt.name}"`);
  };

  // Delete from history list
  const handleDeleteHistory = async (e, wtId) => {
    e.stopPropagation();
    setDeleteConfirmId(wtId);
  };

  const confirmDeleteHistory = async () => {
    const wtId = deleteConfirmId;
    setDeleteConfirmId(null);
    try {
      await apiClient.delete(`/api/worktrees/${wtId}`);
      showToast("success", "Mind Map deleted");
      if (activeWorktreeId === wtId) {
        setActiveWorktreeId(null);
      }
      loadHistory();
    } catch (err) {
      showToast("error", "Failed to delete records");
      console.error(err);
    }
  };

  // Reset Zoom & Pan
  const handleResetViewport = () => {
    if (window.innerWidth < 768) {
      setZoom(0.65);
      setPan({ x: -100, y: 15 });
    } else {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  };

  // Export mind map as PDF
  const handleExportPDF = async () => {
    const viewportEl = canvasRef.current;
    if (!viewportEl) return;
    showToast("info", "Preparing PDF download...");

    try {
      const padding = 80;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodes.forEach((n) => {
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.x > maxX) maxX = n.x;
        if (n.y > maxY) maxY = n.y;
      });
      const treeWidth = maxX - minX + 250 + padding * 2;
      const treeHeight = maxY - minY + 80 + padding * 2;

      const origZoom = zoom;
      const origPan = pan;
      const origStyle = viewportEl.parentElement.style.cssText;

      setZoom(1);
      setPan({ x: -minX + padding, y: -minY + padding });

      viewportEl.parentElement.style.width = `${treeWidth}px`;
      viewportEl.parentElement.style.height = `${treeHeight}px`;
      viewportEl.parentElement.style.overflow = "visible";

      await new Promise((resolve) => setTimeout(resolve, 400));

      const canvas = await html2canvas(viewportEl.parentElement, {
        useCORS: true,
        backgroundColor: getComputedStyle(viewportEl.parentElement).backgroundColor || "#0b0f19",
        scale: 2,
        width: treeWidth,
        height: treeHeight,
      });

      viewportEl.parentElement.style.cssText = origStyle;
      setZoom(origZoom);
      setPan(origPan);

      const imgData = canvas.toDataURL("image/png");
      const isLandscape = treeWidth > treeHeight;
      const pdf = new jsPDF(isLandscape ? "l" : "p", "mm", "a4");
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      
      const ratio = Math.min(pageW / treeWidth, pageH / treeHeight);
      const imgW = treeWidth * ratio;
      const imgH = treeHeight * ratio;
      const offsetX = (pageW - imgW) / 2;
      const offsetY = (pageH - imgH) / 2;

      pdf.addImage(imgData, "PNG", offsetX, offsetY, imgW, imgH);
      pdf.save(`${worktreeName.replace(/\s+/g, "_")}.pdf`);
      showToast("success", "PDF exported successfully!");
    } catch (err) {
      showToast("error", "Failed to export PDF");
      console.error(err);
    }
  };

  const renderContent = () => (
    <div className={`worktree-container card ${isFullscreen ? "fullscreen-modal-mode" : ""}`} onWheel={(e) => { if (isFullscreen) e.stopPropagation(); }}>
      {/* Scoped toast container for fullscreen mode */}
      {isFullscreen && (
        <ToastContainer
          containerId="worktree-fs-toast"
          position="top-center"
          autoClose={2200}
          closeOnClick
          draggable={false}
          limit={3}
          newestOnTop
          pauseOnFocusLoss={false}
          toastClassName="prepmatrix-toast"
          style={{ zIndex: 99999, position: "absolute", top: "18px", left: "calc(50% - 150px)", transform: "translateX(-50%)", width: "min(400px, calc(100vw - 48px))" }}
        />
      )}
      {/* Header bar */}
      <div className="worktree-header">
        <div className="worktree-title-block">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Folder size={18} className="theme-accent-color" />
            <input 
              className="worktree-name-input"
              value={worktreeName}
              onChange={(e) => setWorktreeName(e.target.value)}
              placeholder="Name your mind map..."
              aria-label="Mind Map Name"
            />
          </div>
          <span className="worktree-subtitle">Double-click nodes to rename • Drag to arrange</span>
        </div>

        {/* Tab triggers & action buttons */}
        <div className="worktree-controls">
          <div className="tab-pill-group">
            <button 
              className={activeTab === "presets" ? "tab-pill active" : "tab-pill"}
              onClick={() => setActiveTab("presets")}
            >
              Mood Presets
            </button>
            <button 
              className={activeTab === "builder" ? "tab-pill active" : "tab-pill"}
              onClick={() => setActiveTab("builder")}
            >
              Custom Builder
            </button>
          </div>

          <button className="secondary-btn worktree-icon-btn" onClick={() => setShowResetConfirm(true)} title="Reset zoom/pan">
            <RotateCcw size={16} />
          </button>
          
          <button className="secondary-btn worktree-icon-btn" onClick={handleExportPDF} title="Export as PDF">
            <Download size={16} />
            <span>Export</span>
          </button>

          <button className="secondary-btn worktree-icon-btn" onClick={() => setIsFullscreen(!isFullscreen)}>
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* Editor Panel for Custom Builder */}
      {activeTab === "builder" && (
        <div className="builder-controls-panel">
          <form className="builder-form" onSubmit={handleAddNode}>
            <div className="field-stack">
              <span>Node Label</span>
              <input 
                type="text" 
                value={newNodeLabel} 
                onChange={(e) => setNewNodeLabel(e.target.value)}
                placeholder="e.g. Learn React Hooks, Write unit tests..."
              />
            </div>
            <div className="field-stack" style={{ position: "relative" }} ref={parentDropdownRef}>
              <span>Link From (Parent)</span>
                <input
                  type="text"
                  className={`worktree-parent-search-input${newNodeParentId && !parentSearch ? " has-selection" : ""}`}
                  placeholder="Search parent node..."
                  value={
                    // When a node is selected and user hasn't started typing, show its name
                    newNodeParentId && !parentSearch
                      ? (nodes.find(n => n.id === newNodeParentId)?.label || "")
                      : parentSearch
                  }
                  onChange={(e) => {
                    setParentSearch(e.target.value);
                    // If user starts typing, clear the selection display
                    if (newNodeParentId) setNewNodeParentId("");
                    setParentDropdownOpen(true);
                  }}
                  onFocus={() => {
                    // On focus, if a node is selected, clear the display so user can search fresh
                    if (newNodeParentId) {
                      setParentSearch("");
                    }
                    setParentDropdownOpen(true);
                  }}
                  onBlur={() => {
                    // On blur, restore the selected node name if nothing new was typed
                    if (!parentSearch) setParentDropdownOpen(false);
                  }}
                />
              {parentDropdownOpen && (
                <div className="worktree-parent-dropdown">
                  {nodes
                    .filter(n => n.label.toLowerCase().includes(parentSearch.toLowerCase()))
                    .map(node => (
                      <div
                        key={node.id}
                        className={`parent-dropdown-item${newNodeParentId === node.id ? " selected" : ""}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setNewNodeParentId(node.id);
                          setParentSearch("");
                          setParentDropdownOpen(false);
                        }}
                      >
                        <span className="parent-item-label">{node.label}</span>
                        {node.isRoot && <span className="parent-item-badge">root</span>}
                      </div>
                    ))
                  }
                  {nodes.filter(n => n.label.toLowerCase().includes(parentSearch.toLowerCase())).length === 0 && (
                    <div className="parent-dropdown-empty">No nodes match</div>
                  )}
                </div>
              )}
            </div>
            
            <div className="builder-btn-group">
              <button className="action-btn" type="submit">
                <PlusCircle size={16} />
                <span className="btn-text">Add Node</span>
              </button>
              
              <button className="secondary-btn" onClick={handleSaveWorktree} type="button">
                <Save size={16} />
                <span className="btn-text">Save Plan</span>
              </button>

              <button className="secondary-btn" onClick={handleCreateNew} type="button">
                <Plus size={16} />
                <span className="btn-text">New Slate</span>
              </button>
            </div>
          </form>

          {/* Inline list of nodes for deletion/editing */}
          <div className="builder-nodes-badges">
            {nodes.map((node) => (
              <span className={`node-badge ${node.completed ? "completed" : ""}`} key={node.id}>
                <span 
                  className="badge-check"
                  onClick={() => handleToggleNodeCompleted(node.id)}
                  title="Toggle Complete"
                >
                  {node.completed ? "✓" : "○"}
                </span>
                
                <span className="badge-label" onDoubleClick={() => handleStartRename(node)}>
                  {node.label}
                </span>

                <button 
                  className="badge-action-btn edit"
                  onClick={(e) => { e.stopPropagation(); handleStartRename(node); }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  title="Rename"
                >
                  <Edit2 size={11} />
                </button>
                {!node.isRoot && (
                  <button 
                    className="badge-action-btn delete"
                    onClick={() => handleDeleteNode(node.id)}
                    title="Delete Node"
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Preset selector bar in Presets tab */}
      {activeTab === "presets" && (
        <div className="presets-select-bar">
          {MOOD_PRESETS.map((preset) => (
            <button 
              key={preset.id}
              className={`preset-selector-card ${activePresetId === preset.id ? "active" : ""}`}
              onClick={() => handleSelectPreset(preset)}
            >
              <strong>{preset.name}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Canvas Viewport */}
      <div 
        ref={containerRef}
        className="worktree-canvas-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {/* Canvas background grid */}
        <div className="canvas-grid-overlay" />

        {/* Viewport controls (absolute-positioned) */}
        <div className="canvas-zoom-controls">
          <button className="control-btn" onClick={() => handleZoomChange(0.1)} title="Zoom In">
            <Plus size={14} />
          </button>
          <button className="control-btn" onClick={() => handleZoomChange(-0.1)} title="Zoom Out">
            <Minus size={14} />
          </button>
          <button className="control-btn" onClick={() => setIsLocked(!isLocked)} title={isLocked ? "Unlock Viewport" : "Lock Viewport"}>
            {isLocked ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
        </div>

        {/* Dynamic Zoom & Pan Transform Canvas */}
        <div 
          ref={canvasRef}
          className="worktree-canvas-viewport"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            width: "2000px",
            height: "2000px",
            position: "absolute",
            top: 0,
            left: 0
          }}
        >
          {/* SVG Connector lines */}
          <svg 
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              zIndex: 1
            }}
          >
            {/* SVG Markers for connector arrows */}
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="28" // Adjust to sit just outside node card border
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(var(--accent-rgb), 0.75)" />
              </marker>
              <marker
                id="arrow-completed"
                viewBox="0 0 10 10"
                refX="28"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
              </marker>
            </defs>

            {nodes.map((node) => {
              if (!node.parentId) return null;
              const parent = nodes.find((n) => n.id === node.parentId);
              if (!parent) return null;

              // Node dimensions center calculation (approx node pill width is 180px, height is 44px)
              const startX = parent.x + 90;
              const startY = parent.y + 22;
              const endX = node.x + 90;
              const endY = node.y + 22;

              // Bezier control coordinates for curved flow lines
              const controlY1 = startY + 50;
              const controlY2 = endY - 50;

              const isCompletedEdge = parent.completed && node.completed;

              return (
                <path
                  key={`edge-${node.id}`}
                  d={`M ${startX} ${startY} C ${startX} ${controlY1}, ${endX} ${controlY2}, ${endX} ${endY}`}
                  stroke={isCompletedEdge ? "#10b981" : "rgba(var(--accent-rgb), 0.28)"}
                  strokeWidth="2"
                  strokeDasharray={isCompletedEdge ? "0" : "4 3"}
                  fill="none"
                  markerEnd={isCompletedEdge ? "url(#arrow-completed)" : "url(#arrow)"}
                />
              );
            })}
          </svg>

          {/* Active Nodes Cards */}
          {nodes.map((node) => {
            const isCompleted = node.completed;
            const isRoot = node.isRoot;

            return (
              <div
                key={node.id}
                className={`worktree-node ${isRoot ? "root-node" : ""} ${isCompleted ? "completed" : ""}`}
                style={{
                  left: `${node.x}px`,
                  top: `${node.y}px`
                }}
                onMouseDown={(e) => {
                  if (isLocked) return;
                  // If double clicking, do rename rather than drag trigger
                  if (e.detail === 2) {
                    handleStartRename(node);
                    return;
                  }
                  e.stopPropagation();
                  setDraggedNodeId(node.id);
                }}
                onTouchStart={(e) => {
                  if (isLocked) return;
                  e.stopPropagation();
                  setDraggedNodeId(node.id);
                }}
                onClick={() => handleToggleNodeCompleted(node.id)}
                title="Click to complete • Double-click to rename • Drag to move"
              >
                {node.completed && <Check size={14} className="node-check-icon" />}
                
                <span>{node.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* History scroll list */}
      {savedWorktrees.length > 0 && (
        <div className="saved-history-section">
          <h4>Saved history</h4>
          <div className="saved-history-scroll">
            {savedWorktrees.map((wt) => (
              <div 
                key={wt.id} 
                className={`history-card ${activeWorktreeId === wt.id ? "active" : ""}`}
                onClick={() => handleLoadWorktree(wt)}
              >
                <div className="history-card-header">
                  <strong>{wt.name}</strong>
                  <button 
                    className="delete-history-btn" 
                    onClick={(e) => handleDeleteHistory(e, wt.id)}
                    title="Delete Mind Map"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <span>{wt.nodes.length} nodes</span>
                <span className="date-stamp">
                  Modified: {new Date(wt.updatedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirmId && createPortal(
        <div 
          className="confirm-modal-backdrop" 
          onClick={() => setDeleteConfirmId(null)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(10, 15, 28, 0.75)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            zIndex: 999999,
            display: "grid",
            placeItems: "center",
            animation: "none"
          }}
        >
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-modal-icon warning" aria-hidden="true">
              <AlertTriangle size={22} strokeWidth={2.5} />
            </div>
            <div className="confirm-modal-copy">
              <span className="section-tag">Confirm</span>
              <h2>Delete Mind Map?</h2>
              <p>This will permanently remove this saved mind map from your history. This action cannot be undone.</p>
            </div>
            <div className="confirm-modal-actions">
              <button className="secondary-btn" onClick={() => setDeleteConfirmId(null)} type="button">
                Cancel
              </button>
              <button className="confirm-danger-btn" onClick={confirmDeleteHistory} type="button">
                Delete
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}

      {/* Rename confirmation modal */}
      {renamingNode && createPortal(
        <div 
          className="confirm-modal-backdrop" 
          onClick={() => setRenamingNode(null)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(10, 15, 28, 0.75)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            zIndex: 999999,
            display: "grid",
            placeItems: "center",
            animation: "none"
          }}
        >
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(360px, 90vw)" }}
          >
            <div className="confirm-modal-icon warning" aria-hidden="true" style={{ background: "rgba(var(--accent-rgb), 0.15)", color: "var(--accent)" }}>
              <Edit2 size={20} />
            </div>
            <div className="confirm-modal-copy">
              <span className="section-tag">Rename</span>
              <h2>Rename Node</h2>
              <div style={{ marginTop: "12px" }}>
                <input
                  autoFocus
                  type="text"
                  className="text-input"
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveRename()}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "8px 12px",
                    background: "var(--surface-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    color: "var(--text)"
                  }}
                />
              </div>
            </div>
            <div className="confirm-modal-actions" style={{ marginTop: "8px" }}>
              <button className="secondary-btn" onClick={() => setRenamingNode(null)} type="button">
                Cancel
              </button>
              <button className="action-btn" onClick={handleSaveRename} type="button">
                Save
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}

      {/* Reset viewport confirmation modal */}
      {showResetConfirm && createPortal(
        <div 
          className="confirm-modal-backdrop" 
          onClick={() => setShowResetConfirm(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(10, 15, 28, 0.75)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            zIndex: 999999,
            display: "grid",
            placeItems: "center",
            animation: "none"
          }}
        >
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(360px, 90vw)" }}
          >
            <div className="confirm-modal-icon warning" aria-hidden="true" style={{ background: "rgba(var(--accent-rgb), 0.15)", color: "var(--accent)" }}>
              <RotateCcw size={20} />
            </div>
            <div className="confirm-modal-copy">
              <span className="section-tag">Reset</span>
              <h2>Reset Plan View?</h2>
              <p>This will reset the canvas zoom and pan position to their default centered coordinates.</p>
            </div>
            <div className="confirm-modal-actions" style={{ marginTop: "8px" }}>
              <button className="secondary-btn" onClick={() => setShowResetConfirm(false)} type="button">
                Cancel
              </button>
              <button className="action-btn reset-view-confirm-btn" onClick={() => { handleResetViewport(); setShowResetConfirm(false); }} type="button">
                Reset
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}
    </div>
  );

  return isFullscreen ? createPortal(renderContent(), document.body) : renderContent();
}

export default WorktreeMapper;
