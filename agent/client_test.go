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
