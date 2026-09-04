package main

import "testing"

func TestGameCoachOnlyReceivesEngineVerifiedChoices(t *testing.T) {
	store, _ := newGameStore(t.TempDir() + "/games.json")
	deal, _ := newGuandanDeal()
	session, _ := store.create(deal)
	request, lookup, err := store.coachingRequest(session.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(request.LegalActions) < 2 || len(request.LegalActions) > 20 {
		t.Fatalf("legal choices = %d", len(request.LegalActions))
	}
	for _, label := range request.LegalActions {
		choice, ok := lookup[label]
		if !ok {
			t.Fatalf("missing lookup for %q", label)
		}
		if _, err := classify(mustTake(t, session.Hands["south"], choice.CardIDs)); err != nil {
			t.Fatalf("invalid choice %q: %v", label, err)
		}
	}
}

func TestCoachKeepsStrategicChoicesLegalAndSuppliesEvidence(t *testing.T) {
	hand := []playingCard{
		{ID: "3c", Rank: "3", Suit: "♣"}, {ID: "4c", Rank: "4", Suit: "♣"}, {ID: "5c", Rank: "5", Suit: "♣"}, {ID: "6c", Rank: "6", Suit: "♣"}, {ID: "7c", Rank: "7", Suit: "♣"},
		{ID: "8a", Rank: "8", Suit: "♣"}, {ID: "8b", Rank: "8", Suit: "♦"}, {ID: "8c", Rank: "8", Suit: "♥"}, {ID: "8d", Rank: "8", Suit: "♠"},
	}
	foundControlChoice := false
	for _, choice := range legalChoicesFor(hand, nil) {
		if choice.Combo != nil && choice.Combo.Type == "straight_flush" {
			foundControlChoice = true
		}
	}
	if !foundControlChoice {
		t.Fatal("a legal straight flush was removed by coaching policy")
	}
	if len(guandanStrategyEvidence) < 3 {
		t.Fatal("coach request lacks sourced strategic evidence")
	}
}

func mustTake(t *testing.T, hand []playingCard, ids []string) []playingCard {
	t.Helper()
	cards, err := takeCards(hand, ids)
	if err != nil {
		t.Fatal(err)
	}
	return cards
}
