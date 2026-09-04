package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

type observation struct {
	Sequence    int     `json:"sequence"`
	TimestampMS int64   `json:"timestampMs"`
	Evidence    string  `json:"evidence"`
	Confidence  float64 `json:"confidence"`
	ChangeScore float64 `json:"changeScore"`
	Text        string  `json:"text,omitempty"`
}

type captureResult struct {
	Directory    string        `json:"directory"`
	Observations []observation `json:"observations"`
}

type captureSession struct {
	Job           *job
	Directory     string
	Observations  []observation
	LastSignature []uint8
	done          chan captureResult
}

type captureCoordinator struct {
	mu       sync.Mutex
	api      string
	workerID string
	dataDir  string
	current  *captureSession
}

func newCaptureCoordinator(api, workerID, dataDir string) *captureCoordinator {
	return &captureCoordinator{api: api, workerID: workerID, dataDir: dataDir}
}

func (c *captureCoordinator) begin(item *job) *captureSession {
	c.mu.Lock()
	defer c.mu.Unlock()
	directory := filepath.Join(c.dataDir, "captures", item.ID)
	_ = os.MkdirAll(directory, 0o700)
	c.current = &captureSession{Job: item, Directory: directory, done: make(chan captureResult, 1)}
	return c.current
}

func (c *captureCoordinator) cancel(session *captureSession) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.current == session {
		c.current = nil
	}
}

func (c *captureCoordinator) serve(address string) error {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeCaptureJSON(w, 200, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /v1/capture/session", c.session)
	mux.HandleFunc("POST /v1/capture/frames", c.frame)
	mux.HandleFunc("POST /v1/capture/complete", c.complete)
	return http.ListenAndServe(address, captureCORS(mux))
}

func (c *captureCoordinator) session(w http.ResponseWriter, _ *http.Request) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.current == nil {
		writeCaptureJSON(w, 200, map[string]any{"session": nil})
		return
	}
	writeCaptureJSON(w, 200, map[string]any{"session": map[string]any{"jobId": c.current.Job.ID, "sourceUrl": c.current.Job.Source.URL, "frames": len(c.current.Observations)}})
}

func (c *captureCoordinator) frame(w http.ResponseWriter, r *http.Request) {
	timestampMS, err := strconv.ParseInt(r.URL.Query().Get("timestampMs"), 10, 64)
	if err != nil || timestampMS < 0 {
		http.Error(w, "invalid timestampMs", 400)
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 8<<20))
	if err != nil {
		http.Error(w, "invalid frame", 400)
		return
	}
	signature, err := frameSignature(data)
	if err != nil {
		http.Error(w, "unsupported image", 400)
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.current == nil {
		http.Error(w, "no active capture", 409)
		return
	}
	changeScore := signatureDifference(c.current.LastSignature, signature)
	if len(c.current.LastSignature) > 0 && changeScore < 6 {
		writeCaptureJSON(w, 202, map[string]any{"accepted": false, "changeScore": changeScore})
		return
	}
	c.current.LastSignature = signature
	sequence := len(c.current.Observations)
	name := fmt.Sprintf("frame-%06d-%010d.jpg", sequence, timestampMS)
	if err := os.WriteFile(filepath.Join(c.current.Directory, name), data, 0o600); err != nil {
		http.Error(w, "could not save frame", 500)
		return
	}
	c.current.Observations = append(c.current.Observations, observation{Sequence: sequence, TimestampMS: timestampMS, Evidence: name, Confidence: 1, ChangeScore: changeScore})
	if sequence%10 == 0 {
		_ = post(c.api+"/v1/jobs/"+c.current.Job.ID+"/heartbeat", map[string]any{"workerId": c.workerID, "stage": "capturing", "progress": .1, "message": fmt.Sprintf("Captured %d observations", sequence+1)}, nil)
	}
	writeCaptureJSON(w, 202, map[string]any{"accepted": true, "sequence": sequence, "changeScore": changeScore})
}

func frameSignature(data []byte) ([]uint8, error) {
	imageValue, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	bounds := imageValue.Bounds()
	signature := make([]uint8, 16*16)
	for y := 0; y < 16; y++ {
		for x := 0; x < 16; x++ {
			px := bounds.Min.X + x*bounds.Dx()/16
			py := bounds.Min.Y + y*bounds.Dy()/16
			r, g, b, _ := imageValue.At(px, py).RGBA()
			signature[y*16+x] = uint8((299*r + 587*g + 114*b) / 1000 >> 8)
		}
	}
	return signature, nil
}

func signatureDifference(previous, current []uint8) float64 {
	if len(previous) != len(current) || len(current) == 0 {
		return 100
	}
	var total int
	for index := range current {
		difference := int(current[index]) - int(previous[index])
		if difference < 0 {
			difference = -difference
		}
		total += difference
	}
	return float64(total) / float64(len(current))
}

func (c *captureCoordinator) complete(w http.ResponseWriter, _ *http.Request) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.current == nil {
		http.Error(w, "no active capture", 409)
		return
	}
	result := captureResult{Directory: c.current.Directory, Observations: append([]observation(nil), c.current.Observations...)}
	manifest, _ := json.MarshalIndent(result, "", "  ")
	_ = os.WriteFile(filepath.Join(c.current.Directory, "observations.json"), manifest, 0o600)
	c.current.done <- result
	c.current = nil
	writeCaptureJSON(w, 200, result)
}

func captureCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && !strings.HasPrefix(origin, "chrome-extension://") {
			http.Error(w, "capture bridge only accepts the OpenCards browser extension", http.StatusForbidden)
			return
		}
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeCaptureJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
