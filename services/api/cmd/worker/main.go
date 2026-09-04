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
	workerData := env("OPENCARDS_WORKER_DATA_DIR", "data/worker")
	installationID, err := loadInstallationID(workerData)
	if err != nil {
		log.Fatal(err)
	}
	workerID, err := register(api, installationID)
	if err != nil {
		log.Fatalf("register worker: %v", err)
	}
	log.Printf("worker %s registered", workerID)
	coordinator := newCaptureCoordinator(api, workerID, workerData)
	go func() {
		if err := coordinator.serve(env("OPENCARDS_CAPTURE_ADDR", "127.0.0.1:8787")); err != nil {
			log.Fatalf("capture bridge: %v", err)
		}
	}()

	for {
		item, err := lease(api, workerID)
		if err != nil {
			log.Printf("lease: %v", err)
		} else if item != nil {
			process(api, workerID, item, coordinator)
		}
		if os.Getenv("OPENCARDS_WORKER_ONCE") == "1" {
			return
		}
		time.Sleep(3 * time.Second)
	}
}

func process(api, workerID string, item *job, coordinator *captureCoordinator) {
	log.Printf("processing %s: %s", item.ID, item.Source.URL)
	downloadHeartbeat := func(message string) {
		_ = post(api+"/v1/jobs/"+item.ID+"/heartbeat", map[string]any{"workerId": workerID, "stage": "downloading", "progress": .1, "message": message}, nil)
	}
	downloadHeartbeat("Downloading publicly accessible media")
	capture, downloadErr := downloadAndSample(item, coordinator.dataDir, downloadHeartbeat)
	if downloadErr != nil {
		log.Printf("direct download unavailable for %s: %v; falling back to browser", item.ID, downloadErr)
		_ = post(api+"/v1/jobs/"+item.ID+"/heartbeat", map[string]any{"workerId": workerID, "stage": "waiting_for_browser", "progress": .05, "message": "Direct download unavailable; open the video and click OpenCards Capture"}, nil)
		session := coordinator.begin(item)
		heartbeat := time.NewTicker(20 * time.Second)
		timeout := time.NewTimer(30 * time.Minute)
		defer heartbeat.Stop()
		defer timeout.Stop()
		for capture.Directory == "" {
			select {
			case capture = <-session.done:
			case <-heartbeat.C:
				_ = post(api+"/v1/jobs/"+item.ID+"/heartbeat", map[string]any{"workerId": workerID, "stage": "waiting_for_browser", "progress": .05, "message": "Waiting for authenticated browser capture"}, nil)
			case <-timeout.C:
				coordinator.cancel(session)
				log.Printf("capture timeout for %s", item.ID)
				return
			}
		}
	}
	_ = post(api+"/v1/jobs/"+item.ID+"/heartbeat", map[string]any{"workerId": workerID, "stage": "recognizing", "progress": .65, "message": fmt.Sprintf("Preparing %d table-change candidates", len(capture.Observations))}, nil)
	stable := stableCandidates(capture.Observations, 3*time.Second)
	sourceID := item.Source.URL
	if marker := strings.Index(sourceID, "BV"); marker >= 0 {
		sourceID = strings.FieldsFunc(sourceID[marker:], func(r rune) bool { return r == '/' || r == '?' })[0]
	}
	result := map[string]any{
		"schemaVersion": "1.0.0", "game": item.Game,
		"provenance":          map[string]any{"sourceType": "video", "sourceId": sourceID, "sourceUrl": item.Source.URL, "inspectedAt": time.Now().UTC()},
		"extractionStatus":    "observations_captured",
		"message":             fmt.Sprintf("Captured %d timestamped observations. Replay events require vision and rules validation.", len(capture.Observations)),
		"recognitionStrategy": "table-roi-change-detection",
		"observations":        capture.Observations,
		"stableCandidates":    stable,
		"metrics": map[string]any{
			"changedFrames":  len(capture.Observations),
			"stableFrames":   len(stable),
			"paidModelCalls": 0,
		},
		"evidenceDirectory": capture.Directory,
		"events":            []any{},
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
