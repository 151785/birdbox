<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import type { ChannelPolicy, DirectProtocol, KernelProtocol } from "@birdbox/contracts/inventory";
import { useDashboardStore, loadDashboard } from "../dashboard/dashboard-store";
import { api } from "../shared/api-client";
import { dispatchToast } from "../shared/events";
import PolicyEditor from "../sessions/PolicyEditor.vue";
import { resourceAppliesToNode } from "@birdbox/contracts/resource-scope";

const dialog = ref<HTMLDialogElement | null>(null);
const editingId = ref<string | null>(null);
const kind = ref<"directs" | "kernels">("directs");
const pending = ref(false);
const { dashboard } = useDashboardStore();
const defaultPolicy = (direction: "import" | "export"): ChannelPolicy => ({ mode: "form", steps: [], filterId: null, formAction: direction === "import" ? "none" : "all" });
function clonePolicy(policy: ChannelPolicy): ChannelPolicy {
  return {
    mode: policy.mode,
    steps: policy.steps.map((step) => ({ ...step })),
    filterId: policy.filterId,
    formAction: policy.formAction,
  };
}
const draft = reactive<any>({
  label: "", name: "birdbox_direct", nodeId: "", nodeIds: [] as string[], kernelGlobal: false, interfaces: [] as string[], ipv4: true, ipv6: true,
  importPolicy: defaultPolicy("import"), exportPolicy: defaultPolicy("export"), table: null, scanTime: 60, persist: false, enabled: true,
});
const editing = computed(() => editingId.value !== null);
const nodes = computed(() => dashboard.value?.inventory.nodes ?? []);
const functions = computed(() => dashboard.value?.inventory.functions.filter((item) => item.enabled) ?? []);
const filters = computed(() => dashboard.value?.inventory.filters.filter((item) => item.enabled) ?? []);
const defines = computed(() => dashboard.value?.inventory.defines.filter((item) => item.enabled) ?? []);
const kernelTargetNodeIds = computed(() => draft.kernelGlobal ? nodes.value.map((node) => node.id) : draft.nodeIds);
const kernelFunctions = computed(() => functions.value.filter((item) => kernelTargetNodeIds.value.every((nodeId: string) => resourceAppliesToNode(item, nodeId))));
const kernelFilters = computed(() => filters.value.filter((item) => kernelTargetNodeIds.value.every((nodeId: string) => resourceAppliesToNode(item, nodeId))));

function reset(resource: DirectProtocol | KernelProtocol | null): void {
  editingId.value = resource?.id ?? null;
  if (kind.value === "directs") {
    const item = resource as DirectProtocol | null;
    Object.assign(draft, { label: item?.label ?? "", name: item?.name ?? "birdbox_direct", nodeId: item?.nodeId ?? nodes.value[0]?.id ?? "", interfaces: [...(item?.interfaces ?? [])], ipv4: item?.ipv4 ?? true, ipv6: item?.ipv6 ?? true, enabled: item?.enabled ?? true });
  } else {
    const item = resource as KernelProtocol | null;
    Object.assign(draft, { label: item?.label ?? "", name: item?.name ?? "birdbox_kernel", kernelGlobal: item ? item.nodeIds === null : false, nodeIds: [...(item?.nodeIds ?? nodes.value.map((node) => node.id))], ipv4: item?.ipv4 ?? true, ipv6: item?.ipv6 ?? true, importPolicy: clonePolicy(item?.importPolicy ?? defaultPolicy("import")), exportPolicy: clonePolicy(item?.exportPolicy ?? defaultPolicy("export")), table: item?.table ?? null, scanTime: item?.scanTime ?? 60, persist: item?.persist ?? false, enabled: item?.enabled ?? true });
  }
}

function open(nextKind: "directs" | "kernels", resource: DirectProtocol | KernelProtocol | null): void {
  kind.value = nextKind;
  reset(resource);
  dialog.value?.showModal();
}

function toggleNode(nodeId: string): void {
  draft.kernelGlobal = false;
  draft.nodeIds = draft.nodeIds.includes(nodeId) ? draft.nodeIds.filter((id: string) => id !== nodeId) : [...draft.nodeIds, nodeId];
}

function interfacesValue(): string {
  return draft.interfaces.join(", ");
}

async function save(): Promise<void> {
  if (!draft.label.trim() || !draft.name.trim()) return dispatchToast("请填写显示名称和协议名称", "error");
  if (kind.value === "directs" && !draft.nodeId) return dispatchToast("请选择 Direct 所属节点", "error");
  if (kind.value === "kernels" && !draft.nodeIds.length) return dispatchToast("Kernel 至少选择一个节点", "error");
  if (!draft.ipv4 && !draft.ipv6) return dispatchToast("至少启用一个地址族", "error");
  pending.value = true;
  try {
    const body = kind.value === "directs"
      ? { label: draft.label, name: draft.name, nodeId: draft.nodeId, interfaces: draft.interfaces, ipv4: draft.ipv4, ipv6: draft.ipv6, enabled: draft.enabled }
      : { label: draft.label, name: draft.name, nodeIds: draft.kernelGlobal ? null : draft.nodeIds, ipv4: draft.ipv4, ipv6: draft.ipv6, importPolicy: draft.importPolicy, exportPolicy: draft.exportPolicy, table: draft.table === "" ? null : draft.table, scanTime: draft.scanTime === "" ? null : draft.scanTime, persist: draft.persist, enabled: draft.enabled };
    await api(editingId.value ? `/api/${kind.value}/${encodeURIComponent(editingId.value)}` : `/api/${kind.value}`, { method: editingId.value ? "PUT" : "POST", body: JSON.stringify(body) });
    await loadDashboard(dashboard.value?.node?.id ?? null, dashboard.value?.selectedPeer?.id ?? null);
    dialog.value?.close();
    dispatchToast("协议资源已保存并应用", "success");
  } catch (error) {
    dispatchToast(error instanceof Error ? error.message : "协议资源保存失败", "error");
  } finally { pending.value = false; }
}

async function remove(): Promise<void> {
  if (!editingId.value || !confirm("确认删除该协议资源？")) return;
  pending.value = true;
  try {
    await api(`/api/${kind.value}/${encodeURIComponent(editingId.value)}`, { method: "DELETE" });
    await loadDashboard(dashboard.value?.node?.id ?? null, dashboard.value?.selectedPeer?.id ?? null);
    dialog.value?.close();
    dispatchToast("协议资源已删除", "success");
  } catch (error) { dispatchToast(error instanceof Error ? error.message : "协议资源删除失败", "error"); } finally { pending.value = false; }
}

function handleCreate(event: CustomEvent<{ kind: string }>): void { if (event.detail.kind === "directs" || event.detail.kind === "kernels") open(event.detail.kind, null); }
function handleEdit(event: CustomEvent<{ kind: string; id: string }>): void {
  if (event.detail.kind !== "directs" && event.detail.kind !== "kernels") return;
  const resource = event.detail.kind === "directs" ? dashboard.value?.inventory.directProtocols.find((item) => item.id === event.detail.id) : dashboard.value?.inventory.kernelProtocols.find((item) => item.id === event.detail.id);
  open(event.detail.kind, resource ?? null);
}
onMounted(() => { window.addEventListener("birdbox:resource-create", handleCreate); window.addEventListener("birdbox:resource-edit", handleEdit); });
onBeforeUnmount(() => { window.removeEventListener("birdbox:resource-create", handleCreate); window.removeEventListener("birdbox:resource-edit", handleEdit); });
</script>

<template>
  <dialog ref="dialog" class="editor-dialog" :aria-labelledby="`${kind}DialogTitle`">
    <form @submit.prevent="save">
      <div class="dialog-head"><span class="dialog-icon">{{ kind === 'directs' ? 'D' : 'K' }}</span><div><p class="eyebrow">资源</p><h2 :id="`${kind}DialogTitle`">{{ editing ? '编辑' : '添加' }} {{ kind === 'directs' ? 'Direct' : 'Kernel' }}</h2></div></div>
      <div class="dialog-grid">
        <div class="field"><label>显示名称</label><input v-model.trim="draft.label" required></div>
        <div class="field"><label>协议名称</label><input v-model.trim="draft.name" pattern="[A-Za-z_][A-Za-z0-9_]*" required></div>
        <template v-if="kind === 'directs'">
          <div class="field full-width"><label>所属节点</label><select v-model="draft.nodeId"><option value="" disabled>请选择节点</option><option v-for="node in nodes" :key="node.id" :value="node.id">{{ node.name }} · {{ node.routerId }}</option></select></div>
          <div class="field full-width"><label>学习接口（逗号分隔）</label><input :value="interfacesValue()" placeholder="留空匹配所有接口" @input="draft.interfaces = String(($event.target as HTMLInputElement).value).split(',').map((value) => value.trim()).filter(Boolean)"></div>
          <div class="field full-width"><span class="field-label">地址族</span><div class="segmented-control" role="group" aria-label="Direct 地址族"><label><input v-model="draft.ipv4" type="checkbox"><span>IPv4</span></label><label><input v-model="draft.ipv6" type="checkbox"><span>IPv6</span></label></div></div>
        </template>
        <template v-else>
          <div class="field full-width"><span class="field-label">下发节点</span><label class="toggle-row"><span>所有节点（包含后续新增节点）</span><input v-model="draft.kernelGlobal" type="checkbox"><i></i></label><div v-if="!draft.kernelGlobal" class="policy-scope-node-list"><label v-for="node in nodes" :key="node.id"><input type="checkbox" :checked="draft.nodeIds.includes(node.id)" @change="toggleNode(node.id)"><span>{{ node.name }}</span></label></div></div>
          <div class="field"><label>Linux 路由表</label><input v-model.number="draft.table" type="number" min="1" max="4294967295" placeholder="留空使用 main"></div>
          <div class="field"><label>扫描周期（秒）</label><input v-model.number="draft.scanTime" type="number" min="1" max="86400"></div>
          <label class="toggle-row full-width"><span>持久化内核路由</span><input v-model="draft.persist" type="checkbox"><i></i></label>
          <div class="field full-width"><span class="field-label">地址族</span><div class="segmented-control" role="group" aria-label="Kernel 地址族"><label><input v-model="draft.ipv4" type="checkbox"><span>IPv4</span></label><label><input v-model="draft.ipv6" type="checkbox"><span>IPv6</span></label></div><small>导入/导出策略对选中的地址族统一生效。</small></div>
          <PolicyEditor :family="draft.ipv4 ? 'ipv4' : 'ipv6'" direction="import" :policy="draft.importPolicy" :export-define-id="null" :functions="kernelFunctions" :filters="kernelFilters" :defines="defines" :disabled="pending" :show-policy-action="false" @update:policy="draft.importPolicy = $event" />
          <PolicyEditor :family="draft.ipv4 ? 'ipv4' : 'ipv6'" direction="export" :policy="draft.exportPolicy" :export-define-id="null" :functions="kernelFunctions" :filters="kernelFilters" :defines="defines" :disabled="pending" :show-policy-action="false" @update:policy="draft.exportPolicy = $event" />
        </template>
        <label class="toggle-row full-width"><span>启用资源</span><input v-model="draft.enabled" type="checkbox"><i></i></label>
      </div>
      <div class="dialog-actions split-actions"><button v-if="editing" class="text-danger-button" type="button" :disabled="pending" @click="remove">删除资源</button><span></span><button class="secondary-button" type="button" :disabled="pending" @click="dialog?.close()">取消</button><button class="primary-button" type="submit" :disabled="pending">{{ pending ? '正在应用' : '保存并应用' }}</button></div>
    </form>
  </dialog>
</template>
