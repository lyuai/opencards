package main

import "time"

// stableCandidates keeps the last changed frame before the table remains
// unchanged for minStable. Those frames are substantially more useful for card
// recognition than intermediate hand-motion frames.
func stableCandidates(observations []observation, minStable time.Duration) []observation {
	if len(observations) == 0 {
		return []observation{}
	}
	minimumGap := minStable.Milliseconds()
	stable := make([]observation, 0, len(observations)/4)
	for index := 0; index+1 < len(observations); index++ {
		if observations[index+1].TimestampMS-observations[index].TimestampMS >= minimumGap {
			stable = append(stable, observations[index])
		}
	}
	return stable
}
