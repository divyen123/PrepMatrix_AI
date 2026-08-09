import { memo, useEffect, useMemo, useState } from "react";
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
import { CalendarCheck2, CheckCircle2, CircleDot, Clock3, Lock, RotateCcw, Unlock } from "lucide-react";
import "@xyflow/react/dist/style.css";
import "./LearningMasteryMap.css";

const STATUS_META = {
  new: { label: "New", color: "var(--mastery-tone-new)", icon: CircleDot },
  ready: { label: "Ready", color: "var(--mastery-tone-ready)", icon: CircleDot },
  learning: { label: "Learning", color: "var(--mastery-tone-learning)", icon: Clock3 },
  learned: { label: "Learned", color: "var(--mastery-tone-learned)", icon: CheckCircle2 },
  review_due: { label: "Review due", color: "var(--mastery-tone-review)", icon: RotateCcw },
  mastered: { label: "Mastered", color: "var(--mastery-tone-mastered)", icon: CheckCircle2 },
};

function progressFrom(source, nodeId) {
  if (source instanceof globalThis.Map) return source.get(nodeId) || {};
  return source?.[nodeId] || {};
}

function plannerFrom(source, nodeId) {
  if (source instanceof globalThis.Map) return source.get(nodeId) || {};
  return source?.[nodeId] || {};
}

function MasteryNode({ data, selected }) {
  const status = STATUS_META[data.status] || STATUS_META.new;
  const StatusIcon = status.icon;
  return (
    <article
      className={`mastery-flow-node is-${data.type}${selected || data.isSelected ? " is-selected" : ""}`}
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
    const status = progress.status || (planner.isCompleted ? "learned" : type === "notebook" ? "ready" : "new");
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
  };

  const connect = (source, target, status = "new") => {
    const tone = (STATUS_META[status] || STATUS_META.new).color;
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
      pushNode(
        topic,
        "topic",
        { x: 620, y: topicY },
        Boolean(topic.subtopics?.length),
        chapter.title,
      );
      connect(chapter.id, topic.id, progressFrom(progressByNodeId, topic.id).status);

      (topic.subtopics || []).forEach((subtopic, subtopicIndex) => {
        const subtopicY = topicY + subtopicIndex * 92;
        pushNode(subtopic, "subtopic", { x: 940, y: subtopicY }, false, topic.title);
        connect(topic.id, subtopic.id, progressFrom(progressByNodeId, subtopic.id).status);
      });
      cursorY += Math.max(118, (topic.subtopics?.length || 0) * 92 + 28);
    });

    if (!topicCenters.length) {
      topicCenters.push(cursorY);
      cursorY += 118;
    }
    const chapterY = topicCenters.reduce((sum, value) => sum + value, 0) / topicCenters.length;
    chapterCenters.push(chapterY);
    pushNode(
      chapter,
      "chapter",
      { x: 300, y: chapterY },
      Boolean(chapter.topics?.length),
      `${chapter.topics?.length || 0} topics`,
    );
    connect("root", chapter.id, progressFrom(progressByNodeId, chapter.id).status);
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
  const [renderNodes, setRenderNodes, onNodesChange] = useNodesState(flow.nodes);

  useEffect(() => {
    setRenderNodes((current) => {
      const positions = new globalThis.Map(current.map((node) => [node.id, node.position]));
      return flow.nodes.map((node) => ({
        ...node,
        position: positions.get(node.id) || node.position,
      }));
    });
  }, [flow.nodes, setRenderNodes]);

  return (
    <section className="mastery-flow-shell" aria-label="Interactive mastery map">
      <div className="mastery-flow-legend" aria-label="Mastery states">
        {Object.entries(STATUS_META).map(([key, item]) => (
          <span key={key} style={{ "--legend-tone": item.color }}><i />{item.label}</span>
        ))}
      </div>
      <div className="mastery-flow-canvas">
        <ReactFlow
          edges={flow.edges}
          elementsSelectable={isUnlocked}
          fitView
          fitViewOptions={{ padding: 0.18, minZoom: 0.42, maxZoom: 1.1 }}
          maxZoom={1.45}
          minZoom={0.28}
          nodes={renderNodes}
          nodesConnectable={false}
          nodesDraggable={isUnlocked}
          nodesFocusable
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => onSelectNode?.(node.id)}
          onNodeDoubleClick={(_, node) => onStartNode?.(node.id)}
          onNodesChange={onNodesChange}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="rgba(var(--accent-rgb), 0.24)" gap={22} size={1.15} />
          <Controls
            aria-label="Mastery map zoom and node lock controls"
            position="bottom-left"
            showFitView={false}
            showInteractive={false}
          >
            <ControlButton
              aria-label={isUnlocked ? "Lock mastery map node positions" : "Unlock mastery map node positions"}
              onClick={() => setIsUnlocked((current) => !current)}
              title={isUnlocked ? "Lock mastery map node positions" : "Unlock mastery map node positions"}
            >
              {isUnlocked ? <Lock aria-hidden="true" size={14} /> : <Unlock aria-hidden="true" size={14} />}
            </ControlButton>
          </Controls>
        </ReactFlow>
      </div>
    </section>
  );
}

export default LearningMasteryMap;
