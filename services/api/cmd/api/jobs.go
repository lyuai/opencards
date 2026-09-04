package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type importSource struct {
	Provider string `json:"provider"`
	URL      string `json:"url"`
}

type importRequest struct {
	Game   string       `json:"game"`
	Source importSource `json:"source"`
}

type job struct {
	ID         string         `json:"id"`
	Game       string         `json:"game"`
	Source     importSource   `json:"source"`
	Status     string         `json:"status"`
	Stage      string         `json:"stage"`
	Progress   float64        `json:"progress"`
	Message    string         `json:"message,omitempty"`
	WorkerID   string         `json:"workerId,omitempty"`
	LeaseUntil *time.Time     `json:"leaseUntil,omitempty"`
	Result     map[string]any `json:"result,omitempty"`
	CreatedAt  time.Time      `json:"createdAt"`
	UpdatedAt  time.Time      `json:"updatedAt"`
}

type jobStore struct {
	mu   sync.Mutex
	path string
	jobs map[string]*job
}

func newJobStore(path string) (*jobStore, error) {
	s := &jobStore{path: path, jobs: map[string]*job{}}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	if len(data) > 0 && json.Unmarshal(data, &s.jobs) != nil {
		return nil, errors.New("decode job store")
	}
	return s, nil
}

func (s *jobStore) create(request importRequest) (*job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	item := &job{ID: newID("job"), Game: request.Game, Source: request.Source, Status: "queued", Stage: "queued", CreatedAt: now, UpdatedAt: now}
	s.jobs[item.ID] = item
	return cloneJob(item), s.save()
}

func (s *jobStore) get(id string) (*job, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.jobs[id]
	return cloneJob(item), ok
}

func (s *jobStore) lease(workerID string) (*job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now().UTC()
	for _, item := range s.jobs {
		if item.Status != "queued" && !(item.Status == "leased" && item.LeaseUntil != nil && item.LeaseUntil.Before(now)) {
			continue
		}
		leaseUntil := now.Add(45 * time.Second)
		item.Status, item.Stage, item.WorkerID, item.LeaseUntil, item.UpdatedAt = "leased", "starting", workerID, &leaseUntil, now
		return cloneJob(item), s.save()
	}
	return nil, nil
}

func (s *jobStore) update(id, workerID, status, stage, message string, progress float64, result map[string]any) (*job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	item, ok := s.jobs[id]
	if !ok {
		return nil, os.ErrNotExist
	}
	if item.WorkerID != workerID {
		return nil, errors.New("job lease belongs to another worker")
	}
	now := time.Now().UTC()
	if status != "" {
		item.Status = status
	}
	if stage != "" {
		item.Stage = stage
	}
	item.Message, item.Progress, item.UpdatedAt = message, progress, now
	if status == "leased" {
		leaseUntil := now.Add(45 * time.Second)
		item.LeaseUntil = &leaseUntil
	}
	if result != nil {
		item.Result = result
		item.LeaseUntil = nil
	}
	return cloneJob(item), s.save()
}

func (s *jobStore) save() error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s.jobs, "", "  ")
	if err != nil {
		return err
	}
	temporary := s.path + ".tmp"
	if err := os.WriteFile(temporary, data, 0o600); err != nil {
		return err
	}
	return os.Rename(temporary, s.path)
}

func cloneJob(item *job) *job {
	if item == nil {
		return nil
	}
	copy := *item
	return &copy
}

func newID(prefix string) string {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		return prefix + "-" + time.Now().UTC().Format("20060102150405")
	}
	return prefix + "-" + hex.EncodeToString(bytes)
}
