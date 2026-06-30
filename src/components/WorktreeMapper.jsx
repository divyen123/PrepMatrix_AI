import React, { useState, useEffect, useRef } from "react";
import { 
  Maximize2, 
  Minimize2, 
  Plus, 
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
  Folder 
} from "lucide-react";
import confetti from "canvas-confetti";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import apiClient from "../utils/apiClient";
import { toast } from "react-toastify";

// Default curated templates
const MOOD_PRESETS = [
  {
    id: "unwind-calm",
    name: "Unwind & Calm Plan",
    description: "Click nodes to mark complete",
    nodes: [
      { id: "root", label: "🧘 Calm Ritual Start", x: 300, y: 40, parentId: null, completed: false, isRoot: true },
      { id: "n1", label: "1. 4 7 8 Breathing", x: 180, y: 160, parentId: "root", completed: false },
      { id: "n2", label: "2. Shoulder Stretch", x: 420, y: 160, parentId: "root", completed: false },
      { id: "n3", label: "3. Warm Hydration", x: 300, y: 280, parentId: "n1", completed: false },
      { id: "n4", label: "🍀 Fully Relaxed!", x: 300, y: 400, parentId: "n3", completed: false }
    ]
  },
  {
    id: "focus-booster",
    name: "Focus Booster Plan",
    description: "Build deep attention channels",
    nodes: [
      { id: "root", label: "⚡ Deep Work Session", x: 300, y: 40, parentId: null, completed: false, isRoot: true },
      { id: "n1", label: "1. Notifications to Zero", x: 180, y: 160, parentId: "root", completed: false },
      { id: "n2", label: "2. 25m Focus Sprint", x: 420, y: 160, parentId: "root", completed: false },
      { id: "n3", label: "3. Quick Stretching", x: 300, y: 280, parentId: "n1", completed: false },
      { id: "n4", label: "🔥 Flow State Achieved!", x: 300, y: 400, parentId: "n3", completed: false }
    ]
  },
  {
    id: "revision-marathon",
    name: "Revision Sprint",
    description: "Structure key concept reviews",
    nodes: [
      { id: "root", label: "📚 Revision Sprint Start", x: 300, y: 40, parentId: null, completed: false, isRoot: true },
      { id: "n1", label: "1. Active Recall Session", x: 180, y: 160, parentId: "root", completed: false },
      { id: "n2", label: "2. Weak Spot Review", x: 420, y: 160, parentId: "root", completed: false },
      { id: "n3", label: "3. Flashcard Drill", x: 300, y: 280, parentId: "n1", completed: false },
      { id: "n4", label: "🎯 Subject Mastered!", x: 300, y: 400, parentId: "n3", completed: false }
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

  // Viewport zoom & pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isLocked, setIsLocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Interaction states
  const [draggedNodeId, setDraggedNodeId] = useState(null);
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingText, setEditingText] = useState("");
  
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const isDraggingCanvas = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

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
  }, []);

  // Set default parent dropdown value when nodes update
  useEffect(() => {
    if (nodes.length > 0 && !newNodeParentId) {
      setNewNodeParentId(nodes[0].id);
    }
  }, [nodes]);

  // Canvas Pan Handlers
  const handleMouseDown = (e) => {
    if (isLocked) return;
    // Only pan if clicking empty canvas space or path SVG
    if (e.target.classList.contains("worktree-canvas-viewport") || e.target.tagName === "svg" || e.target.tagName === "path") {
      isDraggingCanvas.current = true;
      dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e) => {
    if (draggedNodeId && !isLocked) {
      const rect = canvasRef.current.getBoundingClientRect();
      // Calculate normalized coordinates based on active zoom and client bounds
      const x = Math.round((e.clientX - rect.left) / zoom);
      const y = Math.round((e.clientY - rect.top) / zoom);
      setNodes((prev) =>
        prev.map((node) => (node.id === draggedNodeId ? { ...node, x, y } : node))
      );
    } else if (isDraggingCanvas.current) {
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

  const handleWheel = (e) => {
    if (isLocked) return;
    e.preventDefault();
    const zoomFactor = 0.05;
    const nextZoom = e.deltaY < 0 ? Math.min(zoom + zoomFactor, 2) : Math.max(zoom - zoomFactor, 0.4);
    setZoom(nextZoom);
  };

  // Preset trigger
  const handleSelectPreset = (preset) => {
    setActivePresetId(preset.id);
    setNodes(preset.nodes);
    setWorktreeName(preset.name);
    setActiveWorktreeId(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Add new node in Builder mode
  const handleAddNode = (e) => {
    e.preventDefault();
    if (!newNodeLabel.trim()) {
      toast.warning("Please enter a node label");
      return;
    }

    const parent = nodes.find((n) => n.id === newNodeParentId);
    let x = 300;
    let y = 100;

    if (parent) {
      const siblings = nodes.filter((n) => n.parentId === parent.id);
      const offset = (siblings.length - (siblings.length / 2)) * 160;
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
    toast.success(`Node "${newNode.label}" added!`);
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

  // Inline rename
  const handleDoubleClickNode = (node) => {
    setEditingNodeId(node.id);
    setEditingText(node.label);
  };

  const handleSaveRename = (nodeId) => {
    if (editingText.trim()) {
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, label: editingText.trim() } : n))
      );
    }
    setEditingNodeId(null);
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
    setNodes([
      { id: "root", label: "🎯 Custom Mind Map", x: 300, y: 50, parentId: null, completed: false, isRoot: true }
    ]);
    setWorktreeName("New Custom Mind Map");
    setActiveWorktreeId(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    toast.info("Created new custom plan");
  };

  // Save/Update Worktree in database
  const handleSaveWorktree = async () => {
    if (!worktreeName.trim()) {
      toast.warning("Please specify a name for the Mind Map");
      return;
    }

    try {
      if (activeWorktreeId) {
        // Update
        await apiClient.put(`/api/worktrees/${activeWorktreeId}`, {
          name: worktreeName.trim(),
          nodes
        });
        toast.success("Mind Map updated successfully!");
      } else {
        // Save as new
        const res = await apiClient.post("/api/worktrees", {
          name: worktreeName.trim(),
          nodes
        });
        if (res?.id) {
          setActiveWorktreeId(res.id);
          toast.success("Mind Map saved successfully!");
        }
      }
      loadHistory();
    } catch (err) {
      toast.error("Failed to save mind map");
      console.error(err);
    }
  };

  // Load from history
  const handleLoadWorktree = (wt) => {
    setNodes(wt.nodes);
    setWorktreeName(wt.name);
    setActiveWorktreeId(wt.id);
    setActiveTab("builder");
    setZoom(1);
    setPan({ x: 0, y: 0 });
    toast.success(`Loaded "${wt.name}"`);
  };

  // Delete from history list
  const handleDeleteHistory = async (e, wtId) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this Mind Map from history?")) return;

    try {
      await apiClient.delete(`/api/worktrees/${wtId}`);
      toast.success("Mind Map deleted");
      if (activeWorktreeId === wtId) {
        setActiveWorktreeId(null);
      }
      loadHistory();
    } catch (err) {
      toast.error("Failed to delete records");
      console.error(err);
    }
  };

  // Reset Zoom & Pan
  const handleResetViewport = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Export mind map as PDF
  const handleExportPDF = async () => {
    const element = containerRef.current;
    if (!element) return;
    toast.info("Preparing PDF download...");

    try {
      // Force render scale at 1 for clean PDF exports
      const originalZoom = zoom;
      const originalPan = pan;
      setZoom(1);
      setPan({ x: 0, y: 0 });

      // Wait a fraction of a second for rendering styles to settle
      await new Promise((resolve) => setTimeout(resolve, 300));

      const canvas = await html2canvas(element, {
        useCORS: true,
        backgroundColor: "#0b0f19",
        scale: 2 // High res
      });

      // Restore viewport configurations
      setZoom(originalZoom);
      setPan(originalPan);

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("l", "mm", "a4");
      const width = pdf.internal.pageSize.getWidth();
      const height = pdf.internal.pageSize.getHeight();
      
      pdf.addImage(imgData, "PNG", 0, 0, width, height);
      pdf.save(`${worktreeName.replace(/\s+/g, "_")}.pdf`);
      toast.success("PDF exported successfully!");
    } catch (err) {
      toast.error("Failed to export PDF");
      console.error(err);
    }
  };

  return (
    <div className={`worktree-container card ${isFullscreen ? "fullscreen-modal-mode" : ""}`}>
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

          <button className="secondary-btn" onClick={handleResetViewport} title="Reset zoom/pan">
            <RotateCcw size={16} />
          </button>
          
          <button className="secondary-btn" onClick={handleExportPDF} title="Export as PDF">
            <Download size={16} />
            <span className="desktop-only-text">Export PDF</span>
          </button>

          <button className="secondary-btn" onClick={() => setIsFullscreen(!isFullscreen)}>
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
            <div className="field-stack">
              <span>Link From (Parent)</span>
              <select 
                value={newNodeParentId} 
                onChange={(e) => setNewNodeParentId(e.target.value)}
              >
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="builder-btn-group">
              <button className="action-btn" type="submit">
                <PlusCircle size={16} />
                Add Node
              </button>
              
              <button className="secondary-btn" onClick={handleSaveWorktree} type="button">
                <Save size={16} />
                Save Plan
              </button>

              <button className="secondary-btn" onClick={handleCreateNew} type="button">
                <Plus size={16} />
                New Slate
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
                
                {editingNodeId === node.id ? (
                  <input
                    autoFocus
                    className="badge-edit-input"
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onBlur={() => handleSaveRename(node.id)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveRename(node.id)}
                  />
                ) : (
                  <span className="badge-label" onDoubleClick={() => handleDoubleClickNode(node)}>
                    {node.label}
                  </span>
                )}

                <button 
                  className="badge-action-btn edit"
                  onClick={() => handleDoubleClickNode(node)}
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
      >
        {/* Canvas background grid */}
        <div className="canvas-grid-overlay" />

        {/* Viewport controls (absolute-positioned) */}
        <div className="canvas-zoom-controls">
          <button className="control-btn" onClick={() => setZoom(Math.min(zoom + 0.1, 2))} title="Zoom In">
            <ZoomIn size={16} />
          </button>
          <button className="control-btn" onClick={() => setZoom(Math.max(zoom - 0.1, 0.4))} title="Zoom Out">
            <ZoomOut size={16} />
          </button>
          <button className="control-btn" onClick={() => setIsLocked(!isLocked)} title={isLocked ? "Unlock Viewport" : "Lock Viewport"}>
            {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
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
                    handleDoubleClickNode(node);
                    return;
                  }
                  e.stopPropagation();
                  setDraggedNodeId(node.id);
                }}
                onClick={() => handleToggleNodeCompleted(node.id)}
                title="Click to complete • Double-click to rename • Drag to move"
              >
                {node.completed && <Check size={14} className="node-check-icon" />}
                
                {editingNodeId === node.id ? (
                  <input
                    autoFocus
                    className="node-rename-input"
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    onBlur={() => handleSaveRename(node.id)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveRename(node.id)}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span>{node.label}</span>
                )}
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
    </div>
  );
}

export default WorktreeMapper;
