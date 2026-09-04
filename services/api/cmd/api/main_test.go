package main

import (
	"net/http/httptest"
	"testing"
)

func TestWriteJSON(t *testing.T) {
	r := httptest.NewRecorder()
	writeJSON(r, 200, map[string]string{"status": "ok"})
	if got := r.Header().Get("Content-Type"); got != "application/json" { t.Fatalf("content type = %q", got) }
	if got := r.Body.String(); got != "{\"status\":\"ok\"}\n" { t.Fatalf("body = %q", got) }
}

func TestValidateCoachRequest(t *testing.T) {
	valid := coachRequest{Game: "guandan", Ruleset: "draft", Position: "lead", LegalActions: []string{"pass", "pair"}}
	if err := validateCoachRequest(valid); err != nil { t.Fatalf("valid request: %v", err) }
	valid.LegalActions = []string{"pass"}
	if err := validateCoachRequest(valid); err == nil { t.Fatal("expected too-few-actions error") }
}

func TestDemoCoachUsesLegalAction(t *testing.T) {
	request := coachRequest{LegalActions: []string{"pair of aces", "single joker"}}
	result, err := (demoCoach{}).Coach(t.Context(), request)
	if err != nil { t.Fatal(err) }
	if result.Recommendation != "pair of aces" { t.Fatalf("recommendation = %q", result.Recommendation) }
}
