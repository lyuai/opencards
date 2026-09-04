package main

import (
	"testing"
	"time"
)

func TestValidateTimelineFlagsJumpCuts(t *testing.T) {
	input := []observation{{TimestampMS: 1000}, {TimestampMS: 5000}, {TimestampMS: 50000}}
	got := validateTimeline(input, 30*time.Second)
	if got.Status != "edited_or_incomplete" || got.PotentialJumpCuts != 1 || got.ContinuousReplayOK {
		t.Fatalf("unexpected validation: %#v", got)
	}
}

func TestValidateTimelineAllowsCloseCandidates(t *testing.T) {
	input := []observation{{TimestampMS: 1000}, {TimestampMS: 5000}, {TimestampMS: 9000}}
	got := validateTimeline(input, 30*time.Second)
	if got.Status != "timeline_continuous" || !got.ContinuousReplayOK {
		t.Fatalf("unexpected validation: %#v", got)
	}
}
