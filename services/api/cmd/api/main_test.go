package main

import (
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestWriteJSON(t *testing.T) {
	r := httptest.NewRecorder()
	writeJSON(r, 200, map[string]string{"status": "ok"})
	if got := r.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("content type = %q", got)
	}
	if got := r.Body.String(); got != "{\"status\":\"ok\"}\n" {
		t.Fatalf("body = %q", got)
	}
}

func TestValidateCoachRequest(t *testing.T) {
	valid := coachRequest{Game: "guandan", Ruleset: "draft", Position: "lead", LegalActions: []string{"pass", "pair"}}
	if err := validateCoachRequest(valid); err != nil {
		t.Fatalf("valid request: %v", err)
	}
	valid.LegalActions = []string{"pass"}
	if err := validateCoachRequest(valid); err == nil {
		t.Fatal("expected too-few-actions error")
	}
}

func TestDemoCoachUsesLegalAction(t *testing.T) {
	request := coachRequest{LegalActions: []string{"pair of aces", "single joker"}}
	result, err := (demoCoach{}).Coach(t.Context(), request)
	if err != nil {
		t.Fatal(err)
	}
	if result.Recommendation != "pair of aces" {
		t.Fatalf("recommendation = %q", result.Recommendation)
	}
}

func TestProviderConfiguration(t *testing.T) {
	for _, name := range []string{"AI_API_KEY", "OPENAI_API_KEY", "AI_BASE_URL", "OPENAI_BASE_URL", "AI_MODEL", "OPENAI_MODEL", "AI_PROVIDER", "AI_PROTOCOL"} {
		t.Setenv(name, "")
	}
	t.Setenv("AI_API_KEY", "test-key")
	t.Setenv("AI_BASE_URL", "https://provider.example/v1/")
	t.Setenv("AI_MODEL", "provider-model")
	t.Setenv("AI_PROVIDER", "example")

	client, ok := newCoachClient().(*responsesClient)
	if !ok {
		t.Fatal("expected Responses API client")
	}
	if client.endpoint != "https://provider.example/v1/responses" {
		t.Fatalf("endpoint = %q", client.endpoint)
	}
	if client.model != "provider-model" || client.provider != "example" {
		t.Fatalf("unexpected provider configuration: %#v", client)
	}
	if os.Getenv("AI_API_KEY") != "test-key" {
		t.Fatal("test environment changed unexpectedly")
	}
}

func TestChatCompletionsConfiguration(t *testing.T) {
	t.Setenv("AI_API_KEY", "test-key")
	t.Setenv("AI_BASE_URL", "https://provider.example/v1/")
	t.Setenv("AI_MODEL", "provider-model")
	t.Setenv("AI_PROVIDER", "example")
	t.Setenv("AI_PROTOCOL", "chat-completions")
	client, ok := newCoachClient().(*chatCompletionsClient)
	if !ok {
		t.Fatal("expected Chat Completions client")
	}
	if client.endpoint != "https://provider.example/v1/chat/completions" {
		t.Fatalf("endpoint = %q", client.endpoint)
	}
}

func TestJobLeaseAndCompletion(t *testing.T) {
	store, err := newJobStore(filepath.Join(t.TempDir(), "jobs.json"))
	if err != nil {
		t.Fatal(err)
	}
	created, err := store.create(importRequest{Game: "guandan", Source: importSource{Provider: "bilibili", URL: "https://www.bilibili.com/video/BVtest"}})
	if err != nil {
		t.Fatal(err)
	}
	leased, err := store.lease("worker-local")
	if err != nil {
		t.Fatal(err)
	}
	if leased == nil || leased.ID != created.ID || leased.WorkerID != "worker-local" {
		t.Fatalf("unexpected lease: %#v", leased)
	}
	completed, err := store.update(created.ID, "worker-local", "completed", "completed", "done", 1, map[string]any{"events": []any{}})
	if err != nil {
		t.Fatal(err)
	}
	if completed.Status != "completed" || completed.Progress != 1 {
		t.Fatalf("unexpected completion: %#v", completed)
	}
}
