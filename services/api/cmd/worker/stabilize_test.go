package main

import (
	"testing"
	"time"
)

func TestStableCandidatesSelectsFrameBeforeQuietPeriod(t *testing.T) {
	input := []observation{
		{Sequence: 0, TimestampMS: 0},
		{Sequence: 1, TimestampMS: 1000},
		{Sequence: 2, TimestampMS: 2000},
		{Sequence: 3, TimestampMS: 7000},
		{Sequence: 4, TimestampMS: 8000},
	}
	got := stableCandidates(input, 3*time.Second)
	if len(got) != 1 || got[0].Sequence != 2 {
		t.Fatalf("got %#v, want sequence 2", got)
	}
}

func TestStableCandidatesReturnsEmptySlice(t *testing.T) {
	got := stableCandidates(nil, 3*time.Second)
	if got == nil || len(got) != 0 {
		t.Fatalf("got %#v, want non-nil empty slice", got)
	}
}
