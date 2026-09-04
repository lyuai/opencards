package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type coacher interface {
	Coach(context.Context, coachRequest) (coachResponse, error)
}

func newCoachClient() coacher {
	apiKey := firstEnv("AI_API_KEY", "OPENAI_API_KEY")
	if apiKey == "" {
		return demoCoach{}
	}

	model := firstEnv("AI_MODEL", "OPENAI_MODEL")
	if model == "" {
		model = "gpt-5.5"
	}
	baseURL := firstEnv("AI_BASE_URL", "OPENAI_BASE_URL")
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	provider := os.Getenv("AI_PROVIDER")
	if provider == "" {
		provider = "openai"
	}
	protocol := os.Getenv("AI_PROTOCOL")
	if protocol == "chat-completions" {
		return &chatCompletionsClient{
			apiKey:     apiKey,
			endpoint:   strings.TrimRight(baseURL, "/") + "/chat/completions",
			model:      model,
			provider:   provider,
			httpClient: &http.Client{Timeout: 90 * time.Second},
		}
	}

	return &responsesClient{
		apiKey:     apiKey,
		endpoint:   strings.TrimRight(baseURL, "/") + "/responses",
		model:      model,
		provider:   provider,
		httpClient: &http.Client{Timeout: 50 * time.Second},
	}
}

const coachInstructions = "You are an evidence-bound card-game coach. Choose recommendation exactly from legalActions. Never invent visible or hidden state. Explain tradeoffs briefly. citationIds may only contain guandan.rules.overview or guandan.strategy.model. Treat the ruleset as a research prototype and surface uncertainty."

func firstEnv(names ...string) string {
	for _, name := range names {
		if value := os.Getenv(name); value != "" {
			return value
		}
	}
	return ""
}

type demoCoach struct{}

func (demoCoach) Coach(_ context.Context, request coachRequest) (coachResponse, error) {
	return coachResponse{
		Recommendation: request.LegalActions[0],
		Rationale:      "Demo mode chose the first engine-verified action. Configure an OpenAI-compatible Responses API for contextual comparison and explanation.",
		Alternatives:   request.LegalActions[1:],
		Assumptions:    []string{"The submitted legal-action list is authoritative.", "Hidden cards are unknown."},
		Confidence:     .25,
		CitationIDs:    []string{"guandan.rules.overview"},
		Provider:       "demo",
	}, nil
}

type responsesClient struct {
	apiKey     string
	endpoint   string
	model      string
	provider   string
	httpClient *http.Client
}

type responsesAPIResponse struct {
	Output []struct {
		Type    string `json:"type"`
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	} `json:"output"`
}

func (c *responsesClient) Coach(ctx context.Context, request coachRequest) (coachResponse, error) {
	input, err := json.Marshal(request)
	if err != nil {
		return coachResponse{}, err
	}
	payload := map[string]any{
		"model":        c.model,
		"store":        false,
		"instructions": coachInstructions,
		"input":        string(input),
		"text": map[string]any{"format": map[string]any{
			"type": "json_schema", "name": "coach_analysis", "strict": true,
			"schema": coachOutputSchema(),
		}},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return coachResponse{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		return coachResponse{}, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	res, err := c.httpClient.Do(req)
	if err != nil {
		return coachResponse{}, err
	}
	defer res.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if err != nil {
		return coachResponse{}, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return coachResponse{}, fmt.Errorf("provider status %d: %s", res.StatusCode, responseBody)
	}

	var response responsesAPIResponse
	if err := json.Unmarshal(responseBody, &response); err != nil {
		return coachResponse{}, err
	}
	for _, output := range response.Output {
		if output.Type != "message" {
			continue
		}
		for _, content := range output.Content {
			if content.Type != "output_text" {
				continue
			}
			var result coachResponse
			if err := json.Unmarshal([]byte(content.Text), &result); err != nil {
				return coachResponse{}, err
			}
			if !contains(request.LegalActions, result.Recommendation) {
				return coachResponse{}, fmt.Errorf("provider selected a non-legal action")
			}
			result.Provider = c.provider
			return result, nil
		}
	}
	return coachResponse{}, fmt.Errorf("response contained no output text")
}

type chatCompletionsClient struct {
	apiKey     string
	endpoint   string
	model      string
	provider   string
	httpClient *http.Client
}

type chatCompletionsResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func (c *chatCompletionsClient) Coach(ctx context.Context, request coachRequest) (coachResponse, error) {
	input, err := json.Marshal(request)
	if err != nil {
		return coachResponse{}, err
	}
	payload := map[string]any{
		"model": c.model,
		"messages": []map[string]string{
			{"role": "system", "content": coachInstructions + " Return only one JSON object with keys recommendation, rationale, alternatives, assumptions, confidence, and citationIds. Do not use Markdown fences."},
			{"role": "user", "content": string(input)},
		},
		"response_format": map[string]string{"type": "json_object"},
		"temperature":     0.2,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return coachResponse{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint, bytes.NewReader(body))
	if err != nil {
		return coachResponse{}, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	res, err := c.httpClient.Do(req)
	if err != nil {
		return coachResponse{}, err
	}
	defer res.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if err != nil {
		return coachResponse{}, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return coachResponse{}, fmt.Errorf("provider status %d: %s", res.StatusCode, responseBody)
	}
	var response chatCompletionsResponse
	if err := json.Unmarshal(responseBody, &response); err != nil {
		return coachResponse{}, err
	}
	if len(response.Choices) == 0 {
		return coachResponse{}, fmt.Errorf("response contained no choices")
	}
	content := strings.TrimSpace(response.Choices[0].Message.Content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	var result coachResponse
	if err := json.Unmarshal([]byte(strings.TrimSpace(content)), &result); err != nil {
		return coachResponse{}, fmt.Errorf("decode coaching JSON: %w", err)
	}
	if !contains(request.LegalActions, result.Recommendation) {
		return coachResponse{}, fmt.Errorf("provider selected a non-legal action")
	}
	result.Provider = c.provider
	return result, nil
}

func contains(items []string, target string) bool {
	for _, item := range items {
		if item == target {
			return true
		}
	}
	return false
}

func coachOutputSchema() map[string]any {
	return map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             []string{"recommendation", "rationale", "alternatives", "assumptions", "confidence", "citationIds"},
		"properties": map[string]any{
			"recommendation": map[string]any{"type": "string"},
			"rationale":      map[string]any{"type": "string"},
			"alternatives":   map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
			"assumptions":    map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
			"confidence":     map[string]any{"type": "number", "minimum": 0, "maximum": 1},
			"citationIds":    map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
		},
	}
}
