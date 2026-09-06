package main

import (
	"context"
	"strings"
	"testing"
)

func TestLoadConfigRequiresAllValues(t *testing.T) {
	t.Setenv("BIRDBOX_CONTROLLER_URL", "")
	t.Setenv("BIRDBOX_NODE_ID", "")
	t.Setenv("BIRDBOX_AGENT_TOKEN", "")
	if _, err := loadConfig(); err == nil {
		t.Fatal("expected missing config error")
	}
}

func TestExecuteTaskRejectsUnsupportedMethod(t *testing.T) {
	result := executeTask(context.Background(), task{TaskID: "t", NodeID: "n", Method: "unknown", Params: map[string]any{}})
	if result.OK || !strings.Contains(result.Stderr, "unsupported") {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestExecuteTaskRejectsNulCommand(t *testing.T) {
	result := executeTask(context.Background(), task{TaskID: "t", NodeID: "n", Method: "legacy.exec", Params: map[string]any{"command": "echo\x00bad"}})
	if result.OK || result.Code != "INVALID_COMMAND" {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestExecuteTaskRejectsUnsafeIPRule(t *testing.T) {
	result := executeTask(context.Background(), task{TaskID: "t", NodeID: "n", Method: "network.ip_rules", Params: map[string]any{
		"removeRules": []any{},
		"rules": []any{map[string]any{"priority": float64(10000), "source": "10.0.0.0/8;uname", "table": float64(200)}},
	}})
	if result.OK || result.Code != "INVALID_IP_RULE" {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestExecuteTaskRejectsReservedIPRuleTable(t *testing.T) {
	result := executeTask(context.Background(), task{TaskID: "t", NodeID: "n", Method: "network.ip_rules", Params: map[string]any{
		"removeRules": []any{},
		"rules": []any{map[string]any{"priority": float64(10000), "source": "10.0.0.0/8", "table": float64(254)}},
	}})
	if result.OK || result.Code != "INVALID_IP_RULE" {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestExecuteTaskRejectsGatewayRuleOutsideMainTable(t *testing.T) {
	result := executeTask(context.Background(), task{TaskID: "t", NodeID: "n", Method: "network.ip_rules", Params: map[string]any{
		"removeRules": []any{},
		"rules": []any{map[string]any{"priority": float64(9000), "destination": "192.0.2.1/32", "table": float64(200)}},
	}})
	if result.OK || result.Code != "INVALID_IP_RULE" {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestExecuteTaskRejectsUnsafeGatewayDestination(t *testing.T) {
	result := executeTask(context.Background(), task{TaskID: "t", NodeID: "n", Method: "network.ip_rules", Params: map[string]any{
		"removeRules": []any{},
		"rules": []any{map[string]any{"priority": float64(9000), "destination": "192.0.2.1;uname/32", "table": float64(254)}},
	}})
	if result.OK || result.Code != "INVALID_IP_RULE" {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestExecuteTaskRejectsMismatchedIPRuleKind(t *testing.T) {
	result := executeTask(context.Background(), task{TaskID: "t", NodeID: "n", Method: "network.ip_rules", Params: map[string]any{
		"removeRules": []any{},
		"rules": []any{map[string]any{"priority": float64(9000), "kind": "gateway", "source": "192.0.2.0/24", "table": float64(200)}},
	}})
	if result.OK || result.Code != "INVALID_IP_RULE" {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestExecuteTaskRejectsMappedIPv6IPRule(t *testing.T) {
	result := executeTask(context.Background(), task{TaskID: "t", NodeID: "n", Method: "network.ip_rules", Params: map[string]any{
		"removeRules": []any{},
		"rules": []any{map[string]any{"priority": float64(10000), "source": "::ffff:192.0.2.0/120", "table": float64(200)}},
	}})
	if result.OK || result.Code != "INVALID_IP_RULE" {
		t.Fatalf("unexpected result: %#v", result)
	}
}
