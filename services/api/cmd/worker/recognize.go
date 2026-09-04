package main

import (
	"context"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

func recognizeObservations(directory string, observations []observation) []observation {
	if len(observations) == 0 {
		return observations
	}
	workers := 4
	if len(observations) < workers {
		workers = len(observations)
	}
	indices := make(chan int)
	var group sync.WaitGroup
	for worker := 0; worker < workers; worker++ {
		group.Add(1)
		go func() {
			defer group.Done()
			for index := range indices {
				ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
				output, err := exec.CommandContext(ctx, "tesseract", filepath.Join(directory, observations[index].Evidence), "stdout", "-l", "chi_sim+eng", "--psm", "11").Output()
				cancel()
				if err == nil {
					observations[index].Text = strings.TrimSpace(string(output))
				}
			}
		}()
	}
	for index := range observations {
		indices <- index
	}
	close(indices)
	group.Wait()
	return observations
}
