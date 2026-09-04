package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"
)

type game struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /v1/games", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"games": []game{
			{ID: "guandan", Name: "掼蛋", Status: "research"},
			{ID: "kards", Name: "KARDS", Status: "planned"},
		}})
	})

	port := os.Getenv("PORT")
	if port == "" { port = "8080" }
	server := &http.Server{Addr: ":" + port, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	log.Printf("OpenCards API listening on %s", server.Addr)
	log.Fatal(server.ListenAndServe())
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil { log.Printf("encode response: %v", err) }
}
