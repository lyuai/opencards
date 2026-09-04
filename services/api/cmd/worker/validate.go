package main

import "time"

type timelineValidation struct {
	Status             string `json:"status"`
	StableCandidates   int    `json:"stableCandidates"`
	PotentialJumpCuts  int    `json:"potentialJumpCuts"`
	LongestGapMS       int64  `json:"longestGapMs"`
	ContinuousReplayOK bool   `json:"continuousReplayOk"`
	Message            string `json:"message"`
}

func validateTimeline(candidates []observation, jumpCutThreshold time.Duration) timelineValidation {
	validation := timelineValidation{
		Status: "requires_review", StableCandidates: len(candidates),
		Message: "Stable visual states are not yet proof of a continuous play sequence.",
	}
	threshold := jumpCutThreshold.Milliseconds()
	for index := 1; index < len(candidates); index++ {
		gap := candidates[index].TimestampMS - candidates[index-1].TimestampMS
		if gap > validation.LongestGapMS {
			validation.LongestGapMS = gap
		}
		if gap >= threshold {
			validation.PotentialJumpCuts++
		}
	}
	validation.ContinuousReplayOK = len(candidates) > 0 && validation.PotentialJumpCuts == 0
	if validation.ContinuousReplayOK {
		validation.Status = "timeline_continuous"
		validation.Message = "No large timeline gaps detected; card and turn validation is still required."
	} else if validation.PotentialJumpCuts > 0 {
		validation.Status = "edited_or_incomplete"
		validation.Message = "Large timeline gaps indicate edits, replays, or missing play transitions."
	}
	return validation
}
