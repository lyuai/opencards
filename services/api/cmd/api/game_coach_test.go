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

func mustTake(t *testing.T, hand []playingCard, ids []string) []playingCard {
	t.Helper()
	cards, err := takeCards(hand, ids)
	if err != nil {
		t.Fatal(err)
	}
	return cards
}
