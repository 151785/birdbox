<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

import type { PolicyCollection } from "@birdbox/contracts/inventory";

import type { ResourceEditKind, ResourceWorkspaceTarget } from "../shared/events";
import { loadDashboard, useDashboardStore } from "../dashboard/dashboard-store";
import { api } from "../shared/api-client";
import { dispatchToast } from "../shared/events";
import ResourceTable from "./ResourceTable.vue";
import NodeEditorDialog from "./NodeEditorDialog.vue";
import PeerEditorDialog from "./PeerEditorDialog.vue";
import PolicyResourceDialog from "./PolicyResourceDialog.vue";
import StaticEditorDialog from "./StaticEditorDialog.vue";
import RpkiEditorDialog from "./RpkiEditorDialog.vue";
import SourcePolicyEditorDialog from "./SourcePolicyEditorDialog.vue";
import SystemProtocolEditorDialog from "./SystemProtocolEditorDialog.vue";
import BatchAgentUpgradeDialog from "./BatchAgentUpgradeDialog.vue";

interface ResourceTab {
  id: ResourceWorkspaceTarget;
  label: string;
  eyebrow: string;
  title: string;
  addLabel: string;
  columns: string[];
  tableClass?: string;
}

const tabs: ResourceTab[] = [
  { id: "nodes", label: "受管节点", eyebrow: "Managed nodes", title: "受管节点", addLabel: "添加节点", columns: ["节点", "管理方式", "Router ID", "监听端口", "操作"] },
  { id: "peers", label: "eBGP 远端", eyebrow: "External definitions", title: "eBGP 远端", addLabel: "添加 Peer", columns: ["Peer", "所属节点", "邻居地址", "远端 ASN", "操作"] },
  { id: "defines", label: "Defines", eyebrow: "BIRD declarations", title: "Defines", addLabel: "添加 Define", columns: ["Define", "类型", "可用范围", "顺序", "值", "状态", "引用", "操作"], tableClass: "ordered-resource-table" },
  { id: "statics", label: "Static", eyebrow: "Node routes", title: "Static Protocols", addLabel: "添加 Static", columns: ["Static", "所属节点", "地址族", "标准路由", "Import / Export", "状态", "操作"] },
  { id: "directs", label: "Direct", eyebrow: "Connected routes", title: "Direct Protocols", addLabel: "添加 Direct", columns: ["Direct", "所属节点", "接口", "地址族", "状态", "操作"] },
  { id: "kernels", label: "Kernel", eyebrow: "FIB export", title: "Kernel Protocols", addLabel: "添加 Kernel", columns: ["Kernel", "下发节点", "地址族", "策略", "状态", "操作"] },
  { id: "functions", label: "Functions", eyebrow: "BIRD functions", title: "Functions", addLabel: "添加 Function", columns: ["显示名称 / Function", "可用范围", "顺序", "状态", "引用", "操作"], tableClass: "ordered-resource-table" },
  { id: "filters", label: "Filters", eyebrow: "BIRD filters", title: "Filters", addLabel: "添加 Filter", columns: ["显示名称 / Filter", "可用范围", "状态", "引用", "操作"] },
  { id: "rpki", label: "RPKI", eyebrow: "ROA sources", title: "RPKI", addLabel: "添加 RPKI", columns: ["资源", "来源", "可用范围", "ROA Table", "状态", "操作"] },
  { id: "sourcePolicies", label: "源地址出口", eyebrow: "Source policy egress", title: "源地址出口映射", addLabel: "新增映射集", columns: ["映射集", "下发节点", "出口组", "源 CIDR", "状态", "操作"] },
];

const { dashboard } = useDashboardStore();
const activeTab = ref<ResourceWorkspaceTarget>("nodes");
const active = computed(() => tabs.find((tab) => tab.id === activeTab.value) ?? tabs[0]!);
const nodesAvailable = computed(() => Boolean(dashboard.value?.inventory.nodes.length));
const movePending = ref(false);
const selectedNodeIds = ref<string[]>([]);
const agentNodeIds = computed(() => (dashboard.value?.inventory.nodes ?? []).filter((node) => node.transport === "agent").map((node) => node.id));

function toggleNode(nodeId: string): void {
  selectedNodeIds.value = selectedNodeIds.value.includes(nodeId)
    ? selectedNodeIds.value.filter((id) => id !== nodeId)
    : [...selectedNodeIds.value, nodeId];
}

function openBatchUpgrade(): void {
  const validIds = new Set(agentNodeIds.value);
  selectedNodeIds.value = selectedNodeIds.value.filter((id) => validIds.has(id));
  if (!selectedNodeIds.value.length) return;
  window.dispatchEvent(new CustomEvent("birdbox:agent-batch-upgrade", { detail: { nodeIds: [...selectedNodeIds.value] } }));
}

function selectAllAgents(): void {
  selectedNodeIds.value = [...agentNodeIds.value];
}

function clearSelectedNodes(): void {
  selectedNodeIds.value = [];
}

function selectTab(target: ResourceWorkspaceTarget, focus = false): void {
  activeTab.value = target;
  void nextTick(() => {
    const tab = document.querySelector<HTMLButtonElement>(`#resourceWorkspaceApp [data-resource-tab="${target}"]`);
    tab?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    if (focus) tab?.focus();
  });
}

function handleOpen(event: CustomEvent<{ target: ResourceWorkspaceTarget }>): void {
  selectTab(event.detail.target);
}

function handleTabSelect(event: CustomEvent<{ target: ResourceWorkspaceTarget }>): void {
  selectTab(event.detail.target);
}

function create(kind: ResourceEditKind): void {
  window.dispatchEvent(new CustomEvent("birdbox:resource-create", { detail: { kind } }));
}

async function handleMove(event: CustomEvent<{
  collection: PolicyCollection;
  id: string;
  direction: "up" | "down";
  button: HTMLButtonElement;
}>): Promise<void> {
  if (event.detail.collection === "filters") return;
  if (movePending.value) return;
  movePending.value = true;
  const button = event.detail.button;
  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = "…";
  try {
    await api(`/api/${event.detail.collection}/${encodeURIComponent(event.detail.id)}/move`, {
      method: "POST",
      body: JSON.stringify({ direction: event.detail.direction }),
    });
    await loadDashboard(dashboard.value?.node?.id ?? null, dashboard.value?.selectedPeer?.id ?? null);
    selectTab(event.detail.collection);
  } catch (error) {
    dispatchToast(error instanceof Error ? error.message : "资源顺序调整失败", "error");
  } finally {
    movePending.value = false;
    if (button.isConnected) {
      button.textContent = previousText;
      button.disabled = false;
    }
  }
}

function tabDomId(target: ResourceWorkspaceTarget): string {
  return `resource${target[0]?.toUpperCase() ?? ""}${target.slice(1)}Tab`;
}

function rowsDomId(target: ResourceWorkspaceTarget): string {
  const names: Record<ResourceWorkspaceTarget, string> = {
    nodes: "managementNodeRows",
    peers: "managementPeerRows",
    defines: "managementDefineRows",
    statics: "managementStaticRows",
    directs: "managementDirectRows",
    kernels: "managementKernelRows",
    functions: "managementFunctionRows",
    filters: "managementFilterRows",
    rpki: "managementRPKIRows",
    sourcePolicies: "managementSourcePolicyRows",
  };
  return names[target];
}

function moveTab(event: KeyboardEvent, index: number): void {
  if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0
    : event.key === "End" ? tabs.length - 1
      : (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + tabs.length) % tabs.length;
  const target = tabs[next];
  if (target) selectTab(target.id, true);
}

onMounted(() => {
  window.addEventListener("birdbox:workspace-resource-open", handleOpen);
  window.addEventListener("birdbox:resource-tab-select", handleTabSelect);
  window.addEventListener("birdbox:resource-move", handleMove);
});
onBeforeUnmount(() => {
  window.removeEventListener("birdbox:workspace-resource-open", handleOpen);
  window.removeEventListener("birdbox:resource-tab-select", handleTabSelect);
  window.removeEventListener("birdbox:resource-move", handleMove);
});
</script>

<template>
  <div class="resource-header"><div><p class="eyebrow">Inventory</p><h2>资源管理</h2></div></div>
  <nav class="resource-tabs" role="tablist" aria-label="资源类型">
    <button v-for="(tab, index) in tabs" :id="tabDomId(tab.id)" :key="tab.id" class="resource-tab" :class="{ active: activeTab === tab.id }" type="button" role="tab" :aria-selected="activeTab === tab.id" :aria-controls="`resource-${tab.id}`" :data-resource-tab="tab.id" :tabindex="activeTab === tab.id ? 0 : -1" @click="selectTab(tab.id)" @keydown="moveTab($event, index)">{{ tab.label }}</button>
  </nav>
  <section :id="`resource-${active.id}`" class="resource-section resource-panel" role="tabpanel">
    <div class="section-heading compact"><div><p class="eyebrow">{{ active.eyebrow }}</p><h3>{{ active.title }}</h3></div><div class="resource-heading-actions"><template v-if="active.id === 'nodes'"><button class="compact-command" type="button" :disabled="!agentNodeIds.length" @click="selectAllAgents">全选 Agent</button><button v-if="selectedNodeIds.length" class="compact-command" type="button" @click="clearSelectedNodes">清除选择</button><span v-if="selectedNodeIds.length" class="selection-count">已选 {{ selectedNodeIds.length }} 个</span><button class="secondary-button compact-command" type="button" :disabled="!selectedNodeIds.length" @click="openBatchUpgrade">批量升级 Agent</button></template><button class="primary-button compact-command" type="button" :disabled="(active.id === 'peers' || active.id === 'statics' || active.id === 'directs' || active.id === 'kernels' || active.id === 'sourcePolicies') && !nodesAvailable" @click="create(active.id)">+ {{ active.addLabel }}</button></div></div>
    <div class="resource-table-wrap"><table :class="active.tableClass"><thead><tr><th v-for="column in active.columns" :key="column">{{ column }}</th></tr></thead><tbody :id="rowsDomId(active.id)"><ResourceTable :kind="active.id" :selected-node-ids="selectedNodeIds" @toggle-node="toggleNode" /></tbody></table></div>
  </section>
  <NodeEditorDialog />
  <PeerEditorDialog />
  <PolicyResourceDialog />
  <StaticEditorDialog />
  <RpkiEditorDialog />
  <SourcePolicyEditorDialog />
  <SystemProtocolEditorDialog />
  <BatchAgentUpgradeDialog />
</template>

<style scoped>
.resource-heading-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
.selection-count { color: var(--text-muted, #68707a); font-size: .9rem; white-space: nowrap; }
</style>
