import { memo, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Background,
  ControlButton,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useNodesState,
} from "@xyflow/react";
import {
  CalendarCheck2,
  Lock,
  Maximize2,
  Minimize2,
  Unlock,
} from "lucide-react";
import "@xyflow/react/dist/style.css";
import "./LearningMasteryMap.css";
import {
  getMasteryMapInteractionProps,
  MASTERY_STATUS_META,
} from "./LearningMasteryMap.config";
import { hasLearningNodeAchievement } from "../utils/learningMastery";

function progressFrom(source, nodeId) {
  if (source instanceof globalThis.Map) return source.get(nodeId) || {};
  return source?.[nodeId] || {};
}

function plannerFrom(source, nodeId) {
  if (source instanceof globalThis.Map) return source.get(nodeId) || {};
  return source?.[nodeId] || {};
}

function masteryStatus(progress, planner, type) {
  const rawStatus = progress.status
    || (planner.isCompleted ? "learned" : type === "notebook" ? "ready" : "new");
  if (progress.masteredAt || rawStatus === "mastered") return "mastered";
  if (hasLearningNodeAchievement(progress) || planner.isCompleted) return "learned";
  return rawStatus;
}

function MasteryNode({ data, selected }) {
  const status = MASTERY_STATUS_META[data.status] || MASTERY_STATUS_META.new;
  const StatusIcon = status.icon;
  return (
    <article
      className={`mastery-flow-node is-${data.type} has-status-${data.status}${selected || data.isSelected ? " is-selected" : ""}`}
      style={{ "--mastery-node-tone": status.color }}
    >
      {data.type !== "notebook" ? <Handle type="target" position={Position.Left} /> : null}
      <div className="mastery-flow-node__topline">
        <span className="mastery-flow-node__kind">{data.type}</span>
        {data.isPlannerCompleted ? (
          <span className="mastery-flow-node__planner" title="Completed in planner">
            <CalendarCheck2 aria-hidden="true" size={13} />
          </span>
        ) : null}
      </div>
      <strong title={data.title}>{data.title}</strong>
      {data.subtitle ? <small title={data.subtitle}>{data.subtitle}</small> : null}
      <div className="mastery-flow-node__status">
        <span><StatusIcon aria-hidden="true" size={13} /> {status.label}</span>
        <b>{Math.round(data.score || 0)}%</b>
      </div>
      <div className="mastery-flow-node__meter" aria-hidden="true">
        <i style={{ width: `${Math.max(0, Math.min(100, data.score || 0))}%` }} />
      </div>
      {data.hasChildren ? <Handle type="source" position={Position.Right} /> : null}
    </article>
  );
}

const nodeTypes = { mastery: memo(MasteryNode) };

function buildFlow(notebook, progressByNodeId, plannerByNodeId, selectedNodeId) {
  if (!notebook) return { nodes: [], edges: [] };
  const flowNodes = [];
  const edges = [];
  const chapterCenters = [];
  let cursorY = 0;

  const pushNode = (source, type, position, hasChildren, subtitle = "") => {
    const progress = progressFrom(progressByNodeId, source.id);
    const planner = plannerFrom(plannerByNodeId, source.id);
    const status = masteryStatus(progress, planner, type);
    flowNodes.push({
      id: source.id,
      type: "mastery",
      position,
      selected: source.id === selectedNodeId,
      data: {
        title: source.title,
        type,
        status,
        score: Number(progress.masteryScore ?? progress.score ?? (status === "mastered" ? 100 : status === "learned" ? 70 : 0)),
        subtitle,
        hasChildren,
        isSelected: source.id === selectedNodeId,
        isScheduled: Boolean(planner.isScheduled),
        isPlannerCompleted: Boolean(planner.isCompleted),
      },
    });
    return status;
  };

  const connect = (source, target, status = "new") => {
    const tone = (MASTERY_STATUS_META[status] || MASTERY_STATUS_META.new).color;
    edges.push({
      id: `${source}->${target}`,
      source,
      target,
      type: "smoothstep",
      animated: status === "learning" || status === "review_due",
      markerEnd: { type: MarkerType.ArrowClosed, color: tone, width: 15, height: 15 },
      style: { stroke: tone, strokeWidth: status === "mastered" ? 2.3 : 1.65, opacity: 0.78 },
    });
  };

  (notebook.chapters || []).forEach((chapter, chapterIndex) => {
    const topicCenters = [];
    const chapterStart = cursorY;
    (chapter.topics || []).forEach((topic) => {
      const topicY = cursorY;
      topicCenters.push(topicY);
      const topicStatus = pushNode(
        topic,
        "topic",
        { x: 620, y: topicY },
        Boolean(topic.subtopics?.length),
        chapter.title,
      );
      connect(chapter.id, topic.id, topicStatus);

      (topic.subtopics || []).forEach((subtopic, subtopicIndex) => {
        const subtopicY = topicY + subtopicIndex * 92;
        const subtopicStatus = pushNode(
          subtopic,
          "subtopic",
          { x: 940, y: subtopicY },
          false,
          topic.title,
        );
        connect(topic.id, subtopic.id, subtopicStatus);
      });
      cursorY += Math.max(118, (topic.subtopics?.length || 0) * 92 + 28);
    });

    if (!topicCenters.length) {
      topicCenters.push(cursorY);
      cursorY += 118;
    }
    const chapterY = topicCenters.reduce((sum, value) => sum + value, 0) / topicCenters.length;
    chapterCenters.push(chapterY);
    const chapterStatus = pushNode(
      chapter,
      "chapter",
      { x: 300, y: chapterY },
      Boolean(chapter.topics?.length),
      `${chapter.topics?.length || 0} topics`,
    );
    connect("root", chapter.id, chapterStatus);
    if (cursorY === chapterStart) cursorY += 118;
    if (chapterIndex < notebook.chapters.length - 1) cursorY += 38;
  });

  const rootY = chapterCenters.length
    ? chapterCenters.reduce((sum, value) => sum + value, 0) / chapterCenters.length
    : 0;
  pushNode(
    { id: "root", title: notebook.subjectName || notebook.title || "Learning path" },
    "notebook",
    { x: 0, y: rootY },
    Boolean(notebook.chapters?.length),
    `${notebook.chapters?.length || 0} chapters`,
  );

  return { nodes: flowNodes, edges };
}

function LearningMasteryMap({
  notebook,
  progressByNodeId,
  plannerByNodeId,
  selectedNodeId,
  onSelectNode,
  onStartNode,
}) {
  const flow = useMemo(
    () => buildFlow(notebook, progressByNodeId, plannerByNodeId, selectedNodeId),
    [notebook, plannerByNodeId, progressByNodeId, selectedNodeId],
  );
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [renderNodes, setRenderNodes, onNodesChange] = useNodesState(flow.nodes);
  const shellRef = useRef(null);
  const fullscreenToggleRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const interactionProps = getMasteryMapInteractionProps(isUnlocked);

  useEffect(() => {
    setRenderNodes((current) => {
      const positions = new globalThis.Map(current.map((node) => [node.id, node.position]));
      return flow.nodes.map((node) => ({
        ...node,
        position: positions.get(node.id) || node.position,
      }));
    });
  }, [flow.nodes, setRenderNodes]);

  useEffect(() => {
    if (!isFullscreen || typeof document === "undefined") return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusToggle = () => fullscreenToggleRef.current?.focus();
    const focusFrame = globalThis.requestAnimationFrame?.(focusToggle);
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsFullscreen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(shellRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || []);
      if (!focusable.length) {
        event.preventDefault();
        shellRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      if (focusFrame !== undefined) globalThis.cancelAnimationFrame?.(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      globalThis.requestAnimationFrame?.(() => {
        const restoreTarget = restoreFocusRef.current;
        if (restoreTarget?.isConnected) restoreTarget.focus();
        else document.querySelector('[data-mastery-fullscreen-toggle="true"]')?.focus();
      });
    };
  }, [isFullscreen]);

  const toggleFullscreen = () => {
    if (!isFullscreen && typeof document !== "undefined") {
      restoreFocusRef.current = document.activeElement;
    }
    setIsFullscreen((current) => !current);
  };

  const masteryMap = (
    <section
      aria-label={isFullscreen ? "Mastery map fullscreen" : "Interactive mastery map"}
      aria-modal={isFullscreen ? "true" : undefined}
      className={`mastery-flow-shell${isUnlocked ? " is-unlocked" : " is-locked"}${isFullscreen ? " is-fullscreen" : ""}`}
      ref={shellRef}
      role={isFullscreen ? "dialog" : undefined}
      tabIndex={isFullscreen ? -1 : undefined}
    >
      <div className="mastery-flow-header">
        <div className="mastery-flow-legend" aria-label="Mastery states">
          {Object.entries(MASTERY_STATUS_META).map(([key, item]) => (
            <span key={key} style={{ "--legend-tone": item.color }}><i />{item.label}</span>
          ))}
        </div>
        <button
          aria-label={isFullscreen ? "Exit mastery map fullscreen" : "Open mastery map fullscreen"}
          aria-pressed={isFullscreen}
          className="mastery-flow-fullscreen"
          data-mastery-fullscreen-toggle="true"
          onClick={toggleFullscreen}
          ref={fullscreenToggleRef}
          title={isFullscreen ? "Exit fullscreen" : "View fullscreen"}
          type="button"
        >
          {isFullscreen ? <Minimize2 aria-hidden="true" size={16} /> : <Maximize2 aria-hidden="true" size={16} />}
        </button>
      </div>
      <div className="mastery-flow-canvas">
        <ReactFlow
          {...interactionProps}
          deleteKeyCode={null}
          edges={flow.edges}
          fitView
          fitViewOptions={{ padding: 0.18, minZoom: 0.42, maxZoom: 1.1 }}
          key={isFullscreen ? "mastery-fullscreen" : "mastery-inline"}
          maxZoom={1.45}
          minZoom={0.28}
          multiSelectionKeyCode={isUnlocked ? undefined : null}
          nodes={renderNodes}
          nodesConnectable={false}
          nodeTypes={nodeTypes}
          onNodeClick={isUnlocked ? ((_, node) => onSelectNode?.(node.id)) : undefined}
          onNodeDoubleClick={isUnlocked ? ((_, node) => onStartNode?.(node.id)) : undefined}
          onNodesChange={isUnlocked ? onNodesChange : undefined}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="rgba(var(--accent-rgb), 0.2)" gap={22} size={1.05} />
          <Controls
            aria-label="Mastery map interaction controls"
            position="bottom-left"
            showFitView={isUnlocked}
            showInteractive={false}
            showZoom={isUnlocked}
          >
            <ControlButton
              aria-label={isUnlocked ? "Lock all mastery map interactions" : "Unlock mastery map interactions"}
              onClick={() => setIsUnlocked((current) => !current)}
              title={isUnlocked ? "Lock map interactions" : "Unlock map interactions"}
            >
              {isUnlocked ? <Lock aria-hidden="true" size={14} /> : <Unlock aria-hidden="true" size={14} />}
            </ControlButton>
          </Controls>
        </ReactFlow>
      </div>
    </section>
  );

  return isFullscreen && typeof document !== "undefined"
    ? createPortal(masteryMap, document.body)
    : masteryMap;
}

export default LearningMasteryMap;
