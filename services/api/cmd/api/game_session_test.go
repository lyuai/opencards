package main

import "testing"

func TestHumanPlayRunsAIUntilHumanTurn(t *testing.T) {
	deal, err := newGuandanDeal()
	if err != nil {
		t.Fatal(err)
	}
	store, err := newGameStore(t.TempDir() + "/games.json")
	if err != nil {
		t.Fatal(err)
	}
	session, err := store.create(deal)
	if err != nil {
		t.Fatal(err)
	}
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
	store, _ := newGameStore(t.TempDir() + "/games.json")
	session, _ := store.create(deal)
	if _, err := store.act(session.ID, "south", nil, true); err == nil {
		t.Fatal("expected leading pass error")
	}
}

func TestGameSurvivesStoreRestart(t *testing.T) {
	path := t.TempDir() + "/games.json"
	store, _ := newGameStore(path)
	deal, _ := newGuandanDeal()
	session, err := store.create(deal)
	if err != nil {
		t.Fatal(err)
	}
	reloaded, err := newGameStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.sessions[session.ID] == nil || len(reloaded.sessions[session.ID].Hands["south"]) != 27 {
		t.Fatal("persisted game was not restored")
	}
}
