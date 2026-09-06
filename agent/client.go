package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

var ErrUnauthorized = errors.New("agent credentials rejected")

type Client struct { cfg Config; http *http.Client }
type registration struct { NodeID string `json:"nodeId"`; Token string `json:"token"`; AgentVersion string `json:"agentVersion"`; ProtocolVersion int `json:"protocolVersion"`; Capabilities []string `json:"capabilities"`; Platform string `json:"platform"`; Architecture string `json:"architecture"`; Hostname string `json:"hostname"` }
type task struct { TaskID string `json:"taskId"`; NodeID string `json:"nodeId"`; Method string `json:"method"`; Params map[string]any `json:"params"`; DeadlineAt string `json:"deadlineAt"` }
type pollResponse struct { Task *task `json:"task"` }
type result struct { TaskID string `json:"taskId"`; NodeID string `json:"nodeId"`; OK bool `json:"ok"`; Stdout string `json:"stdout"`; Stderr string `json:"stderr"`; Code any `json:"code,omitempty"`; Result any `json:"result,omitempty"` }

func NewClient(cfg Config) *Client { return &Client{cfg: cfg, http: &http.Client{Timeout: 45 * time.Second}} }

func (c *Client) request(ctx context.Context, method, path string, body any, response any) error {
	payload, err := json.Marshal(body); if err != nil { return err }
	req, err := http.NewRequestWithContext(ctx, method, c.cfg.ControllerURL+path, bytes.NewReader(payload)); if err != nil { return err }
	req.Header.Set("Content-Type", "application/json"); req.Header.Set("Authorization", "Bearer "+c.cfg.Token)
	resp, err := c.http.Do(req); if err != nil { return err }; defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if resp.StatusCode == http.StatusUnauthorized { return ErrUnauthorized }
	if resp.StatusCode < 200 || resp.StatusCode >= 300 { return fmt.Errorf("controller returned %s: %s", resp.Status, strings.TrimSpace(string(data))) }
	if response != nil && len(data) > 0 { if err := json.Unmarshal(data, response); err != nil { return err } }
	return nil
}

func (c *Client) Register(ctx context.Context, version string) error {
	var out map[string]any
	return c.request(ctx, http.MethodPost, "/api/agent/register", registration{
		NodeID: c.cfg.NodeID, Token: c.cfg.Token, AgentVersion: version, ProtocolVersion: 1,
		Capabilities: []string{"system.info", "legacy.exec", "bird.inspect", "bird.validate", "bird.stage", "bird.apply", "bird.rollback", "bird.protocol", "bird.routes", "agent.self_upgrade"},
		Platform: runtime.GOOS, Architecture: runtime.GOARCH, Hostname: hostname(),
	}, &out)
}

func hostname() string { h, _ := os.Hostname(); return h }

func (c *Client) RunPoll(ctx context.Context) error {
	var response pollResponse
	if err := c.request(ctx, http.MethodPost, "/api/agent/tasks/poll", map[string]any{"nodeId": c.cfg.NodeID}, &response); err != nil { return err }
	if response.Task == nil { return nil }
	r := executeTask(ctx, *response.Task)
	return c.request(ctx, http.MethodPost, "/api/agent/tasks/"+response.Task.TaskID+"/result", r, nil)
}

func executeTask(parent context.Context, t task) result {
	r := result{TaskID: t.TaskID, NodeID: t.NodeID}
	if t.Method == "system.info" { r.OK = true; r.Result = map[string]any{"os": runtime.GOOS, "arch": runtime.GOARCH, "hostname": hostname(), "agentVersion": version}; return r }
	if t.Method == "agent.self_upgrade" { return upgradeTask(t, r) }
	if strings.HasPrefix(t.Method, "bird.") { return birdTask(parent, t, r) }
	if t.Method != "legacy.exec" { r.Stderr = "unsupported task method: " + t.Method; r.Code = "METHOD_NOT_ALLOWED"; return r }
	command, _ := t.Params["command"].(string); if command == "" || len(command) > 256*1024 || strings.IndexByte(command, 0) >= 0 { r.Stderr = "invalid command"; r.Code = "INVALID_COMMAND"; return r }
	if input, ok := t.Params["input"].(string); ok && (len(input) > 16*1024*1024 || strings.IndexByte(input, 0) >= 0) { r.Stderr = "invalid command input"; r.Code = "INVALID_INPUT"; return r }
	timeout := 120 * time.Second; if n, ok := t.Params["timeoutMs"].(float64); ok && n >= 250 && n <= 120000 { timeout = time.Duration(n) * time.Millisecond }
	maxBuffer := int64(2 * 1024 * 1024); if n, ok := t.Params["maxBuffer"].(float64); ok && n >= 1024 && n <= 8*1024*1024 { maxBuffer = int64(n) }
	ctx, cancel := context.WithTimeout(parent, timeout); defer cancel()
	cmd := exec.CommandContext(ctx, "/bin/sh", "-c", command)
	if input, ok := t.Params["input"].(string); ok { cmd.Stdin = strings.NewReader(input) }
	stdout, stderr, err := runLimited(cmd, maxBuffer)
	r.Stdout, r.Stderr = stdout, stderr; r.OK = err == nil; if ctx.Err() != nil { r.OK = false; r.Code = "TIMEOUT" } else if err != nil { if exit, ok := err.(*exec.ExitError); ok { r.Code = exit.ExitCode() } else { r.Code = "EXEC_FAILED" } }
	return r
}

func birdTask(parent context.Context, t task, r result) result {
	socket, _ := t.Params["socketPath"].(string); if socket == "" || !filepath.IsAbs(socket) { r.Stderr = "socketPath must be an absolute path"; r.Code = "INVALID_SOCKET"; return r }
	args := []string{"-s", socket}
	switch t.Method {
	case "bird.inspect": args = append(args, "show", "status")
	case "bird.protocol": args = append(args, "show", "protocols", "all")
	case "bird.routes": args = append(args, "show", "route", "all")
	case "bird.validate": args = append(args, "configure", "check")
	case "bird.apply": args = append(args, "configure")
	case "bird.rollback": args = append(args, "configure", "undo")
	case "bird.stage":
		path, _ := t.Params["generatedConfigPath"].(string); content, _ := t.Params["config"].(string)
		if !filepath.IsAbs(path) || len(content) > 16*1024*1024 || strings.IndexByte(path, 0) >= 0 { r.Stderr = "invalid stage path or config"; r.Code = "INVALID_STAGE"; return r }
		if err := os.MkdirAll(filepath.Dir(path), 0750); err != nil { r.Stderr = err.Error(); r.Code = "STAGE_FAILED"; return r }
		tmp, err := os.CreateTemp(filepath.Dir(path), ".birdbox-stage-*"); if err != nil { r.Stderr = err.Error(); r.Code = "STAGE_FAILED"; return r }
		tmpName := tmp.Name(); defer os.Remove(tmpName); if _, err = tmp.WriteString(content); err == nil { err = tmp.Chmod(0640) }; if closeErr := tmp.Close(); err == nil { err = closeErr }; if err == nil { err = os.Rename(tmpName, path) }; if err != nil { r.Stderr = err.Error(); r.Code = "STAGE_FAILED"; return r }
		args = append(args, "configure", "check")
	default: r.Stderr = "unsupported task method: " + t.Method; r.Code = "METHOD_NOT_ALLOWED"; return r
	}
	ctx, cancel := context.WithTimeout(parent, 120*time.Second); defer cancel(); cmd := exec.CommandContext(ctx, "birdc", args...); stdout, stderr, err := runLimited(cmd, 8*1024*1024); r.Stdout, r.Stderr, r.OK = stdout, stderr, err == nil; if ctx.Err() != nil { r.OK = false; r.Code = "TIMEOUT" } else if err != nil { if exit, ok := err.(*exec.ExitError); ok { r.Code = exit.ExitCode() } else { r.Code = "EXEC_FAILED" } }; return r
}

func runLimited(cmd *exec.Cmd, max int64) (string, string, error) {
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &limitedWriter{target: &stdout, remaining: max}; cmd.Stderr = &limitedWriter{target: &stderr, remaining: max}
	err := cmd.Run(); return stdout.String(), stderr.String(), err
}
type limitedWriter struct { target *bytes.Buffer; remaining int64 }
func (w *limitedWriter) Write(p []byte) (int, error) { if w.remaining <= 0 { return len(p), nil }; n := int64(len(p)); if n > w.remaining { n = w.remaining }; _, _ = w.target.Write(p[:n]); w.remaining -= n; return len(p), nil }

func upgradeTask(t task, r result) result {
	url, _ := t.Params["url"].(string); sha, _ := t.Params["sha256"].(string); target, _ := t.Params["targetPath"].(string); service, _ := t.Params["service"].(string)
	if url == "" || target == "" || !filepath.IsAbs(target) || strings.IndexByte(target, 0) >= 0 || len(sha) != 64 { r.Stderr = "upgrade requires an absolute targetPath, url and sha256"; r.Code = "INVALID_UPGRADE"; return r }
	if service != "" && !regexp.MustCompile(`^[A-Za-z0-9_.@-]+$`).MatchString(service) { r.Stderr = "invalid service name"; r.Code = "INVALID_UPGRADE"; return r }
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute); defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil); if err != nil { r.Stderr = err.Error(); r.Code = "DOWNLOAD_FAILED"; return r }
	resp, err := http.DefaultClient.Do(req); if err != nil { r.Stderr = err.Error(); r.Code = "DOWNLOAD_FAILED"; return r }; defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 { r.Stderr = resp.Status; r.Code = "DOWNLOAD_FAILED"; return r }
	dir := filepath.Dir(target); tmp, err := os.CreateTemp(dir, ".birdbox-agent-*"); if err != nil { r.Stderr = err.Error(); r.Code = "INSTALL_FAILED"; return r }; tmpName := tmp.Name(); defer os.Remove(tmpName)
	h := sha256.New(); if _, err = io.Copy(io.MultiWriter(tmp, h), io.LimitReader(resp.Body, 128*1024*1024)); err != nil { tmp.Close(); r.Stderr = err.Error(); r.Code = "DOWNLOAD_FAILED"; return r }; if err = tmp.Close(); err != nil { r.Stderr = err.Error(); r.Code = "INSTALL_FAILED"; return r }
	if !strings.EqualFold(hex.EncodeToString(h.Sum(nil)), sha) { r.Stderr = "sha256 mismatch"; r.Code = "CHECKSUM_FAILED"; return r }
	if err = os.Chmod(tmpName, 0755); err != nil { r.Stderr = err.Error(); r.Code = "INSTALL_FAILED"; return r }; if err = os.Rename(tmpName, target); err != nil { r.Stderr = err.Error(); r.Code = "INSTALL_FAILED"; return r }
	if service != "" { _ = exec.Command("systemctl", "restart", service).Run() }
	r.OK = true; r.Result = map[string]any{"version": t.Params["version"]}; return r
}
