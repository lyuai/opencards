package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

type coacher interface { Coach(context.Context, coachRequest) (coachResponse, error) }

func newCoachClient() coacher {
	if os.Getenv("OPENAI_API_KEY") == "" { return demoCoach{} }
	model := os.Getenv("OPENAI_MODEL"); if model == "" { model = "gpt-5.5" }
	return &openAIClient{apiKey: os.Getenv("OPENAI_API_KEY"), model: model, httpClient: &http.Client{Timeout: 50 * time.Second}}
}

type demoCoach struct{}
func (demoCoach) Coach(_ context.Context, request coachRequest) (coachResponse, error) { return coachResponse{Recommendation: request.LegalActions[0], Rationale: "Demo mode chose the first engine-verified action. Add OPENAI_API_KEY for contextual comparison and explanation.", Alternatives: request.LegalActions[1:], Assumptions: []string{"The submitted legal-action list is authoritative.", "Hidden cards are unknown."}, Confidence: .25, CitationIDs: []string{"guandan.rules.overview"}, Provider: "demo"}, nil }

type openAIClient struct { apiKey string; model string; httpClient *http.Client }
type responsesAPIResponse struct { Output []struct { Type string `json:"type"`; Content []struct { Type string `json:"type"`; Text string `json:"text"` } `json:"content"` } `json:"output"` }

func (c *openAIClient) Coach(ctx context.Context, request coachRequest) (coachResponse, error) {
	input, err := json.Marshal(request); if err != nil { return coachResponse{}, err }
	payload := map[string]any{"model": c.model, "store": false, "instructions": "You are an evidence-bound card-game coach. Choose recommendation exactly from legalActions. Never invent visible or hidden state. Explain tradeoffs briefly. citationIds may only contain guandan.rules.overview or guandan.strategy.model. Treat the ruleset as a research prototype and surface uncertainty.", "input": string(input), "text": map[string]any{"format": map[string]any{"type": "json_schema", "name": "coach_analysis", "strict": true, "schema": coachOutputSchema()}}}
	body, err := json.Marshal(payload); if err != nil { return coachResponse{}, err }
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/responses", bytes.NewReader(body)); if err != nil { return coachResponse{}, err }
	req.Header.Set("Authorization", "Bearer "+c.apiKey); req.Header.Set("Content-Type", "application/json")
	res, err := c.httpClient.Do(req); if err != nil { return coachResponse{}, err }; defer res.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(res.Body, 2<<20)); if err != nil { return coachResponse{}, err }
	if res.StatusCode < 200 || res.StatusCode >= 300 { return coachResponse{}, fmt.Errorf("OpenAI status %d: %s", res.StatusCode, responseBody) }
	var response responsesAPIResponse; if err := json.Unmarshal(responseBody, &response); err != nil { return coachResponse{}, err }
	for _, output := range response.Output { if output.Type != "message" { continue }; for _, content := range output.Content { if content.Type != "output_text" { continue }; var result coachResponse; if err := json.Unmarshal([]byte(content.Text), &result); err != nil { return coachResponse{}, err }; if !contains(request.LegalActions, result.Recommendation) { return coachResponse{}, fmt.Errorf("provider selected a non-legal action") }; result.Provider = "openai"; return result, nil } }
	return coachResponse{}, fmt.Errorf("response contained no output text")
}

func contains(items []string, target string) bool { for _, item := range items { if item == target { return true } }; return false }
func coachOutputSchema() map[string]any { return map[string]any{"type": "object", "additionalProperties": false, "required": []string{"recommendation", "rationale", "alternatives", "assumptions", "confidence", "citationIds", "provider"}, "properties": map[string]any{"recommendation": map[string]any{"type": "string"}, "rationale": map[string]any{"type": "string"}, "alternatives": map[string]any{"type": "array", "items": map[string]any{"type": "string"}}, "assumptions": map[string]any{"type": "array", "items": map[string]any{"type": "string"}}, "confidence": map[string]any{"type": "number", "minimum": 0, "maximum": 1}, "citationIds": map[string]any{"type": "array", "items": map[string]any{"type": "string"}}, "provider": map[string]any{"type": "string", "enum": []string{"openai"}}}} }
