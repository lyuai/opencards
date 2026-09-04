package main

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// downloadAndSample is the preferred ingestion path. It only asks yt-dlp for
// media that the source exposes to the current machine; authenticated or
// protected sources fall back to browser capture.
func downloadAndSample(item *job, dataDir string, heartbeat func(string)) (captureResult, error) {
	parsed, err := url.Parse(item.Source.URL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return captureResult{}, fmt.Errorf("unsupported source URL")
	}
	directory := filepath.Join(dataDir, "captures", item.ID)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return captureResult{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Minute)
	defer cancel()
	cacheDirectory := filepath.Join(dataDir, "media-cache")
	if err := os.MkdirAll(cacheDirectory, 0o700); err != nil {
		return captureResult{}, err
	}
	cacheKey := fmt.Sprintf("%x", sha256.Sum256([]byte(parsed.String())))
	cachedMedia := filepath.Join(cacheDirectory, cacheKey+".mp4")
	media := filepath.Join(directory, "source.mp4")
	if _, statErr := os.Stat(cachedMedia); statErr == nil {
		heartbeat("Reusing cached source media")
		if err := linkOrCopy(cachedMedia, media); err != nil {
			return captureResult{}, err
		}
	} else {
		outputTemplate := filepath.Join(directory, "source.%(ext)s")
		download := exec.CommandContext(ctx, "yt-dlp", "--no-playlist", "--no-progress", "--no-warnings",
			"--format", "bv*[height<=1080]+ba/b[height<=1080]", "--merge-output-format", "mp4",
			"--output", outputTemplate, item.Source.URL)
		if output, runErr := runWithHeartbeat(download, heartbeat); runErr != nil {
			return captureResult{}, fmt.Errorf("yt-dlp: %w: %s", runErr, strings.TrimSpace(string(output)))
		}
		media, err = firstMatch(filepath.Join(directory, "source.*"))
		if err != nil {
			return captureResult{}, err
		}
		if err := linkOrCopy(media, cachedMedia); err != nil {
			return captureResult{}, fmt.Errorf("cache source media: %w", err)
		}
	}

	framesDirectory := filepath.Join(directory, "frames")
	if err := os.MkdirAll(framesDirectory, 0o700); err != nil {
		return captureResult{}, err
	}
	framePattern := filepath.Join(framesDirectory, "frame-%06d.jpg")
	sample := exec.CommandContext(ctx, "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", media,
		"-vf", "fps=1,scale=960:-2", "-q:v", "4", framePattern)
	if output, runErr := runWithHeartbeat(sample, heartbeat); runErr != nil {
		return captureResult{}, fmt.Errorf("ffmpeg: %w: %s", runErr, strings.TrimSpace(string(output)))
	}

	paths, _ := filepath.Glob(filepath.Join(framesDirectory, "frame-*.jpg"))
	sort.Strings(paths)
	observations := make([]observation, 0, len(paths)/2)
	var previous []uint8
	for index, path := range paths {
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			continue
		}
		signature, signatureErr := tableSignature(data)
		if signatureErr != nil {
			continue
		}
		change := signatureDifference(previous, signature)
		if len(previous) > 0 && change < 6 {
			_ = os.Remove(path)
			continue
		}
		previous = signature
		observations = append(observations, observation{
			Sequence: len(observations), TimestampMS: int64(index) * 1000,
			Evidence: filepath.Join("frames", filepath.Base(path)), Confidence: 1, ChangeScore: change,
		})
	}
	if len(observations) == 0 {
		return captureResult{}, fmt.Errorf("download produced no usable frames")
	}
	return captureResult{Directory: directory, Observations: observations}, nil
}

func linkOrCopy(source, destination string) error {
	if source == destination {
		return nil
	}
	if _, err := os.Stat(destination); err == nil {
		return nil
	}
	if err := os.Link(source, destination); err == nil {
		return nil
	}
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	output, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	if _, err = io.Copy(output, input); err != nil {
		_ = output.Close()
		_ = os.Remove(destination)
		return err
	}
	return output.Close()
}

func runWithHeartbeat(cmd *exec.Cmd, heartbeat func(string)) ([]byte, error) {
	type commandResult struct {
		output []byte
		err    error
	}
	result := make(chan commandResult, 1)
	go func() {
		output, err := cmd.CombinedOutput()
		result <- commandResult{output: output, err: err}
	}()
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case completed := <-result:
			return completed.output, completed.err
		case <-ticker.C:
			heartbeat("Downloading and sampling source locally")
		}
	}
}

func firstMatch(pattern string) (string, error) {
	matches, err := filepath.Glob(pattern)
	if err != nil || len(matches) == 0 {
		return "", fmt.Errorf("downloaded media file not found")
	}
	sort.Strings(matches)
	for _, match := range matches {
		if !strings.HasSuffix(match, ".part") && !strings.HasSuffix(match, ".ytdl") {
			return match, nil
		}
	}
	return "", fmt.Errorf("download did not finish")
}
