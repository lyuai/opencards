package main

import "testing"

func TestGuandanDeckHasTwoCompleteDecks(t *testing.T) {
	deck := guandanDeck()
	if len(deck) != 108 {
		t.Fatalf("deck size = %d, want 108", len(deck))
	}
	ids := map[string]bool{}
	faces := map[string]int{}
	for _, card := range deck {
		if ids[card.ID] {
			t.Fatalf("duplicate card id %q", card.ID)
		}
		ids[card.ID] = true
		faces[card.Rank+card.Suit]++
	}
	for face, count := range faces {
		if count != 2 {
			t.Fatalf("face %s count = %d, want 2", face, count)
		}
	}
}

func TestGuandanDealGivesEachSeatTwentySevenCards(t *testing.T) {
	deal, err := newGuandanDeal()
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, seat := range seatOrder {
		if len(deal.Hands[seat]) != 27 {
			t.Fatalf("%s hand = %d cards, want 27", seat, len(deal.Hands[seat]))
		}
		for _, card := range deal.Hands[seat] {
			if seen[card.ID] {
				t.Fatalf("card %q dealt twice", card.ID)
			}
			seen[card.ID] = true
		}
	}
	if len(seen) != 108 {
		t.Fatalf("dealt %d unique cards, want 108", len(seen))
	}
}
