package main

import (
	"encoding/json"
	"fmt"
	"strings"
)

type legalChoice struct {
	Label   string
	CardIDs []string
	Combo   *combination
}

func (store *gameStore) coachingRequest(id string) (coachRequest, map[string]legalChoice, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	session, ok := store.sessions[id]
	if !ok {
		return coachRequest{}, nil, errGameNotFound
	}
	if session.seat() != "south" || session.over() {
		return coachRequest{}, nil, fmt.Errorf("coaching is only available on your turn")
	}
	choices := legalChoicesFor(session.Hands["south"], session.Current)
	lookup := make(map[string]legalChoice, len(choices))
	labels := make([]string, 0, len(choices))
	for _, choice := range choices {
		lookup[choice.Label] = choice
		labels = append(labels, choice.Label)
	}
	state := map[string]any{"levelRank": "2", "yourSeat": "south", "partner": "north", "turnOrder": seatOrder, "yourHand": session.Hands["south"], "remainingCounts": map[string]int{"south": len(session.Hands["south"]), "east": len(session.Hands["east"]), "north": len(session.Hands["north"]), "west": len(session.Hands["west"])}, "currentPlay": session.Current, "history": session.History}
	encoded, _ := json.Marshal(state)
	return coachRequest{
		Game: "guandan", Ruleset: "competition-draft-2026-09", Position: string(encoded), LegalActions: labels,
		PlayerGoal: "Maximize partnership finishing position. Explain the tactical reason in Chinese.",
		Evidence:   guandanStrategyEvidence,
	}, lookup, nil
}

var guandanStrategyEvidence = []strategyEvidence{
	{ID: "guandan.strategy.ai-policy", Claim: "Treat Guandan as a long-horizon, imperfect-information cooperative-competitive game; compare actions by expected partnership outcome rather than immediate cards shed.", EvidenceType: "peer-reviewed reinforcement-learning result and public benchmark", Applicability: "all decisions, especially openings with many legal actions", Limitations: "the language model is not the trained SDMC policy and must report uncertainty"},
	{ID: "guandan.strategy.control-economy", Claim: "Bombs and straight flushes are tempo/control resources. Spending one requires comparing the future control lost with the concrete gain now; retaining one is not an absolute rule.", EvidenceType: "expert strategy literature, retained as a hypothesis for evaluation", Applicability: "opening and midgame decisions involving bombs or straight flushes", Limitations: "endgame, partner rescue, or immediate opponent threat can justify early use"},
	{ID: "guandan.strategy.tom-history", Claim: "Use action history and remaining counts to infer likely partner/opponent needs, while keeping hidden-card conclusions explicitly uncertain.", EvidenceType: "published LLM Theory-of-Mind Guandan study", Applicability: "after observable actions provide behavioral evidence", Limitations: "an inference is not knowledge of hidden cards"},
}

func legalChoicesFor(hand []playingCard, current *gameAction) []legalChoice {
	all := generateCandidates(hand)
	choices := []legalChoice{}
	seen := map[string]bool{}
	typeCount := map[string]int{}
	for _, cards := range all {
		combo, err := classify(cards)
		if err != nil || current != nil && !beats(combo, *current.Combination) {
			continue
		}
		ids := idsOf(cards)
		key := strings.Join(ids, ",")
		if seen[key] || typeCount[combo.Type] >= 3 {
			continue
		}
		seen[key] = true
		typeCount[combo.Type]++
		label := fmt.Sprintf("出 %s（%s）[%s]", cardNames(cards), combo.Type, key)
		copyCombo := combo
		choices = append(choices, legalChoice{Label: label, CardIDs: ids, Combo: &copyCombo})
		if len(choices) >= 19 {
			break
		}
	}
	if current != nil {
		choices = append(choices, legalChoice{Label: "不出", CardIDs: []string{}})
	}
	return choices
}

func cardNames(cards []playingCard) string {
	values := make([]string, len(cards))
	for i, card := range cards {
		values[i] = card.Rank + card.Suit
	}
	return strings.Join(values, " ")
}
