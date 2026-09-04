package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type job struct {
	ID     string `json:"id"`
	Game   string `json:"game"`
	Source struct {
		Provider string `json:"provider"`
		URL      string `json:"url"`
	} `json:"source"`
}

func main() {
	api := env("OPENCARDS_API_URL", "http://localhost:8080")
	installationID, err := loadInstallationID(env("OPENCARDS_WORKER_DATA_DIR", "data/worker"))
	if err != nil {
		log.Fatal(err)
	}
	workerID, err := register(api, installationID)
	if err != nil {
		log.Fatalf("register worker: %v", err)
	}
	log.Printf("worker %s registered", workerID)

	for {
		item, err := lease(api, workerID)
		if err != nil {
			log.Printf("lease: %v", err)
		} else if item != nil {
			process(api, workerID, item)
		}
		if os.Getenv("OPENCARDS_WORKER_ONCE") == "1" {
			return
		}
		time.Sleep(3 * time.Second)
	}
}

func process(api, workerID string, item *job) {
	log.Printf("processing %s: %s", item.ID, item.Source.URL)
	_ = post(api+"/v1/jobs/"+item.ID+"/heartbeat", map[string]any{"workerId": workerID, "stage": "inspecting", "progress": .25, "message": "Source accepted by local worker"}, nil)
	sourceID := item.Source.URL
	if marker := strings.Index(sourceID, "BV"); marker >= 0 {
		sourceID = strings.FieldsFunc(sourceID[marker:], func(r rune) bool { return r == '/' || r == '?' })[0]
	}
	result := map[string]any{
		"schemaVersion": "1.0.0", "game": item.Game,
		"provenance":       map[string]any{"sourceType": "video", "sourceId": sourceID, "sourceUrl": item.Source.URL, "inspectedAt": time.Now().UTC()},
		"extractionStatus": "browser_capture_pending",
		"message":          "The worker protocol is active. Authenticated browser capture is the next adapter stage; no play events were fabricated.",
		"events":           []any{},
	}
	if err := post(api+"/v1/jobs/"+item.ID+"/complete", map[string]any{"workerId": workerID, "result": result}, nil); err != nil {
		log.Printf("complete %s: %v", item.ID, err)
	}
}

func register(api, installationID string) (string, error) {
	var response struct {
		WorkerID string `json:"workerId"`
	}
	err := post(api+"/v1/workers/register", map[string]any{"installationId": installationID, "capabilities": []string{"bilibili-browser", "guandan"}}, &response)
	return response.WorkerID, err
}

func lease(api, workerID string) (*job, error) {
	var response struct {
		Job *job `json:"job"`
	}
	err := post(api+"/v1/jobs/lease", map[string]string{"workerId": workerID}, &response)
	return response.Job, err
}

func post(url string, payload, target any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	response, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("status %d: %s", response.StatusCode, data)
	}
	if target != nil {
		return json.Unmarshal(data, target)
	}
	return nil
}

func loadInstallationID(directory string) (string, error) {
	path := filepath.Join(directory, "installation-id")
	if data, err := os.ReadFile(path); err == nil {
		return strings.TrimSpace(string(data)), nil
	}
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return "", err
	}
	value := make([]byte, 12)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	id := hex.EncodeToString(value)
	return id, os.WriteFile(path, []byte(id), 0o600)
}

func env(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
