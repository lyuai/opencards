package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type game struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

type coachRequest struct {
	Game         string   `json:"game"`
	Ruleset      string   `json:"ruleset"`
	Position     string   `json:"position"`
	LegalActions []string `json:"legalActions"`
	PlayerGoal   string   `json:"playerGoal"`
}
type coachResponse struct {
	Recommendation string   `json:"recommendation"`
	Rationale      string   `json:"rationale"`
	Alternatives   []string `json:"alternatives"`
	Assumptions    []string `json:"assumptions"`
	Confidence     float64  `json:"confidence"`
	CitationIDs    []string `json:"citationIds"`
	Provider       string   `json:"provider"`
}
type feedbackRequest struct {
	RecommendationID string `json:"recommendationId"`
	Verdict          string `json:"verdict"`
	Comment          string `json:"comment"`
	SuggestedAction  string `json:"suggestedAction"`
}
type feedbackStore struct {
	mu    sync.Mutex
	items []feedbackRequest
}

func main() {
	mux := http.NewServeMux()
	feedback := &feedbackStore{}
	client := newCoachClient()
	dataDirectory := os.Getenv("OPENCARDS_DATA_DIR")
	if dataDirectory == "" {
		dataDirectory = "data"
	}
	jobs, err := newJobStore(filepath.Join(dataDirectory, "jobs.json"))
	if err != nil {
		log.Fatalf("open job store: %v", err)
	}
	games, err := newGameStore(filepath.Join(dataDirectory, "games.json"))
	if err != nil {
		log.Fatalf("open game store: %v", err)
	}
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /v1/games", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"games": []game{
			{ID: "guandan", Name: "掼蛋", Status: "research"},
			{ID: "kards", Name: "KARDS", Status: "planned"},
		}})
	})
	mux.HandleFunc("POST /v1/games/guandan/deals", func(w http.ResponseWriter, _ *http.Request) {
		deal, err := newGuandanDeal()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not shuffle deck")
			return
		}
		session, err := games.create(deal)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not persist game")
			return
		}
		writeJSON(w, http.StatusCreated, session.view())
	})
	mux.HandleFunc("POST /v1/games/guandan/deals/{id}/actions", func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			CardIDs []string `json:"cardIds"`
			Pass    bool     `json:"pass"`
		}
		if err := decodeJSON(r, &request); err != nil {
			writeError(w, http.StatusBadRequest, "invalid action")
			return
		}
		view, err := games.act(r.PathValue("id"), "south", request.CardIDs, request.Pass)
		if err != nil {
			if errors.Is(err, errGameNotFound) {
				writeError(w, http.StatusNotFound, err.Error())
				return
			}
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, view)
	})
	mux.HandleFunc("POST /v1/games/guandan/deals/{id}/coach", func(w http.ResponseWriter, r *http.Request) {
		request, choices, err := games.coachingRequest(r.PathValue("id"))
		if err != nil {
			if errors.Is(err, errGameNotFound) {
				writeError(w, http.StatusNotFound, err.Error())
			} else {
				writeError(w, http.StatusConflict, err.Error())
			}
			return
		}
		if _, demo := client.(demoCoach); demo {
			writeError(w, http.StatusServiceUnavailable, "real AI provider is not configured")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()
		result, err := client.Coach(ctx, request)
		if err != nil {
			log.Printf("game coach: %v", err)
			writeError(w, http.StatusBadGateway, "AI coach provider unavailable")
			return
		}
		choice, ok := choices[result.Recommendation]
		if !ok {
			writeError(w, http.StatusBadGateway, "AI selected an invalid action")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"provider": result.Provider, "recommendation": result.Recommendation, "cardIds": choice.CardIDs, "combination": choice.Combo, "rationale": result.Rationale, "alternatives": result.Alternatives, "assumptions": result.Assumptions, "confidence": result.Confidence})
	})
	mux.HandleFunc("POST /v1/imports", func(w http.ResponseWriter, r *http.Request) {
		var request importRequest
		if err := decodeJSON(r, &request); err != nil || request.Game == "" || request.Source.Provider == "" || request.Source.URL == "" {
			writeError(w, http.StatusBadRequest, "game, source.provider, and source.url are required")
			return
		}
		item, err := jobs.create(request)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not persist import")
			return
		}
		writeJSON(w, http.StatusAccepted, item)
	})
	mux.HandleFunc("GET /v1/imports/{id}", func(w http.ResponseWriter, r *http.Request) {
		item, ok := jobs.get(r.PathValue("id"))
		if !ok {
			writeError(w, http.StatusNotFound, "import not found")
			return
		}
		writeJSON(w, http.StatusOK, item)
	})
	mux.HandleFunc("POST /v1/workers/register", func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			InstallationID string   `json:"installationId"`
			Capabilities   []string `json:"capabilities"`
		}
		if err := decodeJSON(r, &request); err != nil || request.InstallationID == "" {
			writeError(w, http.StatusBadRequest, "installationId is required")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"workerId": "worker-" + request.InstallationID, "leaseSeconds": 45})
	})
	mux.HandleFunc("POST /v1/jobs/lease", func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			WorkerID string `json:"workerId"`
		}
		if err := decodeJSON(r, &request); err != nil || request.WorkerID == "" {
			writeError(w, http.StatusBadRequest, "workerId is required")
			return
		}
		item, err := jobs.lease(request.WorkerID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not lease job")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"job": item})
	})
	mux.HandleFunc("POST /v1/jobs/{id}/heartbeat", func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			WorkerID string  `json:"workerId"`
			Stage    string  `json:"stage"`
			Message  string  `json:"message"`
			Progress float64 `json:"progress"`
		}
		if err := decodeJSON(r, &request); err != nil {
			writeError(w, http.StatusBadRequest, "invalid heartbeat")
			return
		}
		item, err := jobs.update(r.PathValue("id"), request.WorkerID, "leased", request.Stage, request.Message, request.Progress, nil)
		if err != nil {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, item)
	})
	mux.HandleFunc("POST /v1/jobs/{id}/complete", func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			WorkerID string         `json:"workerId"`
			Result   map[string]any `json:"result"`
		}
		if err := decodeJSON(r, &request); err != nil {
			writeError(w, http.StatusBadRequest, "invalid result")
			return
		}
		item, err := jobs.update(r.PathValue("id"), request.WorkerID, "completed", "completed", "Capture and local recognition complete", 1, request.Result)
		if err != nil {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, item)
	})
	mux.HandleFunc("POST /v1/coach", func(w http.ResponseWriter, r *http.Request) {
		var request coachRequest
		if err := decodeJSON(r, &request); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := validateCoachRequest(request); err != nil {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
		defer cancel()
		result, err := client.Coach(ctx, request)
		if err != nil {
			log.Printf("coach: %v", err)
			writeError(w, http.StatusBadGateway, "coach provider unavailable")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": "coach-" + time.Now().UTC().Format("20060102T150405.000000000"), "result": result})
	})
	mux.HandleFunc("POST /v1/feedback", func(w http.ResponseWriter, r *http.Request) {
		var request feedbackRequest
		if err := decodeJSON(r, &request); err != nil || request.RecommendationID == "" || request.Comment == "" {
			writeError(w, http.StatusBadRequest, "recommendationId and comment are required")
			return
		}
		feedback.mu.Lock()
		feedback.items = append(feedback.items, request)
		feedback.mu.Unlock()
		writeJSON(w, http.StatusAccepted, map[string]string{"status": "queued_for_review"})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	server := &http.Server{Addr: ":" + port, Handler: cors(mux), ReadHeaderTimeout: 5 * time.Second}
	log.Printf("OpenCards API listening on %s", server.Addr)
	log.Fatal(server.ListenAndServe())
}

func decodeJSON(r *http.Request, target any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}
func validateCoachRequest(request coachRequest) error {
	if request.Game == "" || request.Ruleset == "" || strings.TrimSpace(request.Position) == "" {
		return &validationError{"game, ruleset, and position are required"}
	}
	if len(request.LegalActions) < 2 || len(request.LegalActions) > 20 {
		return &validationError{"provide between 2 and 20 legal actions"}
	}
	for _, action := range request.LegalActions {
		if strings.TrimSpace(action) == "" {
			return &validationError{"legal actions cannot be empty"}
		}
	}
	return nil
}

type validationError struct{ message string }

func (e *validationError) Error() string { return e.message }
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := os.Getenv("WEB_ORIGIN")
		if origin == "" {
			origin = "http://localhost:3000"
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("encode response: %v", err)
	}
}
