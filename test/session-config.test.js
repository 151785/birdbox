import test from "node:test";
import assert from "node:assert/strict";

import { extractBgpProtocolConfig } from "../packages/contracts/src/config-snippet.ts";

test("extracts only the selected BGP protocol block", () => {
  const config = `protocol device birdbox_device {\n}\n\nprotocol bgp edge_one {\n  local 192.0.2.1 port 179 as 65001;\n  ipv4 {\n    import all;\n  };\n}\n\nprotocol bgp edge_two {\n  local 192.0.2.1 port 180 as 65001;\n}`;
  assert.equal(
    extractBgpProtocolConfig(config, "edge_one"),
    "protocol bgp edge_one {\n  local 192.0.2.1 port 179 as 65001;\n  ipv4 {\n    import all;\n  };\n}",
  );
  assert.equal(extractBgpProtocolConfig(config, "missing"), null);
});

test("handles braces inside quoted values and comments", () => {
  const config = `protocol bgp edge_one {\n  description \"route { edge }\"; # ignored }\n  ipv6 { export none; };\n}`;
  assert.match(extractBgpProtocolConfig(config, "edge_one") ?? "", /description/);
  assert.match(extractBgpProtocolConfig(config, "edge_one") ?? "", /ipv6/);
});
