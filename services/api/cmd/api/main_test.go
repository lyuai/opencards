package main

import (
	"net/http/httptest"
	"os"
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
	for _, name := range []string{"AI_API_KEY", "OPENAI_API_KEY", "AI_BASE_URL", "OPENAI_BASE_URL", "AI_MODEL", "OPENAI_MODEL", "AI_PROVIDER"} {
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
