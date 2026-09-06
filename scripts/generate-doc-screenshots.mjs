import { chromium } from "@playwright/test";
import fs from "node:fs/promises";

const baseURL = process.env.BIRDBOX_SCREENSHOT_URL ?? "http://127.0.0.1:3000";
const outputDir = new URL("../docs/images/", import.meta.url);
await fs.mkdir(outputDir, { recursive: true });

const nodes = [
  { id: "demo-edge", kind: "managed-node", name: "香港边缘节点", transport: "agent", sshHost: null, sshPort: null, sshUser: null, sshIdentity: "managed", deploymentMode: "include", mainConfigPath: "/etc/bird/bird.conf", generatedConfigPath: "/var/lib/birdbox/generated.conf", socketPath: "/run/bird/bird.ctl", routerId: "198.51.100.10", igpAddress: "10.10.0.10", listenPort: 179, directProtocol: { enabled: true, name: "direct_hk", ipv4: true, ipv6: true, interfaces: ["eth0", "wg0"] }, kernelProtocol: { enabled: true, name: "kernel_hk", ipv4: true, ipv6: true, import: "none", export: "all", table: null, scanTime: 20, persist: false } },
  { id: "demo-tokyo", kind: "managed-node", name: "东京出口节点", transport: "agent", sshHost: null, sshPort: null, sshUser: null, sshIdentity: "managed", deploymentMode: "include", mainConfigPath: "/etc/bird/bird.conf", generatedConfigPath: "/var/lib/birdbox/generated.conf", socketPath: "/run/bird/bird.ctl", routerId: "198.51.100.20", igpAddress: "10.10.0.20", listenPort: 179, directProtocol: { enabled: true, name: "direct_tokyo", ipv4: true, ipv6: false, interfaces: ["eth0"] }, kernelProtocol: { enabled: true, name: "kernel_tokyo", ipv4: true, ipv6: false, import: "none", export: "all", table: 200, scanTime: 20, persist: false } },
  { id: "demo-singapore", kind: "managed-node", name: "新加坡核心节点", transport: "ssh", sshHost: "sg.example.net", sshPort: 2222, sshUser: "birdbox", sshIdentity: "managed", deploymentMode: "include", mainConfigPath: "/etc/bird/bird.conf", generatedConfigPath: "/var/lib/birdbox/generated.conf", socketPath: "/run/bird/bird.ctl", routerId: "198.51.100.30", igpAddress: "10.10.0.30", listenPort: 179, directProtocol: { enabled: true, name: "direct_sg", ipv4: true, ipv6: true, interfaces: [] }, kernelProtocol: { enabled: true, name: "kernel_sg", ipv4: true, ipv6: true, import: "none", export: "all", table: null, scanTime: null, persist: false } },
];

const formPolicy = (formAction = "all") => ({ mode: "combined", steps: [{ type: "form" }], filterId: null, formAction });
const channel = (family, exportAction = "none") => ({ enabled: true, importPolicy: formPolicy("all"), exportPolicy: formPolicy(exportAction), exportDefineId: family === "ipv4" ? "define-v4" : "define-v6", table: null, preference: null, importKeepFiltered: false, rpkiReload: "default", importLimit: { value: null, action: "warn" }, receiveLimit: { value: null, action: "warn" }, exportLimit: { value: null, action: "warn" }, mandatory: false, nextHopKeep: "default", nextHopSelf: "default", nextHopAddress: null, nextHopPrefer: "default", linkLocalNextHopFormat: "default", gateway: "direct", igpTable: null, importTable: false, exportTable: false, secondary: false, extendedNextHop: family === "ipv4", requireExtendedNextHop: false, addPaths: "off", requireAddPaths: false, aigp: "default", cost: null, gracefulRestart: "default", longLivedGracefulRestart: "default", longLivedStaleTime: null, minLongLivedStaleTime: null, maxLongLivedStaleTime: null, raw: "" });
const bgp = () => ({ connectionMode: "multihop", multihopTtl: 64, passive: false, bfd: "off", bfdOptions: "", ttlSecurity: false, description: "生产边缘互联", routerId: null, vrf: null, interface: null, onlink: false, authentication: "none", password: null, aoKeys: "", setkey: "default", strictBind: false, freeBind: false, checkLink: "default", rsClient: false, confederation: null, confederationMember: false, allowLocalPref: false, allowMed: false, allowLocalAs: null, allowAsSets: "default", enforceFirstAs: true, routeRefresh: "default", enhancedRouteRefresh: "default", requireRouteRefresh: false, requireEnhancedRouteRefresh: false, gracefulRestart: "aware", gracefulRestartTime: 120, minGracefulRestartTime: null, maxGracefulRestartTime: null, requireGracefulRestart: false, longLivedGracefulRestart: "default", longLivedStaleTime: null, minLongLivedStaleTime: null, maxLongLivedStaleTime: null, requireLongLivedGracefulRestart: false, interpretCommunities: "default", enableAs4: "default", requireAs4: false, extendedMessages: false, requireExtendedMessages: false, capabilities: "on", requireCapabilities: false, advertiseHostname: false, requireHostname: false, disableAfterError: false, disableAfterCease: "default", holdTime: 180, minHoldTime: null, startupHoldTime: null, keepaliveTime: 60, minKeepaliveTime: null, sendHoldTime: null, connectDelayTime: null, connectRetryTime: null, errorWaitMin: null, errorWaitMax: null, errorForgetTime: null, pathMetric: "default", medMetric: false, deterministicMed: false, igpMetric: "default", preferOlder: false, defaultMed: null, defaultLocalPref: 100, localRole: "", requireRoles: false, rrClient: false, rrClusterId: null, raw: "" });
const sessions = [
  { id: "session-hk-transit", nodeId: "demo-edge", peerId: "peer-transit", protocolName: "ebgp_transit_v4", localAddress: "203.0.113.10", localAsn: 64512, localPort: 179, bgp: bgp(), channels: { ipv4: channel("ipv4", "all"), ipv6: { ...channel("ipv6"), enabled: false } }, enabled: true, sessionType: "ebgp" },
  { id: "session-hk-v6", nodeId: "demo-edge", peerId: "peer-v6", protocolName: "ebgp_v6_cloud", localAddress: "2001:db8:10::10", localAsn: 64512, localPort: 179, bgp: bgp(), channels: { ipv4: { ...channel("ipv4", "none"), enabled: false }, ipv6: channel("ipv6", "all") }, enabled: true, sessionType: "ebgp" },
];
const peers = [
  { id: "peer-transit", nodeId: "demo-edge", name: "上游 Transit AS64513", address: "203.0.113.1", asn: 64513, port: 179 },
  { id: "peer-v6", nodeId: "demo-edge", name: "Cloud IPv6 Peer", address: "2001:db8:10::1", asn: 64514, port: 179 },
];
const inventory = {
  version: 28, nodes, peers,
  defines: [
    { id: "define-v4", label: "客户 IPv4 前缀", name: "customer_v4", enabled: true, nodeIds: null, type: "cidr4", entrySource: { kind: "manual" }, entries: ["198.51.100.0/24", "203.0.113.0/25"], sync: { status: "never", lastAttemptAt: null, lastSuccessAt: null, nextRefreshAt: null, error: null, contentHash: null } },
    { id: "define-v6", label: "客户 IPv6 前缀", name: "customer_v6", enabled: true, nodeIds: ["demo-edge", "demo-tokyo"], type: "cidr6", entrySource: { kind: "manual" }, entries: ["2001:db8:100::/48"], sync: { status: "never", lastAttemptAt: null, lastSuccessAt: null, nextRefreshAt: null, error: null, contentHash: null } },
    { id: "define-as-set", label: "AS-SET 上游前缀", name: "transit_as_set", enabled: true, nodeIds: null, type: "cidr4", entrySource: { kind: "irr-as-set", asSet: "AS64513:AS-EXAMPLE", server: "rr.ntt.net", databases: ["RIPE"], refreshIntervalSeconds: 3600, prefixLimit: 5000, allowMoreSpecific: true }, entries: ["192.0.2.0/24", "198.18.0.0/15"], sync: { status: "ready", lastAttemptAt: "2026-09-06T08:00:00Z", lastSuccessAt: "2026-09-06T08:00:05Z", nextRefreshAt: "2026-09-06T09:00:00Z", error: null, contentHash: "demo-hash" } },
  ],
  functions: [{ id: "fn-tag", label: "标记客户路由", name: "tag_customer", enabled: true, nodeIds: null, callable: true, source: "function tag_customer() { bgp_community.add((64512, 100)); }" }],
  filters: [{ id: "filter-import", label: "上游导入策略", name: "from_transit", enabled: true, nodeIds: null, source: "filter from_transit { tag_customer(); if net ~ customer_v4 then accept; reject; }" }],
  rpki: [{ id: "rpki-demo", label: "生产 RPKI-RTR", name: "rpki_prod", enabled: true, nodeIds: null, sourceType: "server", roa4Table: "ROA4_PROD", roa6Table: "ROA6_PROD", remote: "rpki.example.net", port: 323, localAddress: null, refresh: 900, keepRefresh: true, retry: 300, keepRetry: true, expire: 3600, keepExpire: true, ignoreMaxLength: "default", minVersion: null, maxVersion: null, transport: "tcp", authentication: "none", password: null, birdPrivateKey: null, remotePublicKey: null, user: null }],
  staticProtocols: [{ id: "static-demo", nodeId: "demo-edge", label: "边缘黑洞与客户路由", name: "static_customer_routes", family: "ipv4", defineId: "define-v4", action: null, routeActions: { "198.51.100.0/24": "blackhole", "203.0.113.0/25": "via 10.10.0.1" }, routeFilters: {}, import: "all", export: "none", raw: "", enabled: true }],
  directProtocols: [{ id: "direct-demo", label: "边缘直连接口", name: "direct_hk", nodeId: "demo-edge", interfaces: ["eth0", "wg0"], ipv4: true, ipv6: true, enabled: true }],
  kernelProtocols: [{ id: "kernel-demo", label: "全局 FIB 下发", name: "kernel_all", nodeIds: null, ipv4: true, ipv6: true, importPolicy: formPolicy("none"), exportPolicy: formPolicy("all"), table: null, scanTime: 20, persist: false, enabled: true }],
  sourcePolicies: [{ id: "source-demo", label: "业务源地址出口", enabled: true, nodeIds: ["demo-edge", "demo-tokyo"], groups: [{ id: "hk", egressAddress: "10.10.0.1", sources: ["198.51.100.10/32", "198.51.100.11/32"], kernelTable: 50000, ruleSlot: 0 }, { id: "tokyo", egressAddress: "10.10.0.20", sources: ["203.0.113.10/32"], kernelTable: 50001, ruleSlot: 1 }], rulePriorityBase: 10000, copyInternalRoutes: false, internalDefineIds: [] }],
  sessions, ibgpDomains: [], ospfDomains: [], ospfLayout: {},
};

const runtime = { nodeId: "demo-edge", reachable: true, bird2: true, version: "2.18", error: null, protocols: [
  { name: "ebgp_transit_v4", configured: true, disabled: false, state: "Established", established: true, neighbor: "203.0.113.1", neighborAs: 64513, imported: 42, exported: 8, channels: { ipv4: { state: "UP", table: "master4", imported: 42, exported: 8, preferred: 42 } } },
  { name: "ebgp_v6_cloud", configured: true, disabled: false, state: "Established", established: true, neighbor: "2001:db8:10::1", neighborAs: 64514, imported: 18, exported: 2, channels: { ipv6: { state: "UP", table: "master6", imported: 18, exported: 2, preferred: 18 } } },
  { name: "direct_hk", configured: true, disabled: false, state: "Running", established: false, neighbor: null, neighborAs: null, imported: 6, exported: 0 },
  { name: "kernel_all", configured: true, disabled: false, state: "Running", established: false, neighbor: null, neighborAs: null, imported: 0, exported: 51 },
] };

const dashboard = {
  inventory,
  selection: { nodeId: "demo-edge", peerId: "peer-transit" },
  node: nodes[0],
  peers: peers.map((peer) => ({ ...peer, session: sessions.find((session) => session.peerId === peer.id) ?? null, protocol: runtime.protocols.find((protocol) => protocol.name === sessions.find((session) => session.peerId === peer.id)?.protocolName) ?? null })),
  cidrDefines: { ipv4: inventory.defines.filter((item) => item.type === "cidr4"), ipv6: inventory.defines.filter((item) => item.type === "cidr6") },
  defines: inventory.defines, functions: inventory.functions, filters: inventory.filters, rpki: inventory.rpki, staticProtocols: inventory.staticProtocols, directProtocols: inventory.directProtocols, kernelProtocols: inventory.kernelProtocols, sourcePolicies: inventory.sourcePolicies,
  selectedPeer: null,
  runtime,
  health: { status: "ready", totalNodes: 3, onlineNodes: 3, activeSessions: 2, normalSessions: 2, abnormalSessions: 0, nodeStatuses: nodes.map((node) => ({ nodeId: node.id, name: node.name, status: "ready", reachable: true, bird2: true, version: "2.18", error: null, activeSessions: node.id === "demo-edge" ? 2 : 0, normalSessions: node.id === "demo-edge" ? 2 : 0 })) },
  established: true, config: "protocol bgp ebgp_transit_v4 {\n  local 203.0.113.10 as 64512;\n  neighbor 203.0.113.1 as 64513;\n  ipv4 { import all; export filter from_transit; }\n}", events: [{ timestamp: "2026-09-06T08:10:00Z", level: "info", message: "已应用 eBGP 会话 ebgp_transit_v4", nodeId: "demo-edge" }],
};
dashboard.selectedPeer = dashboard.peers[0];

const ibgpDomain = {
  id: "ibgp-demo", name: "核心 iBGP 域", asn: 64512,
  members: nodes.map((node, index) => ({ nodeId: node.id, address: node.igpAddress })),
  adjacencies: [{ id: "adj-demo-1", leftNodeId: "demo-edge", rightNodeId: "demo-tokyo", enabled: true, leftSessionId: "ibgp-demo-left", rightSessionId: "ibgp-demo-right" }],
  layout: { "demo-edge": { x: 100, y: 210, locked: false }, "demo-tokyo": { x: 460, y: 120, locked: false }, "demo-singapore": { x: 460, y: 360, locked: false } },
};
const ibgpSessions = [
  { id: "ibgp-demo-left", nodeId: "demo-edge", peerId: "ibgp-peer-left", protocolName: "ibgp_core_edge", localAddress: "10.10.0.10", localAsn: 64512, localPort: 179, bgp: { ...bgp(), rrClient: true, rrClusterId: "10.255.0.1" }, channels: { ipv4: channel("ipv4", "all"), ipv6: channel("ipv6", "all") }, enabled: true, sessionType: "ibgp", managedBy: { kind: "ibgp-domain", domainId: "ibgp-demo", adjacencyId: "adj-demo-1" } },
  { id: "ibgp-demo-right", nodeId: "demo-tokyo", peerId: "ibgp-peer-right", protocolName: "ibgp_core_tokyo", localAddress: "10.10.0.20", localAsn: 64512, localPort: 179, bgp: { ...bgp(), rrClient: false, rrClusterId: "10.255.0.1" }, channels: { ipv4: channel("ipv4", "all"), ipv6: channel("ipv6", "all") }, enabled: true, sessionType: "ibgp", managedBy: { kind: "ibgp-domain", domainId: "ibgp-demo", adjacencyId: "adj-demo-1" } },
];

const ospfNodeConfig = (nodeId, routerId, versions = ["ospfv2", "ospfv3"]) => ({
  nodeId, enabled: true, versions, routerId,
  importPolicies: { ospfv2: formPolicy("all"), ospfv3: formPolicy("all") },
  exportPolicies: { ospfv2: formPolicy("none"), ospfv3: formPolicy("none") },
  exportDefineIds: { ospfv2: null, ospfv3: null }, bfd: true, gracefulRestart: true, redistributeStatic: true,
  protocolOptions: { rfc1583compat: false, rfc5838: true, instanceId: null, stubRouter: false, tick: null, ecmp: true, ecmpLimit: 32, mergeExternal: false, gracefulRestartMode: "aware", gracefulRestartTime: 120 },
  areaOptions: { "0.0.0.0": { stub: false, nssa: false, summary: null, defaultNssa: false, defaultCost: null, defaultCost2: null, translator: false, translatorStability: null, networks: [], external: [], stubnets: [] } }, virtualLinks: [],
});
const ospfOptions = { instanceId: null, stub: false, poll: null, retransmit: null, transmitDelay: null, priority: 1, wait: null, deadMode: "count", rxBuffer: null, txLength: null, type: "ptp", linkLsaSuppression: false, strictNonbroadcast: false, realBroadcast: false, ptpNetmask: false, ptpAddress: false, secondary: false, checkLink: true, bfd: true, ecmpWeight: null, ttlSecurity: "off", txClass: null, txDscp: null, txPriority: null, password: null, passwordOptions: {}, neighbors: [] };
const ospfDomain = {
  id: "ospf-demo", name: "生产骨干 OSPF 域", nodeConfigs: [ospfNodeConfig("demo-edge", "198.51.100.10"), ospfNodeConfig("demo-tokyo", "198.51.100.20"), ospfNodeConfig("demo-singapore", "198.51.100.30")],
  links: [
    { id: "ospf-link-hk-tokyo", fromNodeId: "demo-edge", toNodeId: "demo-tokyo", area: "0.0.0.0", localInterface: "wg-hk-tokyo", remoteInterface: "wg-tokyo-hk", cost: 10, hello: 10, dead: 40, passive: false, authentication: "none", options: { ...ospfOptions, type: "ptp" } },
    { id: "ospf-link-tokyo-sg", fromNodeId: "demo-tokyo", toNodeId: "demo-singapore", area: "0.0.0.0", localInterface: "wg-tokyo-sg", remoteInterface: "wg-sg-tokyo", cost: 20, hello: 10, dead: 40, passive: false, authentication: "none", options: { ...ospfOptions, type: "ptp" } },
    { id: "ospf-link-sg-hk", fromNodeId: "demo-singapore", toNodeId: "demo-edge", area: "0.0.0.0", localInterface: "wg-sg-hk", remoteInterface: "wg-hk-sg", cost: 30, hello: 10, dead: 40, passive: false, authentication: "none", options: { ...ospfOptions, type: "ptp" } },
  ], layout: { "demo-edge": { x: 430, y: 270, locked: false }, "demo-tokyo": { x: 820, y: 150, locked: false }, "demo-singapore": { x: 820, y: 390, locked: false } },
};

function makeIbgpResponse() {
  return { domains: [ibgpDomain], inventory: { ...inventory, ibgpDomains: [ibgpDomain], sessions: [...sessions, ...ibgpSessions], peers: [...peers, { id: "ibgp-peer-left", nodeId: "demo-edge", name: "iBGP 对端 Tokyo", address: "10.10.0.20", asn: 64512, port: 179, managedBy: { kind: "ibgp-domain", domainId: "ibgp-demo", adjacencyId: "adj-demo-1" } }, { id: "ibgp-peer-right", nodeId: "demo-tokyo", name: "iBGP 对端 Hong Kong", address: "10.10.0.10", asn: 64512, port: 179, managedBy: { kind: "ibgp-domain", domainId: "ibgp-demo", adjacencyId: "adj-demo-1" } }] } };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.route("**/api/dashboard**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(dashboard) }));
await page.route("**/api/ibgp-domains", (route) => {
  if (route.request().method() !== "GET") return route.continue();
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(makeIbgpResponse()) });
});
await page.route("**/api/ibgp-domains/preview", async (route) => {
  const body = route.request().postDataJSON();
  const domain = { ...body, id: body.id ?? "ibgp-preview" };
  delete domain.sessionUpdates;
  const submitted = Array.isArray(body.sessionUpdates) ? body.sessionUpdates : ibgpSessions;
  const previewSessions = submitted.map((session) => ({ ...session, managedBy: { kind: "ibgp-domain", domainId: domain.id, adjacencyId: session.managedBy?.adjacencyId ?? "adj-demo-1" } }));
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ valid: true, domain, sessions: previewSessions, sides: previewSessions.map((session, index) => ({ side: index === 0 ? "left" : "right", nodeId: session.nodeId, nodeName: nodes.find((node) => node.id === session.nodeId)?.name ?? session.nodeId, session, config: `protocol bgp ${session.protocolName} {\n  local as 64512;\n  neighbor ${session.localAddress} as 64512;\n}`, validation: { ok: true, stdout: "", stderr: "", code: 0 } })) }) });
});
await page.route("**/api/nodes/*/runtime", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ nodeId: route.request().url().split("/").at(-2), runtime: { nodeId: route.request().url().split("/").at(-2), reachable: true, bird2: true, version: "2.18", error: null, protocols: [] } }) }));
await page.route("**/api/ospf", async (route) => {
  const response = await route.fetch();
  const payload = await response.json();
  payload.domains = [ospfDomain];
  payload.layout = ospfDomain.layout;
  payload.inventory = { ...payload.inventory, ...inventory, ospfDomains: [ospfDomain], ospfLayout: ospfDomain.layout };
  await route.fulfill({ response, json: payload });
});
await page.route("**/api/ospf/**", (route) => {
  const pathname = new URL(route.request().url()).pathname;
  if (!pathname.endsWith("/runtime")) return route.continue();
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ nodes: nodes.map((node) => ({ nodeId: node.id, name: node.name, runtime: { v2: { state: "Full", neighbors: 2, routes: 12 }, v3: { state: "Full", neighbors: 2, routes: 8 }, neighbors: [{ version: "ospfv2", routerId: "198.51.100.20", priority: 1, state: "Full", deadTime: 32, interface: "wg0", address: "10.10.0.20" }, { version: "ospfv2", routerId: "198.51.100.30", priority: 1, state: "Full", deadTime: 36, interface: "wg1", address: "10.10.0.30" }], routes: [{ version: "ospfv2", prefix: "198.51.100.20/32", summary: "via 10.10.0.20", details: "metric 20" }, { version: "ospfv2", prefix: "198.51.100.30/32", summary: "via 10.10.0.30", details: "metric 30" }], routesTruncated: false } })) }) });
});
await page.goto(`${baseURL}/`);
await page.locator("#authPassword").fill("playwright-admin-password");
await page.locator("#authSubmitButton").click();
await page.locator("#appMain").waitFor({ state: "visible" });
await page.screenshot({ path: new URL("ebgp-overview.png", outputDir).pathname, fullPage: true });
await page.locator("#resourceWorkspaceTab").click();
await page.waitForTimeout(500);
await page.screenshot({ path: new URL("resource-management.png", outputDir).pathname, fullPage: true });
await page.locator("#resourceDirectsTab").click();
await page.waitForTimeout(500);
await page.screenshot({ path: new URL("resource-direct-kernel.png", outputDir).pathname, fullPage: true });
await page.locator("#ibgpWorkspaceTab").click();
await page.locator("#ibgpWorkspace").waitFor({ state: "visible" });
await page.waitForTimeout(1200);
await page.screenshot({ path: new URL("ibgp-domain.png", outputDir).pathname, fullPage: true });
await page.locator("#ospfWorkspaceTab").click();
await page.locator("#ospfWorkspace").waitFor({ state: "visible" });
await page.waitForTimeout(1200);
await page.screenshot({ path: new URL("ospf-domain.png", outputDir).pathname, fullPage: true });
await page.locator(".runtime-summary-card").first().click();
await page.locator("#ospfRuntimeDialogTitle").waitFor({ state: "visible" });
await page.waitForTimeout(300);
console.log("OSPF runtime dialog:", (await page.locator(".ospf-runtime-dialog").innerText()).slice(0, 500));
await page.locator(".ospf-runtime-dialog").screenshot({ path: new URL("ospf-runtime-details.png", outputDir).pathname });
await browser.close();
if (pageErrors.length) throw new Error(`页面运行时错误：${pageErrors.join("; ")}`);
console.log("Screenshots written to", new URL("../docs/images/", import.meta.url).pathname);
