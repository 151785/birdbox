package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

var version = "0.1.0"

func main() {
	log.SetFlags(log.LstdFlags | log.LUTC)
	if os.Geteuid() != 0 {
		log.Fatal("birdbox-agent must run as root")
	}
	cfg, err := loadConfig()
	if err != nil { log.Fatal(err) }
	client := NewClient(cfg)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	backoff := time.Second
	for ctx.Err() == nil {
		if err := client.Register(ctx, version); err != nil {
			if errors.Is(err, ErrUnauthorized) { log.Fatal(err) }
			log.Printf("controller unavailable: %v", err)
			if !sleepContext(ctx, backoff) { return }
			if backoff < 30*time.Second { backoff *= 2 }
			continue
		}
		backoff = time.Second
		if err := client.RunPoll(ctx); err != nil {
			if errors.Is(err, ErrUnauthorized) { log.Fatal(err) }
			log.Printf("polling stopped: %v", err)
			if !sleepContext(ctx, backoff) { return }
			if backoff < 30*time.Second { backoff *= 2 }
		}
	}
}

func sleepContext(ctx context.Context, duration time.Duration) bool {
	t := time.NewTimer(duration); defer t.Stop()
	select { case <-ctx.Done(): return false; case <-t.C: return true }
}

type Config struct { ControllerURL, NodeID, Token string }

func loadConfig() (Config, error) {
	get := func(name string) string { return strings.TrimSpace(os.Getenv(name)) }
	cfg := Config{ControllerURL: strings.TrimRight(get("BIRDBOX_CONTROLLER_URL"), "/"), NodeID: get("BIRDBOX_NODE_ID"), Token: get("BIRDBOX_AGENT_TOKEN")}
	if cfg.ControllerURL == "" || cfg.NodeID == "" || cfg.Token == "" { return cfg, fmt.Errorf("BIRDBOX_CONTROLLER_URL, BIRDBOX_NODE_ID and BIRDBOX_AGENT_TOKEN are required") }
	if !strings.HasPrefix(cfg.ControllerURL, "http://") && !strings.HasPrefix(cfg.ControllerURL, "https://") { return cfg, fmt.Errorf("BIRDBOX_CONTROLLER_URL must use http or https") }
	return cfg, nil
}

func jsonString(v any) string { b, _ := json.Marshal(v); return string(b) }
