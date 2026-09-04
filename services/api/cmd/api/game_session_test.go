package main

import "testing"

func TestHumanPlayRunsAIUntilHumanTurn(t *testing.T) {
	deal, err := newGuandanDeal()
	if err != nil {
		t.Fatal(err)
	}
	store := newGameStore()
	session := store.create(deal)
	cardID := session.Hands["south"][0].ID
	view, err := store.act(session.ID, "south", []string{cardID}, false)
	if err != nil {
		t.Fatal(err)
	}
	if got := view["turn"]; got != "south" {
		t.Fatalf("turn = %v, want south", got)
	}
	if len(session.History) < 4 {
		t.Fatalf("history has %d actions, want AI round", len(session.History))
	}
	if len(session.Hands["south"]) != 26 {
		t.Fatalf("south has %d cards, want 26", len(session.Hands["south"]))
	}
}

func TestCannotPassWhenLeading(t *testing.T) {
	deal, _ := newGuandanDeal()
	store := newGameStore()
	session := store.create(deal)
	if _, err := store.act(session.ID, "south", nil, true); err == nil {
		t.Fatal("expected leading pass error")
	}
}
