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
	return coachRequest{Game: "guandan", Ruleset: "competition-draft-2026-09", Position: string(encoded), LegalActions: labels, PlayerGoal: "Maximize partnership finishing position. Explain the tactical reason in Chinese."}, lookup, nil
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
